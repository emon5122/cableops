/**
 * Share-link flow decision, pure so it can be unit-tested.
 *
 * Signed-out visitors get NO anonymous read: they must sign in first, then the
 * share link joins them to the workspace as a member.
 */

export type ShareFlowState =
	| { kind: "resolving" }
	| { kind: "invalid" }
	| { kind: "sign-in-required" }
	| { kind: "join" };

export function resolveShareFlow(input: {
	sessionPending: boolean;
	signedIn: boolean;
	linkLoading: boolean;
	linkValid: boolean;
}): ShareFlowState {
	if (input.linkLoading || input.sessionPending) return { kind: "resolving" };
	if (!input.linkValid) return { kind: "invalid" };
	if (!input.signedIn) return { kind: "sign-in-required" };
	return { kind: "join" };
}

const KEY = "cableops:post-auth-redirect";

/** Remember the share path so sign-in/sign-up can return to it. */
export function rememberShareRedirect(path: string): void {
	try {
		if (path.startsWith("/share/") && !path.includes("//")) {
			sessionStorage.setItem(KEY, path);
		}
	} catch {
		/* storage unavailable: user lands on / and reopens the link */
	}
}

/** Pop the remembered path (only ever a same-origin /share/… path). */
export function takeShareRedirect(): string | null {
	try {
		const v = sessionStorage.getItem(KEY);
		sessionStorage.removeItem(KEY);
		return v && v.startsWith("/share/") && !v.includes("//") ? v : null;
	} catch {
		return null;
	}
}
