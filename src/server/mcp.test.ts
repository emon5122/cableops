import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { workspaceSnapshotSchema } from "@/lib/workspace-snapshot-schema";
import { createTestDb, insertUser } from "@/test/pglite-db";
import { createApiToken, revokeApiToken } from "./api-token-service";
import type { Db } from "./db-type";
import { handleMcpRequest, SNAPSHOT_SCHEMA_URI } from "./mcp";
import { FixedWindowRateLimiter } from "./token-auth";

let db: Db;
let close: () => Promise<void>;
let aliceToken: string;
const rateLimiter = new FixedWindowRateLimiter(10_000, 60_000);

/*
 * alice owns ws-alice; is a member of bob's ws-shared (collaboration mode);
 * cannot read bob's ws-bob nor the ownerless ws-anon.
 */
beforeAll(async () => {
	({ db, close } = await createTestDb());
	await insertUser(db, "alice");
	await insertUser(db, "bob");
	await db.insert(schema.workspaces).values([
		{ id: "ws-alice", name: "Alice Home", ownerId: "alice" },
		{ id: "ws-bob", name: "Bob Office", ownerId: "bob" },
		{
			id: "ws-shared",
			name: "Shared Lab",
			ownerId: "bob",
			mode: "collaboration",
		},
		{ id: "ws-anon", name: "Anonymous Draft", ownerId: null },
	]);
	await db
		.insert(schema.workspaceMembers)
		.values({ id: "m1", workspaceId: "ws-shared", userId: "alice" });

	// ws-alice: router(1) — switch(1..3) — pc1(1), pc2(1)
	await db.insert(schema.devices).values([
		{
			id: "r1",
			workspaceId: "ws-alice",
			name: "Router",
			deviceType: "router",
			portCount: 4,
			ipForwarding: true,
		},
		{
			id: "sw1",
			workspaceId: "ws-alice",
			name: "Core Switch",
			deviceType: "switch",
			portCount: 8,
		},
		{
			id: "pc1",
			workspaceId: "ws-alice",
			name: "PC One",
			deviceType: "pc",
			portCount: 1,
		},
		{
			id: "pc2",
			workspaceId: "ws-alice",
			name: "PC Two",
			deviceType: "pc",
			portCount: 1,
		},
		{
			id: "lonely",
			workspaceId: "ws-alice",
			name: "Lonely",
			deviceType: "pc",
			portCount: 1,
		},
		{
			id: "b1",
			workspaceId: "ws-bob",
			name: "Bob Secret Server",
			deviceType: "server",
			portCount: 2,
		},
	]);
	await db.insert(schema.connections).values([
		{
			id: "c1",
			workspaceId: "ws-alice",
			deviceAId: "r1",
			portA: 1,
			deviceBId: "sw1",
			portB: 1,
		},
		{
			id: "c2",
			workspaceId: "ws-alice",
			deviceAId: "sw1",
			portA: 2,
			deviceBId: "pc1",
			portB: 1,
		},
		{
			id: "c3",
			workspaceId: "ws-alice",
			deviceAId: "sw1",
			portA: 3,
			deviceBId: "pc2",
			portB: 1,
		},
	]);
	await db.insert(schema.interfaces).values([
		{ id: "i1", deviceId: "r1", portNumber: 1, ipAddress: "192.168.1.1/24" },
		{
			id: "i2",
			deviceId: "pc1",
			portNumber: 1,
			ipAddress: "192.168.1.10/24",
			gateway: "192.168.1.1",
		},
		{
			id: "i3",
			deviceId: "pc2",
			portNumber: 1,
			ipAddress: "192.168.1.10/24",
			gateway: "192.168.1.1",
		},
	]);

	aliceToken = (
		await createApiToken(db, "alice", { name: "agent", scopes: ["read"] })
	).token;
});
afterAll(() => close());

