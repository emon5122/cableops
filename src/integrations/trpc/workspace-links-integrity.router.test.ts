/**
 * Router-level integrity tests for cross-workspace links (PGlite): port
 * claims under concurrency, port-count shrink, the linked-network size cap,
 * update input limits and the import cascade report.
 */
import { PGlite } from "@electric-sql/pglite";
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
const alice = trpcRouter.createCaller({
	session: null,
	userId: ALICE,
	hasBearerToken: false,
});

let siteA: string;
let siteB: string;
let edgeA: string;
let lanA: string;
let edgeB: string;

async function device(workspaceId: string, name: string, portCount: number) {
	return (
		await alice.devices.create({
			workspaceId,
			name,
			color: "#3b82f6",
			portCount,
		})
	).id;
}

beforeAll(async () => {
	await migrate(testDb, { migrationsFolder: "./drizzle" });
	await testDb
		.insert(schema.user)
		.values({ id: ALICE, name: "Alice", email: "alice@example.test" });
	siteA = (await alice.workspaces.create({ name: "Site A", ownerId: ALICE }))
		.id;
	siteB = (await alice.workspaces.create({ name: "Site B", ownerId: ALICE }))
		.id;
	edgeA = await device(siteA, "Edge A", 8);
	lanA = await device(siteA, "LAN A", 4);
	edgeB = await device(siteB, "Edge B", 8);
});

describe("port claims", () => {
	it("two concurrent links on one port: exactly one wins", async () => {
		const results = await Promise.allSettled([
			alice.workspaceLinks.create({
				a: { workspaceId: siteA, deviceId: edgeA, port: 1 },
				b: { workspaceId: siteB, deviceId: edgeB, port: 1 },
			}),
			alice.workspaceLinks.create({
				a: { workspaceId: siteA, deviceId: edgeA, port: 1 },
				b: { workspaceId: siteB, deviceId: edgeB, port: 2 },
			}),
		]);
		expect(results.map((r) => r.status).sort()).toEqual([
			"fulfilled",
			"rejected",
		]);
		const rejected = results.find((r) => r.status === "rejected");
		expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({
			code: "CONFLICT",
		});
		expect(
			await alice.workspaceLinks.list({ workspaceId: siteA }),
		).toHaveLength(1);
	});

	it("a link racing a cable for one port: exactly one wins", async () => {
		const results = await Promise.allSettled([
			alice.connections.create({
				workspaceId: siteA,
				deviceAId: lanA,
				portA: 1,
				deviceBId: edgeA,
				portB: 2,
			}),
			alice.workspaceLinks.create({
				a: { workspaceId: siteA, deviceId: edgeA, port: 2 },
				b: { workspaceId: siteB, deviceId: edgeB, port: 3 },
			}),
		]);
		expect(results.map((r) => r.status).sort()).toEqual([
			"fulfilled",
			"rejected",
		]);
		const cables = await alice.connections.list({ workspaceId: siteA });
		const links = await alice.workspaceLinks.list({ workspaceId: siteA });
		const onPort2 =
			cables.filter((c) => c.deviceBId === edgeA && c.portB === 2).length +
			links.filter((l) => l.local.deviceId === edgeA && l.local.port === 2)
				.length;
		expect(onPort2).toBe(1);
	});

	it("two concurrent cables on one port: exactly one wins", async () => {
		const results = await Promise.allSettled([
			alice.connections.create({
				workspaceId: siteA,
				deviceAId: lanA,
				portA: 3,
				deviceBId: edgeA,
				portB: 5,
			}),
			alice.connections.create({
				workspaceId: siteA,
				deviceAId: lanA,
				portA: 4,
				deviceBId: edgeA,
				portB: 5,
			}),
		]);
		expect(results.map((r) => r.status).sort()).toEqual([
			"fulfilled",
			"rejected",
		]);
	});
});

