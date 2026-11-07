/**
 * Cross-workspace links: pure rules shared by the tRPC router, the canvas
 * and the tests. Nothing here touches the database.
 */

import type { InferSelectModel } from "drizzle-orm";
import type { workspaceLinks } from "@/db/schema";
import type { ConnectionRow, DeviceRow } from "@/lib/topology-types";
import type { WorkspaceAccess } from "@/lib/workspace-access";

export const WORKSPACE_LINK_TYPES = [
	"wired",
	"wifi",
	"vpn",
	"tunnel",
	"wan",
] as const;

export type WorkspaceLinkType = (typeof WORKSPACE_LINK_TYPES)[number];

export const WORKSPACE_LINK_TYPE_LABELS: Record<WorkspaceLinkType, string> = {
	wired: "Wired",
	wifi: "WiFi",
	vpn: "VPN",
	tunnel: "Tunnel",
	wan: "WAN",
};

export type WorkspaceLinkRow = InferSelectModel<typeof workspaceLinks>;

/** Text shown for the far side of a link the viewer cannot read. */
export const LOCKED_LINK_LABEL = "linked workspace";

/** One end of a link: a port on a device in a workspace. */
export interface LinkEnd {
	workspaceId: string;
	deviceId: string;
	port: number;
}

type LinkEndsRow = Pick<
	WorkspaceLinkRow,
	| "id"
	| "workspaceAId"
	| "deviceAId"
	| "portA"
	| "workspaceBId"
	| "deviceBId"
	| "portB"
>;

type ConnectionEndsRow = Pick<
	ConnectionRow,
	"deviceAId" | "portA" | "deviceBId" | "portB"
>;

export function linkEnds(link: LinkEndsRow): [LinkEnd, LinkEnd] {
	return [
		{
			workspaceId: link.workspaceAId,
			deviceId: link.deviceAId,
			port: link.portA,
		},
		{
			workspaceId: link.workspaceBId,
			deviceId: link.deviceBId,
			port: link.portB,
		},
	];
}

/**
 * Orient a link relative to a workspace: `local` is the end inside
 * `workspaceId`, `far` the other one. Null when the link does not touch it.
 */
export function orientLink(
	link: LinkEndsRow,
	workspaceId: string,
): { local: LinkEnd; far: LinkEnd } | null {
	const [a, b] = linkEnds(link);
	if (a.workspaceId === workspaceId) return { local: a, far: b };
	if (b.workspaceId === workspaceId) return { local: b, far: a };
	return null;
}

/**
 * What currently occupies a port: a local connection, a cross-link, or
 * nothing. Port 0 is the virtual WiFi interface and may be shared, exactly
 * as for connections, so it is never reported as occupied.
 */
export function portOccupant(
	deviceId: string,
	port: number,
	connections: ConnectionEndsRow[],
	links: LinkEndsRow[],
	ignoreLinkId?: string,
): "connection" | "link" | null {
	if (port === 0) return null;
	for (const c of connections) {
		if (
			(c.deviceAId === deviceId && c.portA === port) ||
			(c.deviceBId === deviceId && c.portB === port)
		) {
			return "connection";
		}
	}
	for (const l of links) {
		if (l.id === ignoreLinkId) continue;
		if (
			(l.deviceAId === deviceId && l.portA === port) ||
			(l.deviceBId === deviceId && l.portB === port)
		) {
			return "link";
		}
	}
	return null;
}

/* ── Validation ── */

export type LinkErrorCode = "FORBIDDEN" | "BAD_REQUEST" | "CONFLICT";

export interface LinkValidationError {
	code: LinkErrorCode;
	message: string;
}

/** Everything the validator needs to know about one end of a new link. */
export interface LinkEndContext {
	access: WorkspaceAccess | null;
	device: Pick<DeviceRow, "id" | "workspaceId" | "portCount" | "name"> | null;
	/** Connections inside the end's workspace. */
	connections: ConnectionEndsRow[];
	/** Every cross-link touching the end's device. */
	links: LinkEndsRow[];
}

/** Edit permission on both workspaces (owner or collaborator). */
export function checkLinkEditAccess(
	a: WorkspaceAccess | null,
	b: WorkspaceAccess | null,
): LinkValidationError | null {
	if (!a?.canEdit || !b?.canEdit) {
		return {
			code: "FORBIDDEN",
			message: "You need edit access to both workspaces to change this link",
		};
	}
	return null;
}