let rpcId = 0;
function mcpRequest(
	token: string | null,
	method: string,
	params: unknown = {},
) {
	const headers: Record<string, string> = {
		"content-type": "application/json",
		accept: "application/json, text/event-stream",
	};
	if (token) headers.authorization = `Bearer ${token}`;
	return new Request("http://test/api/mcp", {
		method: "POST",
		headers,
		body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
	});
}

async function rpc(token: string | null, method: string, params: unknown = {}) {
	const res = await handleMcpRequest(mcpRequest(token, method, params), {
		db,
		rateLimiter,
	});
	return {
		status: res.status,
		body: res.status === 200 ? await res.json() : await res.text(),
	};
}

async function callTool(
	name: string,
	args: Record<string, unknown> = {},
	token = aliceToken,
) {
	const { status, body } = await rpc(token, "tools/call", {
		name,
		arguments: args,
	});
	expect(status).toBe(200);
	return body as {
		result?: {
			content: Array<{ type: string; text: string }>;
			isError?: boolean;
		};
		error?: { code: number; message: string };
	};
}

/** Tool failures come back as isError results (or a JSON-RPC error) */
function toolError(r: Awaited<ReturnType<typeof callTool>>): string {
	if (r.error) return r.error.message;
	expect(r.result?.isError).toBe(true);
	return r.result?.content[0]?.text ?? "";
}

function payload(r: Awaited<ReturnType<typeof callTool>>) {
	expect(r.error).toBeUndefined();
	expect(r.result?.isError).toBeFalsy();
	return JSON.parse(r.result?.content[0]?.text ?? "null");
}

