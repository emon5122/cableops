import { describe, expect, it } from "vitest";
import { resolveShareFlow } from "./share-flow";

const base = {
	sessionPending: false,
	signedIn: true,
	linkLoading: false,
	linkValid: true,
};

describe("resolveShareFlow", () => {
	it("waits while the link or session is loading", () => {
		expect(resolveShareFlow({ ...base, linkLoading: true }).kind).toBe(
			"resolving",
		);
		expect(resolveShareFlow({ ...base, sessionPending: true }).kind).toBe(
			"resolving",
		);
	});
	it("rejects an invalid link", () => {
		expect(resolveShareFlow({ ...base, linkValid: false }).kind).toBe(
			"invalid",
		);
	});
	it("requires sign-in for signed-out visitors (never redirects them to read)", () => {
		expect(resolveShareFlow({ ...base, signedIn: false }).kind).toBe(
			"sign-in-required",
		);
	});
	it("joins signed-in users", () => {
		expect(resolveShareFlow(base).kind).toBe("join");
	});
});
