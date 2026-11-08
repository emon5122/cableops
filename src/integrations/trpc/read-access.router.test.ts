/**
 * Read-side access, importSnapshot atomicity, removeMember scoping and
 * claimOwnership races, against a real Postgres engine (PGlite).
 */
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const pg = new PGlite();
const testDb = drizzle(pg, { schema });

vi.mock("@/db", () => ({ db: testDb }));
vi.mock("@/lib/auth", () => ({
	auth: { api: { getSession: async () => null } },
}));

const { trpcRouter } = await import("@/integrations/trpc/router");

const ALICE = "user-alice";
const BOB = "user-bob";
const MALLORY = "user-mallory";

function as(userId: string | null) {
	return trpcRouter.createCaller({
		session: null,
		userId,
		hasBearerToken: false,
	});
}

const forbidden = { code: "FORBIDDEN" };
let home: string;
let other: string;
let router: string;
let bobMemberId: string;

beforeAll(async () => {
	await migrate(testDb, { migrationsFolder: "./drizzle" });
	await testDb.insert(schema.user).values([
		{ id: ALICE, name: "Alice", email: "alice@example.test" },
		{ id: BOB, name: "Bob", email: "bob@example.test" },
		{ id: MALLORY, name: "Mallory", email: "mallory@example.test" },
	]);
	home = (await as(ALICE).workspaces.create({ name: "Home", ownerId: ALICE }))
		.id;
	other = (
		await as(MALLORY).workspaces.create({ name: "Mal", ownerId: MALLORY })
	).id;
	router = (
		await as(ALICE).devices.create({
			workspaceId: home,
			name: "Router",
			color: "#3b82f6",
			portCount: 4,
			deviceType: "managed-router",
		})
	).id;
	await as(ALICE).interfaces.upsert({
		deviceId: router,
		portNumber: 1,
		ipAddress: "192.168.1.1/24",
		ssid: "home",
		wifiPassword: "hunter2hunter2",
	});
	await as(ALICE).routes.upsert({
		deviceId: router,
		destination: "10.0.0.0/8",
		nextHop: "192.168.1.254",
	});
	await as(ALICE).annotations.create({ workspaceId: home, x: 0, y: 0 });
	bobMemberId = crypto.randomUUID();
	await testDb
		.insert(schema.workspaceMembers)
		.values({ id: bobMemberId, workspaceId: home, userId: BOB });
});

