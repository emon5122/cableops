/**
 * Workspace access rules, shared by `workspaces.getPermission` and the
 * cross-workspace link procedures. Pure so it can be unit-tested.
 *
 * - Unclaimed (ownerless) workspaces are anonymous drafts: anyone holding the
 *   id can edit them.
 * - The owner can edit.
 * - A member (joined via share link) can edit in "collaboration" mode and
 *   only read in "presentation" mode.
 * - Anyone else is an outsider: every read and write is refused. There is no
 *   view-by-URL and no anonymous read; outsiders get in only by signing in and
 *   joining through a share link, which makes them a member.
 */

export type WorkspacePermission = "owner" | "collaborator" | "viewer";

export interface WorkspaceAccessInput {
	ownerId: string | null;
	mode: string;
}

export interface WorkspaceAccess {
	/** Permission as reported to the workspace page (outsiders are "viewer"). */
	permission: WorkspacePermission;
	/** Owner or collaborator. */
	canEdit: boolean;
	/** Can see the workspace's name and topology from another workspace. */
	canRead: boolean;
}

export function resolveWorkspaceAccess(
	workspace: WorkspaceAccessInput,
	userId: string | null,
	isMember: boolean,
): WorkspaceAccess {
	if (!workspace.ownerId) {
		return { permission: "owner", canEdit: true, canRead: true };
	}
	if (userId && workspace.ownerId === userId) {
		return { permission: "owner", canEdit: true, canRead: true };
	}
	if (userId && isMember) {
		if (workspace.mode === "collaboration") {
			return { permission: "collaborator", canEdit: true, canRead: true };
		}
		return { permission: "viewer", canEdit: false, canRead: true };
	}
	return { permission: "viewer", canEdit: false, canRead: false };
}
