/**
 * Bearer-token authentication for API routes (MCP, future REST).
 *
 *   401  missing / malformed / unknown / revoked / expired token
 *   403  valid token without the required scope
 *   429  per-token rate limit exceeded
 *
 * The rate limiter is a simple in-memory fixed window per token id
 * (default 120 requests / minute, override with CABLEOPS_TOKEN_RATE_LIMIT).
 * It is per process: with several app replicas each replica counts on its own.
 */

import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
	API_TOKEN_SCOPES,
	type ApiTokenScope,
	apiTokenState,
	isWellFormedApiToken,
	parseBearer,
	tokenLookupPrefix,
	verifyApiToken,
} from "@/lib/api-tokens";
import type { Db } from "./db-type";

/** Who a request acts as when authenticated with an API token */
export interface TokenPrincipal {
	userId: string;
	tokenId: string;
	scopes: ApiTokenScope[];
}

export type BearerAuthResult =
	| { ok: true; principal: TokenPrincipal }
	| { ok: false; response: Response };

/** lastUsedAt is written at most once per this interval per token */
export const LAST_USED_THROTTLE_MS = 60_000;

export class FixedWindowRateLimiter {
	private windows = new Map<string, { start: number; count: number }>();

	constructor(
		readonly limit: number,
		readonly windowMs: number,
	) {}

	/** Returns 0 when allowed, otherwise the seconds until the window resets */
	hit(key: string, now: number = Date.now()): number {
		const w = this.windows.get(key);
		if (!w || now - w.start >= this.windowMs) {
			this.windows.set(key, { start: now, count: 1 });
			if (this.windows.size > 10_000) this.prune(now);
			return 0;
		}
		w.count += 1;
		if (w.count <= this.limit) return 0;
		return Math.max(1, Math.ceil((w.start + this.windowMs - now) / 1000));
	}

	private prune(now: number) {
		for (const [k, w] of this.windows) {
			if (now - w.start >= this.windowMs) this.windows.delete(k);
		}
	}
}

function defaultLimit(): number {
	const raw = Number(process.env.CABLEOPS_TOKEN_RATE_LIMIT);
	return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 120;
}

export const defaultRateLimiter = new FixedWindowRateLimiter(
	defaultLimit(),
	60_000,
);

function jsonError(
	status: number,
	message: string,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

function unauthorized(message: string): BearerAuthResult {
	return {
		ok: false,
		response: jsonError(401, message, {
			"www-authenticate": 'Bearer realm="cableops", error="invalid_token"',
		}),
	};
}

export interface BearerAuthOptions {
	db: Db;
	requiredScope: ApiTokenScope;
	rateLimiter?: FixedWindowRateLimiter;
	now?: Date;
}

export async function authenticateBearer(
	request: Request,
	{
		db,
		requiredScope,
		rateLimiter = defaultRateLimiter,
		now = new Date(),
	}: BearerAuthOptions,
): Promise<BearerAuthResult> {
	const header = request.headers.get("authorization");
	if (!header) {
		return {
			ok: false,
			response: jsonError(401, "Missing Authorization: Bearer <token> header", {
				"www-authenticate": 'Bearer realm="cableops"',
			}),
		};
	}
	const token = parseBearer(header);
	if (!token || !isWellFormedApiToken(token)) {
		return unauthorized("Malformed API token");
	}

	const candidates = await db
		.select()
		.from(schema.apiTokens)
		.where(eq(schema.apiTokens.prefix, tokenLookupPrefix(token)));
	let row: (typeof candidates)[number] | undefined;
	for (const c of candidates) {
		if (verifyApiToken(token, c.tokenHash)) row = c;
	}
	if (!row) return unauthorized("Invalid API token");

	const state = apiTokenState(row, now);
	if (state === "revoked") return unauthorized("API token has been revoked");
	if (state === "expired") return unauthorized("API token has expired");

	const retryAfter = rateLimiter.hit(row.id, now.getTime());
	if (retryAfter > 0) {
		return {
			ok: false,
			response: jsonError(429, "Rate limit exceeded for this API token", {
				"retry-after": String(retryAfter),
			}),
		};
	}

	const scopes = row.scopes.filter((s): s is ApiTokenScope =>
		(API_TOKEN_SCOPES as readonly string[]).includes(s),
	);
	if (!scopes.includes(requiredScope)) {
		return {
			ok: false,
			response: jsonError(403, `API token lacks the "${requiredScope}" scope`, {
				"www-authenticate": `Bearer realm="cableops", error="insufficient_scope", scope="${requiredScope}"`,
			}),
		};
	}

	if (
		!row.lastUsedAt ||
		now.getTime() - row.lastUsedAt.getTime() >= LAST_USED_THROTTLE_MS
	) {
		try {
			await db
				.update(schema.apiTokens)
				.set({ lastUsedAt: now })
				.where(eq(schema.apiTokens.id, row.id));
		} catch (error) {
			console.error("Failed to update API token lastUsedAt", error);
		}
	}

	return {
		ok: true,
		principal: { userId: row.userId, tokenId: row.id, scopes },
	};
}
