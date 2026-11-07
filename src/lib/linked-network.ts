/**
 * Union analysis across linked workspaces: merge the topologies of several
 * workspaces, turn their cross-links into connections and run the normal
 * analyzer over the result, so "can the VPS reach Home Assistant" works end
 * to end. Pure; the router only supplies the rows.
 */
import {
	analyzeNetwork,
	type ConnectionRow,
	computeDeviceReachability,
	type DeviceReachabilityResult,
	type DeviceRow,
	type InterfaceRow,
	type NetworkAnalysis,
	type NetworkIssue,
	type RouteRow,
} from "@/lib/topology-types";
import { linkToConnection, type WorkspaceLinkRow } from "@/lib/workspace-links";

export interface WorkspaceTopology {
	workspace: { id: string; name: string };
	devices: DeviceRow[];
	connections: ConnectionRow[];
	interfaces: InterfaceRow[];
	routes: RouteRow[];
}

export interface WorkspaceRef {
	id: string;
	name: string;
}

export interface UnionNetwork {
	devices: DeviceRow[];
	connections: ConnectionRow[];
	interfaces: InterfaceRow[];
	routes: RouteRow[];
	/** deviceId → the workspace it lives in */
	workspaceOf: Map<string, WorkspaceRef>;
	/** Cross-links included as connections (both ends inside the union). */
	crossLinks: number;
}

type UnionLink = Pick<
	WorkspaceLinkRow,
	| "id"
	| "workspaceAId"
	| "deviceAId"
	| "portA"
	| "workspaceBId"
	| "deviceBId"
	| "portB"
	| "linkType"
	| "speed"
> &
	Partial<Pick<WorkspaceLinkRow, "createdAt">>;

/**
 * Merge workspaces into one network. Device ids are globally unique (UUIDs),
 * so rows merge without renaming. A cross-link is kept only when both of its
 * devices are part of the union.
 */
export function buildUnionNetwork(
	parts: WorkspaceTopology[],
	links: UnionLink[],
): UnionNetwork {
	const workspaceOf = new Map<string, WorkspaceRef>();
	const devices: DeviceRow[] = [];
	const connections: ConnectionRow[] = [];
	const interfaces: InterfaceRow[] = [];
	const routes: RouteRow[] = [];
	const seenWs = new Set<string>();

	for (const part of parts) {
		if (seenWs.has(part.workspace.id)) continue;
		seenWs.add(part.workspace.id);
		const ref = { id: part.workspace.id, name: part.workspace.name };
		for (const d of part.devices) {
			workspaceOf.set(d.id, ref);
			devices.push(d);
		}
		connections.push(...part.connections);
		interfaces.push(...part.interfaces);
		routes.push(...part.routes);
	}

	let crossLinks = 0;
	const seenLinks = new Set<string>();
	for (const l of links) {
		if (seenLinks.has(l.id)) continue;
		seenLinks.add(l.id);
		const a = workspaceOf.get(l.deviceAId);
		const b = workspaceOf.get(l.deviceBId);
		if (!a || !b || a.id !== l.workspaceAId || b.id !== l.workspaceBId) {
			continue;
		}
		connections.push(linkToConnection(l));
		crossLinks += 1;
	}

	return { devices, connections, interfaces, routes, workspaceOf, crossLinks };
}

export interface LinkedNetworkIssue extends NetworkIssue {
	workspaceId: string | null;
	workspaceName: string | null;
}

export interface LinkedNetworkAnalysis extends NetworkAnalysis {
	issues: LinkedNetworkIssue[];
	union: UnionNetwork;
}

/** Tag issues with the workspace of the device they are about. */
export function tagIssuesWithWorkspace(
	issues: NetworkIssue[],
	workspaceOf: Map<string, WorkspaceRef>,
): LinkedNetworkIssue[] {
	return issues.map((issue) => {
		const ws = workspaceOf.get(issue.deviceId);
		return {
			...issue,
			workspaceId: ws?.id ?? null,
			workspaceName: ws?.name ?? null,
		};
	});
}

/** Run `analyzeNetwork` over the union of linked workspaces. */
export function analyzeLinkedNetwork(
	parts: WorkspaceTopology[],
	links: UnionLink[],
): LinkedNetworkAnalysis {
	const union = buildUnionNetwork(parts, links);
	const analysis = analyzeNetwork(
		union.devices,
		union.connections,
		union.interfaces,
		union.routes,
	);
	return {
		segments: analysis.segments,
		issues: tagIssuesWithWorkspace(analysis.issues, union.workspaceOf),
		union,
	};
}

/** Reachability from one device across the union of linked workspaces. */
export function computeLinkedReachability(
	focusDeviceId: string,
	parts: WorkspaceTopology[],
	links: UnionLink[],
): DeviceReachabilityResult {
	const union = buildUnionNetwork(parts, links);
	return computeDeviceReachability(
		focusDeviceId,
		union.devices,
		union.connections,
		union.interfaces,
		union.routes,
	);
}

/**
 * Workspaces reachable from `startId` over cross-links, visiting only
 * workspaces `include` allows (default: `canRead`). Returns the visited ids
 * (start first), how many linked workspaces were skipped because the viewer
 * cannot read them, and `truncated` when a readable workspace was left out
 * anyway (the caller's size cap), so it is not miscounted as locked.
 */
export function collectLinkedWorkspaces(
	startId: string,
	links: Pick<WorkspaceLinkRow, "workspaceAId" | "workspaceBId">[],
	canRead: (workspaceId: string) => boolean,
	include: (workspaceId: string) => boolean = canRead,
): { workspaceIds: string[]; lockedCount: number; truncated: boolean } {
	const visited = new Set<string>([startId]);
	const skipped = new Set<string>();
	const locked = new Set<string>();
	let truncated = false;
	const order = [startId];
	const queue = [startId];
	while (queue.length > 0) {
		const current = queue.shift() as string;
		for (const l of links) {
			const next =
				l.workspaceAId === current
					? l.workspaceBId
					: l.workspaceBId === current
						? l.workspaceAId
						: null;
			if (!next || visited.has(next) || skipped.has(next)) continue;
			if (!canRead(next)) {
				skipped.add(next);
				locked.add(next);
				continue;
			}
			if (!include(next)) {
				skipped.add(next);
				truncated = true;
				continue;
			}
			visited.add(next);
			order.push(next);
			queue.push(next);
		}
	}
	return { workspaceIds: order, lockedCount: locked.size, truncated };
}