/** Validate a new cross-workspace link between `a` and `b`. */
export function validateNewLink(
	a: LinkEnd,
	b: LinkEnd,
	ctxA: LinkEndContext,
	ctxB: LinkEndContext,
): LinkValidationError | null {
	if (a.workspaceId === b.workspaceId) {
		return {
			code: "BAD_REQUEST",
			message:
				"Both ends are in the same workspace; use a normal connection instead",
		};
	}
	const denied = checkLinkEditAccess(ctxA.access, ctxB.access);
	if (denied) return denied;

	for (const [end, ctx, side] of [
		[a, ctxA, "A"],
		[b, ctxB, "B"],
	] as const) {
		const dev = ctx.device;
		if (
			!dev ||
			dev.id !== end.deviceId ||
			dev.workspaceId !== end.workspaceId
		) {
			return {
				code: "BAD_REQUEST",
				message: `Device ${side} does not exist in its workspace`,
			};
		}
		if (!Number.isInteger(end.port) || end.port > dev.portCount) {
			return {
				code: "BAD_REQUEST",
				message: `Port ${end.port} does not exist on ${dev.name}`,
			};
		}
		/* Port 0 is the shared virtual WiFi interface; a site-to-site link
		   always terminates on a physical port. */
		if (end.port < 1) {
			return {
				code: "BAD_REQUEST",
				message: "Cross-workspace links need a physical port (1 or higher)",
			};
		}
		const used = portOccupant(
			end.deviceId,
			end.port,
			ctx.connections,
			ctx.links,
		);
		if (used) {
			return {
				code: "CONFLICT",
				message: `Port ${end.port} on ${dev.name} is already ${
					used === "connection" ? "connected" : "linked to another workspace"
				}`,
			};
		}
	}
	return null;
}

/* ── Views ── */

export type WorkspaceLinkFarSide =
	| {
			locked: false;
			workspaceId: string;
			workspaceName: string;
			deviceId: string;
			deviceName: string;
			port: number;
	  }
	| { locked: true; label: string };

export interface WorkspaceLinkView {
	id: string;
	linkType: WorkspaceLinkType;
	label: string | null;
	speed: string | null;
	/** The end inside the workspace the list was requested for. */
	local: { deviceId: string; port: number };
	far: WorkspaceLinkFarSide;
}

/**
 * Build the view of a link from `workspaceId`'s side. `farInfo` is the far
 * workspace/device names, passed only when the viewer may read the far
 * workspace; otherwise the far side becomes a locked stub that reveals
 * neither ids nor names.
 */
export function toLinkView(
	link: LinkEndsRow & Pick<WorkspaceLinkRow, "linkType" | "label" | "speed">,
	workspaceId: string,
	farInfo: { workspaceName: string; deviceName: string } | null,
): WorkspaceLinkView | null {
	const o = orientLink(link, workspaceId);
	if (!o) return null;
	return {
		id: link.id,
		linkType: link.linkType,
		label: link.label,
		speed: link.speed,
		local: { deviceId: o.local.deviceId, port: o.local.port },
		far: farInfo
			? {
					locked: false,
					workspaceId: o.far.workspaceId,
					workspaceName: farInfo.workspaceName,
					deviceId: o.far.deviceId,
					deviceName: farInfo.deviceName,
					port: o.far.port,
				}
			: { locked: true, label: LOCKED_LINK_LABEL },
	};
}

export function linkedPortKey(deviceId: string, port: number): string {
	return `${deviceId}:${port}`;
}

/** Map "deviceId:port" → link view, for the canvas badges. */
export function buildLinkedPortMap(
	views: WorkspaceLinkView[],
): Map<string, WorkspaceLinkView> {
	const m = new Map<string, WorkspaceLinkView>();
	for (const v of views) {
		m.set(linkedPortKey(v.local.deviceId, v.local.port), v);
	}
	return m;
}

/**
 * A cross-link as a plain connection row, so the existing analyzer can walk
 * it. WiFi links stay WiFi; VPN/tunnel/WAN behave like a point-to-point wire
 * between the two ports (their interface IPs model the tunnel subnet).
 */
export function linkToConnection(
	link: LinkEndsRow &
		Pick<WorkspaceLinkRow, "linkType" | "speed"> &
		Partial<Pick<WorkspaceLinkRow, "createdAt">>,
): ConnectionRow {
	return {
		id: `xlink:${link.id}`,
		workspaceId: link.workspaceAId,
		deviceAId: link.deviceAId,
		portA: link.portA,
		deviceBId: link.deviceBId,
		portB: link.portB,
		speed: link.speed,
		connectionType: link.linkType === "wifi" ? "wifi" : "wired",
		createdAt: link.createdAt ?? null,
	};
}

/* ── Site map ── */

export interface SiteMapEdge {
	key: string;
	source: string;
	target: string;
	count: number;
	types: WorkspaceLinkType[];
}

/**
 * Aggregate links into one edge per workspace pair with the link count and
 * the distinct link types. `nodeKey` maps a workspace id to its node key
 * (or null to drop links to that workspace).
 */
export function aggregateSiteEdges(
	links: (LinkEndsRow & Pick<WorkspaceLinkRow, "linkType">)[],
	nodeKey: (workspaceId: string) => string | null,
): SiteMapEdge[] {
	const edges = new Map<string, SiteMapEdge>();
	for (const l of links) {
		const a = nodeKey(l.workspaceAId);
		const b = nodeKey(l.workspaceBId);
		if (!a || !b || a === b) continue;
		const [source, target] = a < b ? [a, b] : [b, a];
		const key = `${source}|${target}`;
		const edge = edges.get(key) ?? { key, source, target, count: 0, types: [] };
		edge.count += 1;
		if (!edge.types.includes(l.linkType)) edge.types.push(l.linkType);
		edges.set(key, edge);
	}
	return [...edges.values()];
}
