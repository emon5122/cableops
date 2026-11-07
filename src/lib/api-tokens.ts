/**
 * API token primitives (server-only: uses node:crypto).
 *
 * Format: `cops_` + 40 url-safe random chars (240 bits). The first 13 chars
 * (`cops_` + 8) are a non-secret lookup prefix; only the SHA-256 hex digest of
 * the full token is persisted, and verification compares digests in constant
 * time.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const API_TOKEN_PREFIX = "cops_";
export const API_TOKEN_SCOPES = ["read", "write:import"] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

const RANDOM_LENGTH = 40;
const LOOKUP_PREFIX_LENGTH = API_TOKEN_PREFIX.length + 8;
const TOKEN_PATTERN = new RegExp(
	`^${API_TOKEN_PREFIX}[A-Za-z0-9_-]{${RANDOM_LENGTH}}$`,
);

export interface GeneratedApiToken {
	/** Plaintext token — return to the user once, never store */
	token: string;
	prefix: string;
	hash: string;
}

export function generateApiToken(): GeneratedApiToken {
	const random = randomBytes(30).toString("base64url");
	const token = `${API_TOKEN_PREFIX}${random}`;
	return { token, prefix: tokenLookupPrefix(token), hash: hashApiToken(token) };
}

export function isWellFormedApiToken(token: string): boolean {
	return TOKEN_PATTERN.test(token);
}

export function tokenLookupPrefix(token: string): string {
	return token.slice(0, LOOKUP_PREFIX_LENGTH);
}

export function hashApiToken(token: string): string {
	return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time check of a plaintext token against a stored SHA-256 hex digest */
export function verifyApiToken(token: string, storedHash: string): boolean {
	const actual = Buffer.from(hashApiToken(token), "hex");
	const expected = Buffer.from(storedHash, "hex");
	if (actual.length !== expected.length) return false;
	return timingSafeEqual(actual, expected);
}

export type ApiTokenState = "active" | "revoked" | "expired";

export function apiTokenState(
	row: { revokedAt: Date | null; expiresAt: Date | null },
	now: Date = new Date(),
): ApiTokenState {
	if (row.revokedAt) return "revoked";
	if (row.expiresAt && row.expiresAt.getTime() <= now.getTime())
		return "expired";
	return "active";
}

/** Parse an `Authorization: Bearer <token>` header value */
export function parseBearer(header: string | null | undefined): string | null {
	if (!header) return null;
	const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
	return match ? match[1] : null;
}
