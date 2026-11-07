import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createTestDb, insertUser } from "@/test/pglite-db";
import { createApiToken, revokeApiToken } from "./api-token-service";
import type { Db } from "./db-type";
import {
	authenticateBearer,
	FixedWindowRateLimiter,
	LAST_USED_THROTTLE_MS,
} from "./token-auth";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
	({ db, close } = await createTestDb());
	await insertUser(db, "alice");
});
afterAll(() => close());

function req(token?: string) {
	return new Request("http://test/api/mcp", {
		method: "POST",
		headers: token ? { authorization: `Bearer ${token}` } : {},
	});
}

function opts(
	now?: Date,
	rateLimiter = new FixedWindowRateLimiter(1000, 60_000),
) {
	return { db, requiredScope: "read" as const, rateLimiter, now };
}

async function lastUsed(id: string) {
	const rows = await db
		.select()
		.from(schema.apiTokens)
		.where(eq(schema.apiTokens.id, id));
	return rows[0]?.lastUsedAt?.getTime() ?? null;
}

describe("authenticateBearer", () => {
	it("accepts a valid read token and updates lastUsedAt (throttled)", async () => {
		const t = await createApiToken(db, "alice", {
			name: "ok",
			scopes: ["read"],
		});
		const t0 = new Date("2026-11-07T10:00:00Z");
		const r = await authenticateBearer(req(t.token), opts(t0));
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.principal).toEqual({
				userId: "alice",
				tokenId: t.id,
				scopes: ["read"],
			});
		}
		expect(await lastUsed(t.id)).toBe(t0.getTime());

		// within the throttle window: not rewritten
		await authenticateBearer(
			req(t.token),
			opts(new Date(t0.getTime() + 5_000)),
		);
		expect(await lastUsed(t.id)).toBe(t0.getTime());

		const t1 = new Date(t0.getTime() + LAST_USED_THROTTLE_MS + 1);
		await authenticateBearer(req(t.token), opts(t1));
		expect(await lastUsed(t.id)).toBe(t1.getTime());
	});

	it("401 on missing, malformed and unknown tokens", async () => {
		for (const token of [undefined, "not-a-token", `cops_${"A".repeat(40)}`]) {
			const r = await authenticateBearer(req(token), opts());
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.response.status).toBe(401);
				expect(r.response.headers.get("www-authenticate")).toContain("Bearer");
			}
		}
	});

	it("401 on a revoked token", async () => {
		const t = await createApiToken(db, "alice", {
			name: "rev",
			scopes: ["read"],
		});
		expect(await revokeApiToken(db, "alice", t.id)).toEqual({ revoked: true });
		const r = await authenticateBearer(req(t.token), opts());
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.response.status).toBe(401);
			expect(await r.response.json()).toEqual({
				error: "API token has been revoked",
			});
		}
	});

	it("401 on an expired token", async () => {
		const created = new Date("2026-01-01T00:00:00Z");
		const t = await createApiToken(
			db,
			"alice",
			{ name: "exp", scopes: ["read"], expiresInDays: 7 },
			created,
		);
		const before = await authenticateBearer(
			req(t.token),
			opts(new Date("2026-01-07T00:00:00Z")),
		);
		expect(before.ok).toBe(true);
		const r = await authenticateBearer(
			req(t.token),
			opts(new Date("2026-01-08T00:00:01Z")),
		);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.response.status).toBe(401);
			expect(await r.response.json()).toEqual({
				error: "API token has expired",
			});
		}
	});

	it("403 when the token lacks the required scope", async () => {
		const t = await createApiToken(db, "alice", {
			name: "imp",
			scopes: ["write:import"],
		});
		const r = await authenticateBearer(req(t.token), opts());
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.response.status).toBe(403);
			expect(r.response.headers.get("www-authenticate")).toContain(
				"insufficient_scope",
			);
		}
		const w = await authenticateBearer(req(t.token), {
			...opts(),
			requiredScope: "write:import",
		});
		expect(w.ok).toBe(true);
	});

	it("429 once the per-token rate limit is exceeded", async () => {
		const t = await createApiToken(db, "alice", {
			name: "rl",
			scopes: ["read"],
		});
		const rl = new FixedWindowRateLimiter(2, 60_000);
		const now = new Date("2026-11-07T10:00:00Z");
		expect((await authenticateBearer(req(t.token), opts(now, rl))).ok).toBe(
			true,
		);
		expect((await authenticateBearer(req(t.token), opts(now, rl))).ok).toBe(
			true,
		);
		const r = await authenticateBearer(req(t.token), opts(now, rl));
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.response.status).toBe(429);
			expect(Number(r.response.headers.get("retry-after"))).toBeGreaterThan(0);
		}
		// the next window resets the count
		const later = await authenticateBearer(
			req(t.token),
			opts(new Date(now.getTime() + 60_001), rl),
		);
		expect(later.ok).toBe(true);
	});
});