describe("MCP endpoint", () => {
	it("initializes and lists the read tools and resources", async () => {
		const init = await rpc(aliceToken, "initialize", {
			protocolVersion: "2025-06-18",
			capabilities: {},
			clientInfo: { name: "test", version: "0" },
		});
		expect(init.status).toBe(200);
		expect(init.body.result.serverInfo.name).toBe("cableops");

		const tools = await rpc(aliceToken, "tools/list");
		expect(
			tools.body.result.tools.map((t: { name: string }) => t.name).sort(),
		).toEqual(["analyze", "find_path", "get_snapshot", "list_workspaces"]);

		const resources = await rpc(aliceToken, "resources/list");
		expect(
			resources.body.result.resources.map((r: { uri: string }) => r.uri),
		).toContain(SNAPSHOT_SCHEMA_URI);
		const schemaRes = await rpc(aliceToken, "resources/read", {
			uri: SNAPSHOT_SCHEMA_URI,
		});
		const text = schemaRes.body.result.contents[0].text;
		expect(JSON.parse(text).title).toBe("CableOps Workspace Snapshot");
	});

	it("list_workspaces returns only owned and joined workspaces", async () => {
		const { workspaces } = payload(await callTool("list_workspaces"));
		expect(
			workspaces.map((w: { id: string; permission: string }) => [
				w.id,
				w.permission,
			]),
		).toEqual([
			["ws-alice", "owner"],
			["ws-shared", "collaborator"],
		]);
	});

	it("get_snapshot returns the export JSON for a readable workspace", async () => {
		const snap = payload(
			await callTool("get_snapshot", { workspaceId: "ws-alice" }),
		);
		expect(snap.version).toBe(1);
		expect(snap.workspace).toEqual({ id: "ws-alice", name: "Alice Home" });
		expect(snap.devices).toHaveLength(5);
		expect(snap.connections).toHaveLength(3);
		expect(snap.interfaces).toHaveLength(3);
		expect(Object.keys(snap).sort()).toEqual([
			"annotations",
			"connections",
			"devices",
			"exportedAt",
			"interfaces",
			"routes",
			"version",
			"workspace",
		]);
		// round-trips through the importer's schema
		expect(workspaceSnapshotSchema.safeParse(snap).success).toBe(true);

		const shared = payload(
			await callTool("get_snapshot", { workspaceId: "ws-shared" }),
		);
		expect(shared.workspace.id).toBe("ws-shared");
	});

	it("a token cannot read a workspace its user cannot read", async () => {
		for (const workspaceId of ["ws-bob", "ws-anon", "does-not-exist"]) {
			for (const tool of ["get_snapshot", "analyze"]) {
				const r = await callTool(tool, { workspaceId });
				const message = toolError(r);
				expect(message).toContain("-32602");
				expect(message).toContain("not found or not readable");
				expect(JSON.stringify(r)).not.toContain("Bob Secret Server");
			}
		}
		const r = await callTool("find_path", {
			workspaceId: "ws-bob",
			fromDevice: "b1",
			toDevice: "b1",
		});
		expect(toolError(r)).toContain("not found or not readable");
	});

	it("validates tool input", async () => {
		const r = await callTool("get_snapshot", {});
		expect(toolError(r)).toMatch(/workspaceId/);
	});

	it("analyze reports Insights issues and segments", async () => {
		const a = payload(await callTool("analyze", { workspaceId: "ws-alice" }));
		expect(a.summary.devices).toBe(5);
		expect(a.summary.segments).toBeGreaterThan(0);
		const dup = a.issues.filter(
			(i: { type: string }) => i.type === "duplicate_ip",
		);
		expect(dup.length).toBeGreaterThan(0);
		expect(dup[0].deviceName).toMatch(/PC (One|Two)/);
	});

	it("find_path resolves names and returns the cable path and reachability", async () => {
		const p = payload(
			await callTool("find_path", {
				workspaceId: "ws-alice",
				fromDevice: "pc one",
				toDevice: "r1",
			}),
		);
		expect(p.from.id).toBe("pc1");
		expect(p.to.id).toBe("r1");
		expect(p.physicallyConnected).toBe(true);
		expect(
			p.physicalPath.map((h: { connectionId: string }) => h.connectionId),
		).toEqual(["c2", "c1"]);
		expect(p.physicalPath[0].from).toEqual({
			deviceId: "pc1",
			deviceName: "PC One",
			portNumber: 1,
		});
		expect(p.reachability.forward.status).toBe("l2");
		expect(p.sharedSegments.length).toBe(1);

		const none = payload(
			await callTool("find_path", {
				workspaceId: "ws-alice",
				fromDevice: "pc1",
				toDevice: "Lonely",
			}),
		);
		expect(none.physicallyConnected).toBe(false);
		expect(none.physicalPath).toBeNull();
		expect(none.reachability.forward.status).toBe("unreachable");

		const bad = await callTool("find_path", {
			workspaceId: "ws-alice",
			fromDevice: "pc1",
			toDevice: "nope",
		});
		expect(toolError(bad)).toContain('No device with id or name "nope"');
	});

	it("401 without a token or with a revoked token, 405 on GET", async () => {
		const none = await rpc(null, "tools/list");
		expect(none.status).toBe(401);

		const t = await createApiToken(db, "alice", {
			name: "tmp",
			scopes: ["read"],
		});
		expect((await rpc(t.token, "tools/list")).status).toBe(200);
		await revokeApiToken(db, "alice", t.id);
		const revoked = await rpc(t.token, "tools/list");
		expect(revoked.status).toBe(401);

		const get = await handleMcpRequest(
			new Request("http://test/api/mcp", {
				headers: {
					authorization: `Bearer ${aliceToken}`,
					accept: "text/event-stream",
				},
			}),
			{ db, rateLimiter },
		);
		expect(get.status).toBe(405);
		const getNoAuth = await handleMcpRequest(
			new Request("http://test/api/mcp"),
			{
				db,
				rateLimiter,
			},
		);
		expect(getNoAuth.status).toBe(401);
	});

	it("403 for a token without the read scope", async () => {
		const t = await createApiToken(db, "alice", {
			name: "imp",
			scopes: ["write:import"],
		});
		const r = await rpc(t.token, "tools/list");
		expect(r.status).toBe(403);
	});
});
