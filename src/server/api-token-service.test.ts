import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { requireSessionUser } from "@/integrations/trpc/api-tokens-router";
import { hashApiToken } from "@/lib/api-tokens";
import { createTestDb, insertUser } from "@/test/pglite-db";
import {
	createApiToken,
	createApiTokenInput,
	listApiTokens,
	revokeApiToken,
} from "./api-token-service";
import type { Db } from "./db-type";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
	({ db, close } = await createTestDb());
	await insertUser(db, "alice");
	await insertUser(db, "bob");
});
afterAll(() => close());

describe("api token service", () => {
	it("stores only the hash and never lists the plaintext", async () => {
		const created = await createApiToken(db, "alice", {
			name: "laptop",
			scopes: ["write:import", "read", "read"],
			expiresInDays: 30,
		});
		expect(created.token).toMatch(/^cops_/);
		expect(created.scopes).toEqual(["read", "write:import"]);
		expect(created.expiresAt).not.toBeNull();

		const rows = await db.select().from(schema.apiTokens);
		const row = rows.find((r) => r.id === created.id);
		expect(row?.tokenHash).toBe(hashApiToken(created.token));
		expect(JSON.stringify(rows)).not.toContain(created.token);

		const listed = await listApiTokens(db, "alice");
		expect(listed).toHaveLength(1);
		expect(listed[0]).not.toHaveProperty("tokenHash");
		expect(listed[0]).not.toHaveProperty("token");
		expect(listed[0].state).toBe("active");
		expect(await listApiTokens(db, "bob")).toEqual([]);
	});

	it("revokes only the caller's own tokens", async () => {
		const t = await createApiToken(db, "alice", {
			name: "x",
			scopes: ["read"],
		});
		expect(await revokeApiToken(db, "bob", t.id)).toEqual({ revoked: false });
		expect(await revokeApiToken(db, "alice", t.id)).toEqual({ revoked: true });
		expect(await revokeApiToken(db, "alice", t.id)).toEqual({ revoked: false });
		const listed = await listApiTokens(db, "alice");
		expect(listed.find((r) => r.id === t.id)?.state).toBe("revoked");
	});

	it("validates create input", () => {
		expect(
			createApiTokenInput.safeParse({ name: "", scopes: ["read"] }).success,
		).toBe(false);
		expect(
			createApiTokenInput.safeParse({ name: "a", scopes: [] }).success,
		).toBe(false);
		expect(
			createApiTokenInput.safeParse({ name: "a", scopes: ["admin"] }).success,
		).toBe(false);
		expect(
			createApiTokenInput.safeParse({
				name: "a",
				scopes: ["read"],
				expiresInDays: 0,
			}).success,
		).toBe(false);
		expect(
			createApiTokenInput.safeParse({
				name: "a",
				scopes: ["read"],
				expiresInDays: null,
			}).success,
		).toBe(true);
	});
});

describe("token management is session-only", () => {
	it("refuses requests that carry an API token, even with a session", () => {
		expect(() =>
			requireSessionUser({ userId: "alice", hasBearerToken: true }),
		).toThrow(/cannot manage API tokens/);
	});
	it("refuses anonymous requests", () => {
		expect(() =>
			requireSessionUser({ userId: null, hasBearerToken: false }),
		).toThrow(/Sign in/);
	});
	it("allows a cookie session", () => {
		expect(requireSessionUser({ userId: "alice", hasBearerToken: false })).toBe(
			"alice",
		);
	});
});
