/**
 * Router-level tests for cross-workspace links against a real Postgres
 * engine (PGlite, in process) with every drizzle migration applied.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const pg = new PGlite();
const testDb = drizzle(pg, { schema });

vi.mock("@/db", () => ({ db: testDb }));
/* The context factory is never used here; keep better-auth out of the test. */
vi.mock("@/lib/auth", () => ({
	auth: { api: { getSession: async () => null } },
}));

const { trpcRouter } = await import("@/integrations/trpc/router");

const ALICE = "user-alice";
const BOB = "user-bob";

function as(userId: string | null) {
	return trpcRouter.createCaller({ session: null, userId });
}

let home: string;
let vps: string;
let office: string;
let homeRouter: string;
let homeHa: string;
let vpsHost: string;
let officeFw: string;

beforeAll(async () => {
	await migrate(testDb, { migrationsFolder: "./drizzle" });
	await testDb.insert(schema.user).values([
		{ id: ALICE, name: "Alice", email: "alice@example.test" },
		{ id: BOB, name: "Bob", email: "bob@example.test" },
	]);

	home = (await as(ALICE).workspaces.create({ name: "Home", ownerId: ALICE }))
		.id;
	vps = (await as(ALICE).workspaces.create({ name: "VPS", ownerId: ALICE })).id;
	office = (await as(BOB).workspaces.create({ name: "Office", ownerId: BOB }))
		.id;

	const dev = async (
		workspaceId: string,
		name: string,
		deviceType: string,
		portCount: number,
	) =>
		(
			await as(ALICE).devices.create({
				workspaceId,
				name,
				deviceType,
				color: "#3b82f6",
				portCount,
				ipForwarding: deviceType === "managed-router",
			})
		).id;
	homeRouter = await dev(home, "Home router", "managed-router", 4);
	homeHa = await dev(home, "Home Assistant", "server", 2);
	vpsHost = await dev(vps, "VPS", "server", 2);
	officeFw = await dev(office, "Office firewall", "firewall", 8);

	await as(ALICE).connections.create({
		workspaceId: home,
		deviceAId: homeHa,
		portA: 1,
		deviceBId: homeRouter,
		portB: 1,
	});
	for (const [deviceId, portNumber, ipAddress] of [
		[homeHa, 1, "192.168.1.10/24"],
		[homeRouter, 1, "192.168.1.1/24"],
		[homeRouter, 2, "10.8.0.2/24"],
		[vpsHost, 1, "10.8.0.1/24"],
	] as const) {
		await as(ALICE).interfaces.upsert({ deviceId, portNumber, ipAddress });
	}
});

