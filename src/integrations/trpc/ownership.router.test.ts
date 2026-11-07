/**
 * Router-level ownership tests: every mutation checks that the caller may
 * edit the workspace it touches, against a real Postgres engine (PGlite).
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
const MALLORY = "user-mallory";

function as(userId: string | null) {
	return trpcRouter.createCaller({
		session: null,
		userId,
		hasBearerToken: false,
	});
}

let home: string;
let router: string;
let nas: string;
let cable: string;
let route: string;
let note: string;

beforeAll(async () => {
	await migrate(testDb, { migrationsFolder: "./drizzle" });
	await testDb.insert(schema.user).values([
		{ id: ALICE, name: "Alice", email: "alice@example.test" },
		{ id: MALLORY, name: "Mallory", email: "mallory@example.test" },
	]);
	home = (await as(ALICE).workspaces.create({ name: "Home", ownerId: ALICE }))
		.id;
	const dev = async (name: string, portCount: number) =>
		(
			await as(ALICE).devices.create({
				workspaceId: home,
				name,
				color: "#3b82f6",
				portCount,
				deviceType: "managed-router",
			})
		).id;
	router = await dev("Router", 4);
	nas = await dev("NAS", 2);
	cable = (
		await as(ALICE).connections.create({
			workspaceId: home,
			deviceAId: nas,
			portA: 1,
			deviceBId: router,
			portB: 1,
		})
	).id;
	await as(ALICE).interfaces.upsert({
		deviceId: router,
		portNumber: 1,
		ipAddress: "192.168.1.1/24",
	});
	const r = await as(ALICE).routes.upsert({
		deviceId: router,
		destination: "10.0.0.0/8",
		nextHop: "192.168.1.254",
	});
	route = r?.id ?? "";
	note = (await as(ALICE).annotations.create({ workspaceId: home, x: 0, y: 0 }))
		.id;
});

const forbidden = { code: "FORBIDDEN" };

describe("ownership checks", () => {
	it("outsiders and anonymous callers cannot change someone's workspace", async () => {
		for (const caller of [as(MALLORY), as(null)]) {
			await expect(
				caller.workspaces.update({ id: home, name: "pwned" }),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.devices.create({
					workspaceId: home,
					name: "rogue",
					color: "#000",
					portCount: 1,
				}),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.devices.update({ id: router, name: "pwned" }),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.devices.move({ id: router, positionX: 1, positionY: 1 }),
			).rejects.toMatchObject(forbidden);
			await expect(caller.devices.delete({ id: nas })).rejects.toMatchObject(
				forbidden,
			);
			await expect(
				caller.connections.create({
					workspaceId: home,
					deviceAId: nas,
					portA: 2,
					deviceBId: router,
					portB: 2,
				}),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.connections.delete({ id: cable }),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.interfaces.upsert({
					deviceId: router,
					portNumber: 2,
					alias: "x",
				}),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.routes.upsert({
					deviceId: router,
					destination: "0.0.0.0/0",
					nextHop: "192.168.1.254",
				}),
			).rejects.toMatchObject(forbidden);
			await expect(caller.routes.delete({ id: route })).rejects.toMatchObject(
				forbidden,
			);
			await expect(
				caller.annotations.create({ workspaceId: home, x: 1, y: 1 }),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.annotations.update({ id: note, label: "x" }),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.annotations.delete({ id: note }),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.workspaces.importSnapshot({
					workspaceId: home,
					snapshot: {
						version: 1,
						exportedAt: new Date().toISOString(),
						workspace: { name: "pwned" },
						devices: [],
						interfaces: [],
						connections: [],
						routes: [],
						annotations: [],
					},
				}),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.workspaces.exportSnapshot({ workspaceId: home }),
			).rejects.toMatchObject(forbidden);
			await expect(
				caller.workspaces.delete({ id: home }),
			).rejects.toMatchObject(forbidden);
		}

		/* Nothing changed */
		const [ws] = await testDb
			.select()
			.from(schema.workspaces)
			.where(eq(schema.workspaces.id, home));
		expect(ws?.name).toBe("Home");
		expect(await as(ALICE).devices.list({ workspaceId: home })).toHaveLength(2);
		expect(
			await as(ALICE).connections.list({ workspaceId: home }),
		).toHaveLength(1);
		expect(await as(ALICE).routes.list({ deviceId: router })).toHaveLength(1);
		expect(
			await as(ALICE).annotations.list({ workspaceId: home }),
		).toHaveLength(1);
	});

	it("a route id cannot be rewritten through another device", async () => {
		const mine = (
			await as(MALLORY).workspaces.create({ name: "Mine", ownerId: MALLORY })
		).id;
		const myDevice = (
			await as(MALLORY).devices.create({
				workspaceId: mine,
				name: "Box",
				color: "#000",
				portCount: 1,
			})
		).id;
		await expect(
			as(MALLORY).routes.upsert({
				id: route,
				deviceId: myDevice,
				destination: "0.0.0.0/0",
				nextHop: "1.1.1.1",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(
			(await as(ALICE).routes.list({ deviceId: router }))[0],
		).toMatchObject({ destination: "10.0.0.0/8" });
	});

	it("nobody can create a workspace owned by someone else or list theirs", async () => {
		await expect(
			as(MALLORY).workspaces.create({ name: "Gift", ownerId: ALICE }),
		).rejects.toMatchObject(forbidden);
		await expect(
			as(null).workspaces.create({ name: "Gift", ownerId: ALICE }),
		).rejects.toMatchObject(forbidden);
		expect(await as(MALLORY).workspaces.list({ ownerId: ALICE })).toEqual([]);
		expect(await as(ALICE).workspaces.list({ ownerId: ALICE })).toHaveLength(1);
	});

	it("member emails are only listed to people who can read the workspace", async () => {
		const share = await as(ALICE).workspaces.createShare({ workspaceId: home });
		const bystander = "user-bystander";
		await testDb
			.insert(schema.user)
			.values({ id: bystander, name: "B", email: "b@example.test" });
		await as(bystander).workspaces.joinViaShare({ token: share.token });
		expect(
			await as(MALLORY).workspaces.listMembers({ workspaceId: home }),
		).toEqual([]);
		expect(
			await as(ALICE).workspaces.listMembers({ workspaceId: home }),
		).toEqual([expect.objectContaining({ userEmail: "b@example.test" })]);
		/* A read-only member may export, not edit */
		expect(
			(await as(bystander).workspaces.exportSnapshot({ workspaceId: home }))
				.devices,
		).toHaveLength(2);
		await expect(
			as(bystander).devices.update({ id: router, name: "x" }),
		).rejects.toMatchObject(forbidden);
	});

	it("ownerless drafts stay editable by anyone holding the id", async () => {
		const draft = await as(null).workspaces.createAnonymous({});
		const d = await as(null).devices.create({
			workspaceId: draft.id,
			name: "Switch",
			color: "#000",
			portCount: 8,
		});
		await as(null).devices.update({ id: d.id, name: "Core switch" });
		await as(null).workspaces.update({ id: draft.id, name: "Lab" });
		expect(
			(await as(null).workspaces.exportSnapshot({ workspaceId: draft.id }))
				.devices[0]?.name,
		).toBe("Core switch");
		await as(null).workspaces.delete({ id: draft.id });
	});

	it("the owner keeps full control, and an empty update is a no-op", async () => {
		const same = await as(ALICE).devices.update({ id: router });
		expect(same).toMatchObject({ id: router, name: "Router" });
		const sameNote = await as(ALICE).annotations.update({ id: note });
		expect(sameNote).toMatchObject({ id: note });
		await as(ALICE).annotations.delete({ id: note });
		await as(ALICE).routes.delete({ id: route });
		await as(ALICE).connections.delete({ id: cable });
		await as(ALICE).devices.delete({ id: nas });
		await expect(as(ALICE).devices.delete({ id: nas })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await as(ALICE).workspaces.delete({ id: home });
		expect(await as(ALICE).workspaces.get({ id: home })).toBeNull();
	});
});
