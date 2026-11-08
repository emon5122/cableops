/**
 * Share-link access (no anonymous read), IP-uniqueness serialization and
 * portCount shrink cleanup, against a real Postgres engine (PGlite).
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

function as(userId: string | null) {
	return trpcRouter.createCaller({
		session: null,
		userId,
		hasBearerToken: false,
	});
}

let ws: string;
let swA: string;
let swB: string;
const TOKEN = "share-token-123456";

beforeAll(async () => {
	await migrate(testDb, { migrationsFolder: "./drizzle" });
	await testDb.insert(schema.user).values([
		{ id: ALICE, name: "Alice", email: "alice@example.test" },
		{ id: BOB, name: "Bob", email: "bob@example.test" },
	]);
	ws = (await as(ALICE).workspaces.create({ name: "Net", ownerId: ALICE })).id;
	const mk = (name: string) =>
		as(ALICE).devices.create({
			workspaceId: ws,
			name,
			color: "#000",
			portCount: 8,
			deviceType: "switch",
		});
	swA = (await mk("A")).id;
	swB = (await mk("B")).id;
	await testDb.insert(schema.workspaceShares).values({
		id: crypto.randomUUID(),
		workspaceId: ws,
		token: TOKEN,
		createdBy: ALICE,
	});
});

describe("share link", () => {
	it("a signed-out visitor is not joined and still cannot read", async () => {
		expect(await as(null).workspaces.joinViaShare({ token: TOKEN })).toEqual({
			joined: false,
			workspaceId: null,
		});
		await expect(
			as(null).devices.list({ workspaceId: ws }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(as(null).workspaces.get({ id: ws })).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	it("resolveShare stays public and exposes only id + name", async () => {
		const r = await as(null).workspaces.resolveShare({ token: TOKEN });
		expect(r).toEqual({ workspaceId: ws, workspaceName: "Net" });
	});

	it("a signed-in visitor joins via the link and can then read", async () => {
		await expect(
			as(BOB).devices.list({ workspaceId: ws }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		const res = await as(BOB).workspaces.joinViaShare({ token: TOKEN });
		expect(res).toEqual({ joined: true, workspaceId: ws });
		expect(await as(BOB).devices.list({ workspaceId: ws })).toHaveLength(2);
	});
});

describe("interfaces.upsert serializes the IP-uniqueness check", () => {
	it("two concurrent claims of the same IP: exactly one wins", async () => {
		const results = await Promise.allSettled([
			as(ALICE).interfaces.upsert({
				deviceId: swA,
				portNumber: 1,
				ipAddress: "10.9.0.5/24",
			}),
			as(ALICE).interfaces.upsert({
				deviceId: swB,
				portNumber: 1,
				ipAddress: "10.9.0.5/24",
			}),
		]);
		/* The two ports are on different segments (no cable), so both may
		   legitimately succeed; wire them together and retry to prove the
		   same-segment case is exclusive. */
		expect(results.every((r) => r.status === "fulfilled")).toBe(true);
		await as(ALICE).connections.create({
			workspaceId: ws,
			deviceAId: swA,
			portA: 2,
			deviceBId: swB,
			portB: 2,
		});
		const same = await Promise.allSettled([
			as(ALICE).interfaces.upsert({
				deviceId: swA,
				portNumber: 2,
				ipAddress: "10.9.1.5/24",
			}),
			as(ALICE).interfaces.upsert({
				deviceId: swB,
				portNumber: 2,
				ipAddress: "10.9.1.5/24",
			}),
		]);
		expect(same.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(same.filter((r) => r.status === "rejected")).toHaveLength(1);
	});

	it("rejects a port above the device's port count", async () => {
		await expect(
			as(ALICE).interfaces.upsert({ deviceId: swA, portNumber: 99 }),
		).rejects.toThrow(/does not exist/);
	});
});

describe("portCount shrink", () => {
	it("deletes interfaces and routes above the new count in the same step", async () => {
		const dev = (
			await as(ALICE).devices.create({
				workspaceId: ws,
				name: "R",
				color: "#000",
				portCount: 8,
				deviceType: "managed-router",
			})
		).id;
		for (const p of [1, 2, 6, 7, 8]) {
			await as(ALICE).interfaces.upsert({ deviceId: dev, portNumber: p });
		}
		await as(ALICE).routes.upsert({
			deviceId: dev,
			destination: "0.0.0.0/0",
			nextHop: "10.9.9.1",
			interfacePort: 7,
		});
		await as(ALICE).routes.upsert({
			deviceId: dev,
			destination: "10.1.0.0/16",
			nextHop: "10.9.9.1",
			interfacePort: 2,
		});
		await as(ALICE).devices.update({ id: dev, portCount: 4 });
		const ifaces = await testDb
			.select()
			.from(schema.interfaces)
			.where(eq(schema.interfaces.deviceId, dev));
		expect(ifaces.map((i) => i.portNumber).sort()).toEqual([1, 2]);
		const rts = await testDb
			.select()
			.from(schema.routes)
			.where(eq(schema.routes.deviceId, dev));
		expect(rts.map((r) => r.interfacePort)).toEqual([2]);
	});
});