describe("workspaceLinks router", () => {
	let vpnLinkId: string;

	it("links two workspaces the caller owns", async () => {
		const link = await as(ALICE).workspaceLinks.create({
			a: { workspaceId: home, deviceId: homeRouter, port: 2 },
			b: { workspaceId: vps, deviceId: vpsHost, port: 1 },
			linkType: "vpn",
			label: "wg0",
		});
		vpnLinkId = link.id;
		expect(link).toMatchObject({
			linkType: "vpn",
			label: "wg0",
			createdBy: ALICE,
		});

		const fromVps = await as(ALICE).workspaceLinks.list({ workspaceId: vps });
		expect(fromVps).toEqual([
			expect.objectContaining({
				local: { deviceId: vpsHost, port: 1 },
				far: {
					locked: false,
					workspaceId: home,
					workspaceName: "Home",
					deviceId: homeRouter,
					deviceName: "Home router",
					port: 2,
				},
			}),
		]);
	});

	it("refuses linking into a workspace the caller cannot edit", async () => {
		await expect(
			as(ALICE).workspaceLinks.create({
				a: { workspaceId: home, deviceId: homeRouter, port: 3 },
				b: { workspaceId: office, deviceId: officeFw, port: 1 },
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		/* anonymous callers cannot link owned workspaces either */
		await expect(
			as(null).workspaceLinks.create({
				a: { workspaceId: home, deviceId: homeRouter, port: 3 },
				b: { workspaceId: vps, deviceId: vpsHost, port: 2 },
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("refuses port double use: link on a cabled port, cable on a linked port", async () => {
		await expect(
			as(ALICE).workspaceLinks.create({
				a: { workspaceId: home, deviceId: homeRouter, port: 1 },
				b: { workspaceId: vps, deviceId: vpsHost, port: 2 },
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(
			as(ALICE).workspaceLinks.create({
				a: { workspaceId: home, deviceId: homeRouter, port: 3 },
				b: { workspaceId: vps, deviceId: vpsHost, port: 1 },
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(
			as(ALICE).connections.create({
				workspaceId: home,
				deviceAId: homeHa,
				portA: 2,
				deviceBId: homeRouter,
				portB: 2,
			}),
		).rejects.toThrow(/linked to another workspace/);
	});

	it("collaborators can link; read-only members and outsiders see a locked stub", async () => {
		/* Bob's office is in collaboration mode and Alice joined it */
		await as(BOB).workspaces.setMode({
			workspaceId: office,
			mode: "collaboration",
		});
		const share = await as(BOB).workspaces.createShare({ workspaceId: office });
		await as(ALICE).workspaces.joinViaShare({ token: share.token });
		const link = await as(ALICE).workspaceLinks.create({
			a: { workspaceId: home, deviceId: homeRouter, port: 3 },
			b: { workspaceId: office, deviceId: officeFw, port: 1 },
			linkType: "wan",
		});

		/* Bob (owner of Office) looks from Office: Home is Alice's, so locked */
		const bobView = await as(BOB).workspaceLinks.list({ workspaceId: office });
		expect(bobView).toEqual([
			expect.objectContaining({
				id: link.id,
				far: { locked: true, label: "linked workspace" },
			}),
		]);
		expect(JSON.stringify(bobView)).not.toContain(home);
		expect(JSON.stringify(bobView)).not.toContain("Home router");

		/* Bob cannot delete or edit it: no edit access on Home */
		await expect(
			as(BOB).workspaceLinks.delete({ id: link.id }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			as(BOB).workspaceLinks.update({ id: link.id, label: "x" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		/* Alice reads both sides */
		const aliceView = await as(ALICE).workspaceLinks.list({
			workspaceId: office,
		});
		expect(aliceView[0]?.far).toMatchObject({
			locked: false,
			workspaceName: "Home",
		});

		/* Office back to presentation: Alice is now read-only there */
		await as(BOB).workspaces.setMode({
			workspaceId: office,
			mode: "presentation",
		});
		await expect(
			as(ALICE).workspaceLinks.update({ id: link.id, label: "ISP" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(
			(await as(ALICE).workspaceLinks.list({ workspaceId: home })).find(
				(l) => l.id === link.id,
			)?.far,
		).toMatchObject({ locked: false, workspaceName: "Office" });
	});

	it("site map shows workspaces, locked far sides and aggregated edges", async () => {
		const map = await as(BOB).workspaceLinks.siteMap();
		const officeNode = map.nodes.find((n) => n.workspaceId === office);
		const locked = map.nodes.find((n) => n.role === "locked");
		expect(officeNode).toMatchObject({
			name: "Office",
			role: "owner",
			deviceCount: 1,
		});
		expect(locked).toMatchObject({
			workspaceId: null,
			name: "Linked workspace",
		});
		expect(JSON.stringify(map)).not.toContain(home);
		expect(map.edges).toEqual([
			expect.objectContaining({ count: 1, types: ["wan"] }),
		]);

		const aliceMap = await as(ALICE).workspaceLinks.siteMap();
		expect(aliceMap.nodes.map((n) => n.name).sort()).toEqual([
			"Home",
			"Office",
			"VPS",
		]);
		expect(aliceMap.edges).toHaveLength(2);
	});

	it("linkedNetwork returns the union, and the VPS reaches Home Assistant", async () => {
		const { computeLinkedReachability } = await import("@/lib/linked-network");
		const net = await as(ALICE).workspaceLinks.linkedNetwork({
			workspaceId: vps,
		});
		expect(net.parts.map((p) => p.workspace.name).sort()).toEqual([
			"Home",
			"Office",
			"VPS",
		]);
		expect(net.lockedCount).toBe(0);
		const reach = computeLinkedReachability(vpsHost, net.parts, net.links);
		expect(reach.deviceStatus.get(homeHa)).toBe("l3");

		/* Bob only reaches his own office; Home is counted as locked */
		const bobNet = await as(BOB).workspaceLinks.linkedNetwork({
			workspaceId: office,
		});
		expect(bobNet.parts.map((p) => p.workspace.name)).toEqual(["Office"]);
		expect(bobNet.lockedCount).toBe(1);
		expect(bobNet.links).toEqual([]);
	});

	it("snapshot export includes readable links and import recreates them", async () => {
		const snap = await as(ALICE).workspaces.exportSnapshot({
			workspaceId: home,
		});
		expect(snap.version).toBe(1);
		expect(
			snap.workspaceLinks?.map((l) => l.remote.workspaceName).sort(),
		).toEqual(["Office", "VPS"]);
		/* Bob exporting Office must not see Home */
		const bobSnap = await as(BOB).workspaces.exportSnapshot({
			workspaceId: office,
		});
		expect(bobSnap.workspaceLinks).toEqual([]);

		/* Import Home's snapshot back into Home: devices are recreated, links
		   cascade away and are rebuilt where the far side is still editable. */
		const json = JSON.parse(JSON.stringify(snap));
		const result = await as(ALICE).workspaces.importSnapshot({
			workspaceId: home,
			snapshot: json,
		});
		expect(result.linksImported).toBe(1);
		expect(result.linksSkipped).toEqual([
			expect.objectContaining({
				reason: "You need edit access to both workspaces to change this link",
			}),
		]);
		const links = await as(ALICE).workspaceLinks.list({ workspaceId: home });
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({
			linkType: "vpn",
			label: "wg0",
			far: { locked: false, workspaceName: "VPS", port: 1 },
		});
		/* the old link id is gone (cascade), a new one exists */
		expect(links[0]?.id).not.toBe(vpnLinkId);
	});

	it("deleting a device removes its cross-links", async () => {
		const before = await as(ALICE).workspaceLinks.list({ workspaceId: vps });
		expect(before).toHaveLength(1);
		await as(ALICE).devices.delete({ id: vpsHost });
		expect(await as(ALICE).workspaceLinks.list({ workspaceId: home })).toEqual(
			[],
		);
	});
});
