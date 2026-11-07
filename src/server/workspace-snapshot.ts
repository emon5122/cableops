/**
 * Workspace snapshot export — the single source for the UI "Export JSON"
 * (tRPC `workspaces.exportSnapshot`) and the MCP `get_snapshot` tool.
 * Format: public/schemas/workspace-snapshot.schema.json.
 */

import { eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "./db-type";

export async function buildWorkspaceSnapshot(db: Db, workspaceId: string) {
	const wsRows = await db
		.select()
		.from(schema.workspaces)
		.where(eq(schema.workspaces.id, workspaceId));
	const workspace = wsRows[0];
	if (!workspace) throw new Error("Workspace not found");

	const devices = await db
		.select()
		.from(schema.devices)
		.where(eq(schema.devices.workspaceId, workspaceId));
	const deviceIds = devices.map((d) => d.id);

	const connections = await db
		.select()
		.from(schema.connections)
		.where(eq(schema.connections.workspaceId, workspaceId));

	const annotations = await db
		.select()
		.from(schema.annotations)
		.where(eq(schema.annotations.workspaceId, workspaceId));

	const interfaces =
		deviceIds.length > 0
			? await db
					.select()
					.from(schema.interfaces)
					.where(inArray(schema.interfaces.deviceId, deviceIds))
			: [];

	const routes =
		deviceIds.length > 0
			? await db
					.select()
					.from(schema.routes)
					.where(inArray(schema.routes.deviceId, deviceIds))
			: [];

	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		workspace: {
			id: workspace.id,
			name: workspace.name,
		},
		devices,
		interfaces,
		connections,
		routes,
		annotations,
	};
}

export type BuiltWorkspaceSnapshot = Awaited<
	ReturnType<typeof buildWorkspaceSnapshot>
>;