describe("devices.update port count", () => {
	it("refuses to shrink below a port used by a cross-link, on either side", async () => {
		/* Edge B port 1 carries the link from the race test */
		await expect(
			alice.devices.update({ id: edgeB, portCount: 0 }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(
			alice.devices.update({ id: edgeA, portCount: 0 }),
		).rejects.toThrow(/Port.* 1.*cross-workspace link/);
	});

	it("refuses to shrink below a cabled port and allows shrinking free ports", async () => {
		await expect(
			alice.devices.update({ id: edgeA, portCount: 4 }),
		).rejects.toThrow(/Port 5 /);
		const grown = await alice.devices.update({ id: edgeA, portCount: 12 });
		expect(grown?.portCount).toBe(12);
		const shrunk = await alice.devices.update({ id: edgeA, portCount: 5 });
		expect(shrunk?.portCount).toBe(5);
		/* other fields still update without touching ports */
		const renamed = await alice.devices.update({ id: edgeA, name: "Edge A1" });
		expect(renamed).toMatchObject({ name: "Edge A1", portCount: 5 });
	});
});

describe("workspaceLinks.update input", () => {
	it("caps speed at 60 characters on create and update", async () => {
		const [link] = await alice.workspaceLinks.list({ workspaceId: siteA });
		if (!link) throw new Error("fixture link missing");
		await expect(
			alice.workspaceLinks.update({ id: link.id, speed: "x".repeat(61) }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			alice.workspaceLinks.create({
				a: { workspaceId: siteA, deviceId: edgeA, port: 4 },
				b: { workspaceId: siteB, deviceId: edgeB, port: 4 },
				speed: "x".repeat(61),
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		const ok = await alice.workspaceLinks.update({
			id: link.id,
			speed: "1 Gbps",
		});
		expect(ok?.speed).toBe("1 Gbps");
	});

	it("an update with no fields is a no-op, not a 500", async () => {
		const [link] = await alice.workspaceLinks.list({ workspaceId: siteA });
		if (!link) throw new Error("fixture link missing");
		const same = await alice.workspaceLinks.update({ id: link.id });
		expect(same).toMatchObject({ id: link.id, speed: "1 Gbps" });
	});
});

describe("linkedNetwork size cap", () => {
	it("reports truncated, not locked, when readable sites exceed the cap", async () => {
		const hub = (await alice.workspaces.create({ name: "Hub", ownerId: ALICE }))
			.id;
		const hubDevice = await device(hub, "Hub router", 60);
		const spokes = Array.from({ length: 55 }, (_, i) => ({
			ws: crypto.randomUUID(),
			dev: crypto.randomUUID(),
			n: i + 1,
		}));
		await testDb
			.insert(schema.workspaces)
			.values(
				spokes.map((s) => ({ id: s.ws, name: `Spoke ${s.n}`, ownerId: ALICE })),
			);
		await testDb.insert(schema.devices).values(
			spokes.map((s) => ({
				id: s.dev,
				workspaceId: s.ws,
				name: `Spoke router ${s.n}`,
				color: "#000",
				portCount: 1,
			})),
		);
		await testDb.insert(schema.workspaceLinks).values(
			spokes.map((s) => ({
				id: crypto.randomUUID(),
				workspaceAId: hub,
				deviceAId: hubDevice,
				portA: s.n,
				workspaceBId: s.ws,
				deviceBId: s.dev,
				portB: 1,
				linkType: "vpn" as const,
			})),
		);

		const net = await alice.workspaceLinks.linkedNetwork({ workspaceId: hub });
		expect(net.parts).toHaveLength(net.maxWorkspaces);
		expect(net.truncated).toBe(true);
		expect(net.lockedCount).toBe(0);

		/* Below the cap nothing is truncated */
		const small = await alice.workspaceLinks.linkedNetwork({
			workspaceId: siteB,
		});
		expect(small.truncated).toBe(false);
		expect(small.parts.map((p) => p.workspace.name).sort()).toEqual([
			"Site A",
			"Site B",
		]);
	});
});

describe("importSnapshot cascade report", () => {
	it("reports how many cross-links the import removed", async () => {
		const before = await alice.workspaceLinks.list({ workspaceId: siteA });
		expect(before.length).toBeGreaterThan(0);
		const snap = await alice.workspaces.exportSnapshot({ workspaceId: siteA });
		const result = await alice.workspaces.importSnapshot({
			workspaceId: siteA,
			snapshot: { ...JSON.parse(JSON.stringify(snap)), workspaceLinks: [] },
		});
		expect(result.linksRemoved).toBe(before.length);
		expect(result.linksImported).toBe(0);
		expect(await alice.workspaceLinks.list({ workspaceId: siteA })).toEqual([]);
	});
});
