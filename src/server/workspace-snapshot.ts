/**
 * Workspace snapshot export — the single source for the UI "Export JSON"
 * (tRPC `workspaces.exportSnapshot`) and the MCP `get_snapshot` tool.
 * Format: public/schemas/workspace-snapshot.schema.json.
 */

import { and, eq, inArray, or } from "drizzle-orm";
import * as schema from "@/db/schema";
import { snapshotLinkFromView } from "@/lib/snapshot-links";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { orientLink, toLinkView } from "@/lib/workspace-links";
import type { SnapshotWorkspaceLink } from "@/lib/workspace-snapshot-schema";
import type { Db } from "./db-type";

/**
 * Cross-links of one workspace, limited to those whose far workspace
 * `userId` may read, so an export never reveals a workspace they cannot see.
 */
async function exportableLinks(
	db: Db,
	workspaceId: string,
	userId: string | null,
): Promise<SnapshotWorkspaceLink[]> {
	const links = await db
		.select()
		.from(schema.workspaceLinks)
		.where(
			or(
				eq(schema.workspaceLinks.workspaceAId, workspaceId),
				eq(schema.workspaceLinks.workspaceBId, workspaceId),
			),
		);
	if (links.length === 0) return [];

	const farIds = [
		...new Set(
			links
				.map((l) => orientLink(l, workspaceId)?.far.workspaceId)
				.filter((id): id is string => !!id),
		),
	];
	const farWorkspaces = await db
		.select()
		.from(schema.workspaces)
		.where(inArray(schema.workspaces.id, farIds));
	const memberOf = new Set<string>();
	if (userId && farIds.length > 0) {
		const memberships = await db
			.select({ workspaceId: schema.workspaceMembers.workspaceId })
			.from(schema.workspaceMembers)
			.where(
				and(
					eq(schema.workspaceMembers.userId, userId),
					inArray(schema.workspaceMembers.workspaceId, farIds),
				),
			);
		for (const m of memberships) memberOf.add(m.workspaceId);
	}
	const readable = new Map(
		farWorkspaces
			.filter(
				(w) =>
					resolveWorkspaceAccess(w, userId, memberOf.has(w.id)).canRead,
			)
			.map((w) => [w.id, w]),
	);

	const readableDeviceIds = links
		.map((l) => orientLink(l, workspaceId)?.far)
		.filter((e) => e && readable.has(e.workspaceId))
		.map((e) => e?.deviceId as string);
	const deviceNames = new Map<string, string>();
	if (readableDeviceIds.length > 0) {
		const rows = await db
			.select({ id: schema.devices.id, name: schema.devices.name })
			.from(schema.devices)
			.where(inArray(schema.devices.id, [...new Set(readableDeviceIds)]));
		for (const r of rows) deviceNames.set(r.id, r.name);
	}

	const out: SnapshotWorkspaceLink[] = [];
	for (const l of links) {
		const o = orientLink(l, workspaceId);
		if (!o) continue;
		const far = readable.get(o.far.workspaceId);
		const view = toLinkView(
			l,
			workspaceId,
			far
				? {
						workspaceName: far.name,
						deviceName: deviceNames.get(o.far.deviceId) ?? "Unknown device",
					}
				: null,
		);
		const entry = view ? snapshotLinkFromView(view) : null;
		if (entry) out.push(entry);
	}
	return out;
}

export interface SnapshotOptions {
	/**
	 * Blank credential fields (interface WiFi passwords). Used for the MCP /
	 * API-token path so agents never receive secrets; the UI export keeps them.
	 */
	redactCredentials?: boolean;
}

export async function buildWorkspaceSnapshot(
	db: Db,
	workspaceId: string,
	userId: string | null,
	options: SnapshotOptions = {},
) {
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

	const workspaceLinks = await exportableLinks(db, workspaceId, userId);

	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		workspace: {
			id: workspace.id,
			name: workspace.name,
		},
		devices,
		interfaces: options.redactCredentials
			? interfaces.map((i) => ({ ...i, wifiPassword: null }))
			: interfaces,
		connections,
		routes,
		annotations,
		workspaceLinks,
	};
}

export type BuiltWorkspaceSnapshot = Awaited<
	ReturnType<typeof buildWorkspaceSnapshot>
>;
