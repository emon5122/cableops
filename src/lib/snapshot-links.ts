/**
 * Cross-workspace links in workspace snapshots: export shape and the import
 * plan. Pure; the router loads the rows and performs the inserts.
 */
import type { ConnectionRow, DeviceRow } from "@/lib/topology-types";
import type { WorkspaceAccess } from "@/lib/workspace-access";
import {
	type LinkEnd,
	validateNewLink,
	type WorkspaceLinkRow,
	type WorkspaceLinkType,
	type WorkspaceLinkView,
} from "@/lib/workspace-links";
import type { SnapshotWorkspaceLink } from "@/lib/workspace-snapshot-schema";

/** Snapshot entry for a link, or null for a locked one (never exported). */
export function snapshotLinkFromView(
	view: WorkspaceLinkView,
): SnapshotWorkspaceLink | null {
	if (view.far.locked) return null;
	return {
		id: view.id,
		linkType: view.linkType,
		label: view.label,
		speed: view.speed,
		local: { deviceId: view.local.deviceId, port: view.local.port },
		remote: {
			workspaceId: view.far.workspaceId,
			workspaceName: view.far.workspaceName,
			deviceId: view.far.deviceId,
			deviceName: view.far.deviceName,
			port: view.far.port,
		},
	};
}

export interface PlannedLink {
	workspaceAId: string;
	deviceAId: string;
	portA: number;
	workspaceBId: string;
	deviceBId: string;
	portB: number;
	linkType: WorkspaceLinkType;
	label: string | null;
	speed: string | null;
}

export interface SkippedLink {
	id: string;
	label: string | null;
	reason: string;
}

type DeviceLike = Pick<DeviceRow, "id" | "workspaceId" | "portCount" | "name">;
type ConnectionLike = Pick<
	ConnectionRow,
	"deviceAId" | "portA" | "deviceBId" | "portB"
>;
type LinkLike = Pick<
	WorkspaceLinkRow,
	| "id"
	| "workspaceAId"
	| "deviceAId"
	| "portA"
	| "workspaceBId"
	| "deviceBId"
	| "portB"
>;

export interface SnapshotLinkImportInput {
	/** Workspace the snapshot is being imported into. */
	workspaceId: string;
	links: SnapshotWorkspaceLink[];
	/** Snapshot device id → newly created device id. */
	deviceIdMap: Map<string, string>;
	/** Caller's access per workspace id (target and remotes); absent = missing. */
	access: Map<string, WorkspaceAccess>;
	/** Devices of the target workspace after the import. */
	localDevices: DeviceLike[];
	/** Connections of the target workspace after the import. */
	localConnections: ConnectionLike[];
	/** Remote devices referenced by the snapshot (any that still exist). */
	remoteDevices: DeviceLike[];
	/** Connections touching those remote devices. */
	remoteConnections: ConnectionLike[];
	/** Existing cross-links touching those remote devices. */
	remoteLinks: LinkLike[];
}

/**
 * Decide which snapshot links to recreate. A link is recreated only when its
 * local device was imported, its remote device still exists in the named
 * workspace, the caller can edit both workspaces and neither port is taken
 * (including by a link planned earlier in the same import). Everything else
 * is skipped with a reason. A remote device in a workspace the caller cannot
 * read is reported as a permission problem, never as missing.
 */
export function planSnapshotLinkImport(input: SnapshotLinkImportInput): {
	create: PlannedLink[];
	skipped: SkippedLink[];
} {
	const create: PlannedLink[] = [];
	const skipped: SkippedLink[] = [];
	const planned: LinkLike[] = [];
	const localAccess = input.access.get(input.workspaceId) ?? null;

	for (const l of input.links) {
		const skip = (reason: string) => {
			skipped.push({ id: l.id, label: l.label ?? null, reason });
		};
		const localDeviceId = input.deviceIdMap.get(l.local.deviceId);
		if (!localDeviceId) {
			skip("Local device is not part of this snapshot");
			continue;
		}
		const remoteAccess = input.access.get(l.remote.workspaceId) ?? null;
		if (!remoteAccess) {
			skip("Linked workspace no longer exists");
			continue;
		}
		const remoteDevice =
			input.remoteDevices.find((d) => d.id === l.remote.deviceId) ?? null;
		if (
			remoteAccess.canRead &&
			(!remoteDevice || remoteDevice.workspaceId !== l.remote.workspaceId)
		) {
			skip("Linked device no longer exists in that workspace");
			continue;
		}

		const localEnd: LinkEnd = {
			workspaceId: input.workspaceId,
			deviceId: localDeviceId,
			port: l.local.port,
		};
		const remoteEnd: LinkEnd = {
			workspaceId: l.remote.workspaceId,
			deviceId: l.remote.deviceId,
			port: l.remote.port,
		};
		const err = validateNewLink(
			localEnd,
			remoteEnd,
			{
				access: localAccess,
				device: input.localDevices.find((d) => d.id === localDeviceId) ?? null,
				connections: input.localConnections,
				links: planned,
			},
			{
				access: remoteAccess,
				device: remoteDevice,
				connections: input.remoteConnections,
				links: [...input.remoteLinks, ...planned],
			},
		);
		if (err) {
			skip(err.message);
			continue;
		}

		const row: PlannedLink = {
			workspaceAId: localEnd.workspaceId,
			deviceAId: localEnd.deviceId,
			portA: localEnd.port,
			workspaceBId: remoteEnd.workspaceId,
			deviceBId: remoteEnd.deviceId,
			portB: remoteEnd.port,
			linkType: l.linkType ?? "wired",
			label: l.label ?? null,
			speed: l.speed ?? null,
		};
		create.push(row);
		planned.push({ id: `planned-${planned.length}`, ...row });
	}
	return { create, skipped };
}
