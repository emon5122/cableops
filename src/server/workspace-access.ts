/**
 * Workspace read access for API-token principals.
 *
 * A token can read exactly the workspaces its user owns or is a member of
 * (permission mirrors `workspaces.getPermission`: owner, collaborator in a
 * collaboration-mode workspace, viewer otherwise). Unlike the browser UI,
 * knowing a workspace id is not enough: ownerless anonymous drafts and
 * workspaces the user never joined are not readable with a token.
 */

import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "./db-type";

export type WorkspacePermission = "owner" | "collaborator" | "viewer";

export interface ReadableWorkspace {
	id: string;
	name: string;
	mode: string;
	permission: WorkspacePermission;
	createdAt: Date | null;
}

function memberPermission(mode: string): WorkspacePermission {
	return mode === "collaboration" ? "collaborator" : "viewer";
}

export async function listReadableWorkspaces(
	db: Db,
	userId: string,
): Promise<ReadableWorkspace[]> {
	const owned = await db
		.select()
		.from(schema.workspaces)
		.where(eq(schema.workspaces.ownerId, userId));
	const joined = await db
		.select({ workspace: schema.workspaces })
		.from(schema.workspaceMembers)
		.innerJoin(
			schema.workspaces,
			eq(schema.workspaceMembers.workspaceId, schema.workspaces.id),
		)
		.where(eq(schema.workspaceMembers.userId, userId));

	const result = new Map<string, ReadableWorkspace>();
	for (const ws of owned) {
		result.set(ws.id, {
			id: ws.id,
			name: ws.name,
			mode: ws.mode,
			permission: "owner",
			createdAt: ws.createdAt,
		});
	}
	for (const { workspace: ws } of joined) {
		if (result.has(ws.id)) continue;
		result.set(ws.id, {
			id: ws.id,
			name: ws.name,
			mode: ws.mode,
			permission: memberPermission(ws.mode),
			createdAt: ws.createdAt,
		});
	}
	return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The user's permission on a workspace, or null when they cannot read it */
export async function getReadableWorkspace(
	db: Db,
	userId: string,
	workspaceId: string,
): Promise<ReadableWorkspace | null> {
	const rows = await db
		.select()
		.from(schema.workspaces)
		.where(eq(schema.workspaces.id, workspaceId));
	const ws = rows[0];
	if (!ws) return null;
	const base = {
		id: ws.id,
		name: ws.name,
		mode: ws.mode,
		createdAt: ws.createdAt,
	};
	if (ws.ownerId === userId) return { ...base, permission: "owner" };

	const members = await db
		.select({ id: schema.workspaceMembers.id })
		.from(schema.workspaceMembers)
		.where(
			and(
				eq(schema.workspaceMembers.workspaceId, workspaceId),
				eq(schema.workspaceMembers.userId, userId),
			),
		);
	if (members.length === 0) return null;
	return { ...base, permission: memberPermission(ws.mode) };
}
