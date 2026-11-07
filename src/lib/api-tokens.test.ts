import { describe, expect, it } from "vitest";
import {
	apiTokenState,
	generateApiToken,
	hashApiToken,
	isWellFormedApiToken,
	parseBearer,
	tokenLookupPrefix,
	verifyApiToken,
} from "./api-tokens";

describe("api token primitives", () => {
	it("generates cops_ tokens with a lookup prefix and a sha256 hash", () => {
		const { token, prefix, hash } = generateApiToken();
		expect(token).toMatch(/^cops_[A-Za-z0-9_-]{40}$/);
		expect(isWellFormedApiToken(token)).toBe(true);
		expect(prefix).toBe(token.slice(0, 13));
		expect(tokenLookupPrefix(token)).toBe(prefix);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(hash).toBe(hashApiToken(token));
	});

	it("generates distinct tokens", () => {
		const seen = new Set(
			Array.from({ length: 50 }, () => generateApiToken().token),
		);
		expect(seen.size).toBe(50);
	});

	it("verifies only the matching token", () => {
		const a = generateApiToken();
		const b = generateApiToken();
		expect(verifyApiToken(a.token, a.hash)).toBe(true);
		expect(verifyApiToken(b.token, a.hash)).toBe(false);
		expect(verifyApiToken(`${a.token}x`, a.hash)).toBe(false);
		expect(verifyApiToken(a.token, "abcd")).toBe(false);
		expect(verifyApiToken(a.token, "")).toBe(false);
	});

	it("rejects malformed tokens", () => {
		expect(isWellFormedApiToken("cops_short")).toBe(false);
		expect(isWellFormedApiToken(`xops_${"a".repeat(40)}`)).toBe(false);
		expect(isWellFormedApiToken(`cops_${"a".repeat(39)}!`)).toBe(false);
	});

	it("parses bearer headers", () => {
		expect(parseBearer("Bearer cops_abc")).toBe("cops_abc");
		expect(parseBearer("bearer   cops_abc ")).toBe("cops_abc");
		expect(parseBearer("Basic dXNlcjpwYXNz")).toBeNull();
		expect(parseBearer("Bearer a b")).toBeNull();
		expect(parseBearer(null)).toBeNull();
	});

	it("derives token state", () => {
		const now = new Date("2026-11-07T12:00:00Z");
		expect(apiTokenState({ revokedAt: null, expiresAt: null }, now)).toBe(
			"active",
		);
		expect(
			apiTokenState(
				{ revokedAt: null, expiresAt: new Date("2026-11-08T00:00:00Z") },
				now,
			),
		).toBe("active");
		expect(apiTokenState({ revokedAt: null, expiresAt: now }, now)).toBe(
			"expired",
		);
		expect(
			apiTokenState(
				{ revokedAt: new Date("2026-11-01T00:00:00Z"), expiresAt: null },
				now,
			),
		).toBe("revoked");
	});
});