describe("read endpoints are gated on read access", () => {
	it("outsiders and anonymous callers cannot read a private workspace", async () => {
		for (const caller of [as(MALLORY), as(null)]) {
			await expect(caller.workspaces.get({ id: home })).rejects.toMatchObject(
				forbidden,
			);
			await expect(
				caller.devices.list({ workspaceId: home }),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.connections.list({ workspaceId: home }),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.annotations.list({ workspaceId: home }),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.interfaces.list({ deviceId: router }),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.interfaces.listByWorkspace({ workspaceId: home }),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.routes.list({ deviceId: router }),
			).rejects.toMatchObject(forbidden);
		}
	});

	it("owner and members read, including the interface rows", async () => {
		for (const caller of [as(ALICE), as(BOB)]) {
			expect((await caller.workspaces.get({ id: home }))?.name).toBe("Home");
			expect(await caller.devices.list({ workspaceId: home })).toHaveLength(1);
			const ifaces = await caller.interfaces.listByWorkspace({
				workspaceId: home,
			});
			expect(ifaces[0]?.wifiPassword).toBe("hunter2hunter2");
			expect(await caller.interfaces.list({ deviceId: router })).toHaveLength(
				1,
			);
			expect(await caller.routes.list({ deviceId: router })).toHaveLength(1);
		}
	});

	it("ownerless drafts stay readable by id", async () => {
		const draft = (await as(null).workspaces.create({ name: "Draft" })).id;
		expect((await as(null).workspaces.get({ id: draft }))?.name).toBe("Draft");
	});

	it("an unknown workspace id is null / not found, not a leak", async () => {
		expect(await as(MALLORY).workspaces.get({ id: "nope" })).toBeNull();
		await expect(
			as(MALLORY).devices.list({ workspaceId: "nope" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("importSnapshot is atomic", () => {
	const snap = (devices: unknown[], interfaces: unknown[]) =>
		({
			version: 1,
			exportedAt: new Date().toISOString(),
			workspace: { name: "Imported" },
			devices,
			interfaces,
			connections: [],
			routes: [],
			annotations: [],
		}) as never;
	const dev = {
		id: "d1",
		name: "SW",
		deviceType: "switch",
		color: "#000",
		portCount: 4,
		positionX: 0,
		positionY: 0,
	};

	it("a duplicate device/port in the snapshot leaves the workspace intact", async () => {
		const bad = snap(
			[dev],
			[
				{ id: "i1", deviceId: "d1", portNumber: 1, reserved: false },
				{ id: "i2", deviceId: "d1", portNumber: 1, reserved: false },
			],
		);
		await expect(
			as(ALICE).workspaces.importSnapshot({ workspaceId: home, snapshot: bad }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		const devices = await as(ALICE).devices.list({ workspaceId: home });
		expect(devices.map((d) => d.id)).toEqual([router]);
		expect(await as(ALICE).interfaces.list({ deviceId: router })).toHaveLength(
			1,
		);
		expect((await as(ALICE).workspaces.get({ id: home }))?.name).toBe("Home");
	});

	it("a failure after the deletes rolls everything back", async () => {
		/* Passes validation and the deletes, then the annotation insert fails
		   (integer out of range): the deletes must roll back. */
		const bad = {
			...(snap(
				[dev],
				[{ id: "i1", deviceId: "d1", portNumber: 1, reserved: false }],
			) as object),
			annotations: [
				{
					id: "a1",
					kind: "rect",
					x: 0,
					y: 0,
					width: 1e12,
					height: 100,
					color: "#000",
				},
			],
		} as never;
		await expect(
			as(ALICE).workspaces.importSnapshot({ workspaceId: home, snapshot: bad }),
		).rejects.toBeTruthy();
		const devices = await as(ALICE).devices.list({ workspaceId: home });
		expect(devices.map((d) => d.id)).toEqual([router]);
		expect(await as(ALICE).interfaces.list({ deviceId: router })).toHaveLength(
			1,
		);
	});

	it("a good import replaces the contents in one go", async () => {
		const good = snap(
			[dev],
			[{ id: "i1", deviceId: "d1", portNumber: 1, reserved: false }],
		);
		const res = await as(ALICE).workspaces.importSnapshot({
			workspaceId: home,
			snapshot: good,
		});
		expect(res.devicesImported).toBe(1);
		const devices = await as(ALICE).devices.list({ workspaceId: home });
		expect(devices.map((d) => d.name)).toEqual(["SW"]);
	});
});

describe("removeMember is scoped to its workspace", () => {
	it("the owner of another workspace cannot remove this workspace's member", async () => {
		/* Mallory owns `other` and passes Bob's member row of `home` */
		await as(MALLORY).workspaces.removeMember({
			workspaceId: other,
			memberId: bobMemberId,
		});
		const rows = await testDb
			.select()
			.from(schema.workspaceMembers)
			.where(eq(schema.workspaceMembers.id, bobMemberId));
		expect(rows).toHaveLength(1);
	});

	it("the real owner can remove it", async () => {
		await as(ALICE).workspaces.removeMember({
			workspaceId: home,
			memberId: bobMemberId,
		});
		const rows = await testDb
			.select()
			.from(schema.workspaceMembers)
			.where(eq(schema.workspaceMembers.id, bobMemberId));
		expect(rows).toHaveLength(0);
	});
});

describe("claimOwnership", () => {
	it("a concurrent double claim has exactly one winner", async () => {
		const draft = (await as(null).workspaces.create({ name: "Race" })).id;
		const results = await Promise.allSettled([
			as(ALICE).workspaces.claimOwnership({ workspaceId: draft }),
			as(BOB).workspaces.claimOwnership({ workspaceId: draft }),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
		const [row] = await testDb
			.select()
			.from(schema.workspaces)
			.where(eq(schema.workspaces.id, draft));
		expect([ALICE, BOB]).toContain(row?.ownerId);
	});

	it("an already-owned workspace cannot be claimed", async () => {
		await expect(
			as(BOB).workspaces.claimOwnership({ workspaceId: home }),
		).rejects.toThrow();
	});
});

describe("mutations return {success:true}", () => {
	it("delete/move shapes", async () => {
		const d = await as(ALICE).devices.create({
			workspaceId: home,
			name: "X",
			color: "#000",
			portCount: 2,
		});
		expect(
			await as(ALICE).devices.move({ id: d.id, positionX: 1, positionY: 2 }),
		).toEqual({ success: true });
		expect(await as(ALICE).devices.delete({ id: d.id })).toEqual({
			success: true,
		});
	});
});

describe("interfaces.upsert", () => {
	it("a concurrent double submit updates the same row instead of failing", async () => {
		const [a, b] = await Promise.all([
			as(ALICE).interfaces.upsert({
				deviceId: (await as(ALICE).devices.list({ workspaceId: home }))[0]!.id,
				portNumber: 2,
				alias: "a",
			}),
			as(ALICE).interfaces.upsert({
				deviceId: (await as(ALICE).devices.list({ workspaceId: home }))[0]!.id,
				portNumber: 2,
				alias: "b",
			}),
		]);
		expect(a?.id).toBe(b?.id);
	});
});
