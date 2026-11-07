import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createApiToken } from "@/server/api-token-service";
import type { Db } from "@/server/db-type";
import { handleMcpRequest } from "@/server/mcp";
import { FixedWindowRateLimiter } from "@/server/token-auth";
import { createTestDb, insertUser } from "@/test/pglite-db";
import { CliError, DEFAULT_URL, parseArgs, resolveConfig, run } from "./cableops.mjs";

describe("parseArgs", () => {
	it("parses commands", () => {
		expect(parseArgs([])).toEqual({ command: "help" });
		expect(parseArgs(["--help"])).toEqual({ command: "help" });
		expect(parseArgs(["workspaces"])).toEqual({ command: "workspaces", json: false });
		expect(parseArgs(["workspaces", "--json"])).toEqual({ command: "workspaces", json: true });
		expect(parseArgs(["get", "ws-1"])).toEqual({ command: "get", workspace: "ws-1" });
		expect(parseArgs(["analyze", "Home Lab"])).toEqual({
			command: "analyze",
			workspace: "Home Lab",
		});
	});

	it("rejects bad usage with exit code 2", () => {
		for (const argv of [["get"], ["get", "a", "b"], ["frobnicate"], ["workspaces", "x"]]) {
			try {
				parseArgs(argv);
				expect.unreachable(`should reject ${argv.join(" ")}`);
			} catch (error) {
				expect(error).toBeInstanceOf(CliError);
				expect((error as CliError).exitCode).toBe(2);
			}
		}
	});
});

describe("resolveConfig", () => {
	it("defaults to the production URL and requires a token", () => {
		expect(resolveConfig({ CABLEOPS_TOKEN: "cops_x" })).toEqual({
			token: "cops_x",
			endpoint: `${DEFAULT_URL}/api/mcp`,
		});
		expect(DEFAULT_URL).toBe("https://cableops.nexisltd.com");
		expect(
			resolveConfig({ CABLEOPS_TOKEN: "cops_x", CABLEOPS_URL: "http://localhost:3000/" })
				.endpoint,
		).toBe("http://localhost:3000/api/mcp");
		expect(() => resolveConfig({})).toThrow(/CABLEOPS_TOKEN/);
	});

	it("refuses plain http except for localhost", () => {
		const t = "cops_x";
		expect(() =>
			resolveConfig({ CABLEOPS_TOKEN: t, CABLEOPS_URL: "http://cableops.example.com" }),
		).toThrow(/https/);
		expect(() =>
			resolveConfig({ CABLEOPS_TOKEN: t, CABLEOPS_URL: "http://localhost.evil.com" }),
		).toThrow(/https/);
		expect(() => resolveConfig({ CABLEOPS_TOKEN: t, CABLEOPS_URL: "ftp://x" })).toThrow(/https/);
		expect(() => resolveConfig({ CABLEOPS_TOKEN: t, CABLEOPS_URL: "nonsense" })).toThrow(/valid URL/);
		expect(
			resolveConfig({ CABLEOPS_TOKEN: t, CABLEOPS_URL: "http://127.0.0.1:3000" }).endpoint,
		).toBe("http://127.0.0.1:3000/api/mcp");
		expect(
			resolveConfig({ CABLEOPS_TOKEN: t, CABLEOPS_URL: "https://x.example" }).endpoint,
		).toBe("https://x.example/api/mcp");
	});
});

/* ── End to end: CLI → real MCP handler on an in-process Postgres ── */

let db: Db;
let close: () => Promise<void>;
let token: string;
const rateLimiter = new FixedWindowRateLimiter(10_000, 60_000);

beforeAll(async () => {
	({ db, close } = await createTestDb());
	await insertUser(db, "alice");
	await insertUser(db, "bob");
	await db.insert(schema.workspaces).values([
		{ id: "ws-1", name: "Home Lab", ownerId: "alice" },
		{ id: "ws-2", name: "Bob", ownerId: "bob" },
	]);
	await db.insert(schema.devices).values({
		id: "d1",
		workspaceId: "ws-1",
		name: "Switch",
		deviceType: "switch",
	});
	token = (await createApiToken(db, "alice", { name: "cli", scopes: ["read"] })).token;
});
afterAll(() => close());

const fetchToHandler: typeof fetch = async (input, init) =>
	handleMcpRequest(new Request(input as string, init), { db, rateLimiter });

async function cli(argv: string[], env: Record<string, string | undefined>) {
	let out = "";
	let err = "";
	const code = await run({
		argv,
		env,
		fetch: fetchToHandler,
		stdout: (s) => {
			out += s;
		},
		stderr: (s) => {
			err += s;
		},
	});
	return { code, out, err };
}

describe("cableops CLI against the MCP endpoint", () => {
	const env = () => ({ CABLEOPS_TOKEN: token, CABLEOPS_URL: "https://test.example" });

	it("lists workspaces", async () => {
		const r = await cli(["workspaces"], env());
		expect(r.code).toBe(0);
		expect(r.out).toBe("ws-1\towner\tHome Lab\n");
		const j = await cli(["workspaces", "--json"], env());
		expect(JSON.parse(j.out).map((w: { id: string }) => w.id)).toEqual(["ws-1"]);
	});

	it("gets a snapshot by name and analyzes by id", async () => {
		const g = await cli(["get", "home lab"], env());
		expect(g.code).toBe(0);
		const snap = JSON.parse(g.out);
		expect(snap.workspace).toEqual({ id: "ws-1", name: "Home Lab" });
		expect(snap.devices[0].name).toBe("Switch");

		const a = await cli(["analyze", "ws-1"], env());
		expect(a.code).toBe(0);
		expect(JSON.parse(a.out).summary.devices).toBe(1);
	});

	it("does not resolve other users' workspaces", async () => {
		const r = await cli(["get", "ws-2"], env());
		expect(r.code).toBe(1);
		expect(r.err).toContain('No readable workspace with id or name "ws-2"');
	});

	it("reports 401 without ever printing the token", async () => {
		const bad = `cops_${"Z".repeat(40)}`;
		const r = await cli(["workspaces"], { CABLEOPS_TOKEN: bad, CABLEOPS_URL: "https://test.example" });
		expect(r.code).toBe(3);
		expect(r.err).toContain("Unauthorized (401)");
		expect(r.out + r.err).not.toContain(bad);

		const ok = await cli(["get", "nope"], env());
		expect(ok.out + ok.err).not.toContain(token);
	});
});
