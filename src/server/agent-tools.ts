/**
 * Read-only analysis helpers behind the MCP tools. Pure functions over a
 * workspace snapshot, reusing the same analyzer the Insights panel uses.
 */
import {
	analyzeNetwork,
	computeDeviceReachability,
	discoverAllSegments,
	type NetworkSegment,
	type ReachabilityStatus,
} from "@/lib/topology-types";
import type { BuiltWorkspaceSnapshot } from "./workspace-snapshot";

type Snapshot = Pick<
	BuiltWorkspaceSnapshot,
	"workspace" | "devices" | "interfaces" | "connections" | "routes"
>;
type Device = Snapshot["devices"][number];

/** A user-facing error (bad device name, ambiguous match, …) */
export class AgentToolError extends Error {}

function describeSegment(seg: NetworkSegment, nameOf: (id: string) => string) {
	return {
		id: seg.id,
		subnet: seg.subnet,
		gateway: seg.gateway
			? {
					deviceId: seg.gateway.deviceId,
					deviceName: nameOf(seg.gateway.deviceId),
					portNumber: seg.gateway.portNumber,
					ip: `${seg.gateway.ip}/${seg.gateway.cidr}`,
				}
			: null,
		ports: seg.ports.map((p) => ({
			deviceId: p.deviceId,
			deviceName: nameOf(p.deviceId),
			portNumber: p.portNumber,
		})),
	};
}

function deviceNamer(devices: Device[]) {
	const names = new Map(devices.map((d) => [d.id, d.name]));
	return (id: string) => names.get(id) ?? id;
}

/** Network Insights for a workspace: issues plus discovered L2 segments */
export function analyzeSnapshot(snapshot: Snapshot) {
	const { devices, connections, interfaces, routes } = snapshot;
	const nameOf = deviceNamer(devices);
	const analysis = analyzeNetwork(devices, connections, interfaces, routes);
	const count = (s: string) =>
		analysis.issues.filter((i) => i.severity === s).length;
	return {
		workspace: snapshot.workspace,
		summary: {
			devices: devices.length,
			connections: connections.length,
			segments: analysis.segments.length,
			errors: count("error"),
			warnings: count("warning"),
			info: count("info"),
		},
		issues: analysis.issues.map((i) => ({
			severity: i.severity,
			type: i.type,
			message: i.message,
			deviceId: i.deviceId,
			deviceName: nameOf(i.deviceId),
			portNumber: i.portNumber ?? null,
		})),
		segments: analysis.segments.map((s) => describeSegment(s, nameOf)),
	};
}

/** Resolve a device by exact id, else by case-insensitive name */
export function resolveDevice(devices: Device[], ref: string): Device {
	const byId = devices.find((d) => d.id === ref);
	if (byId) return byId;
	const needle = ref.trim().toLowerCase();
	const byName = devices.filter((d) => d.name.trim().toLowerCase() === needle);
	if (byName.length === 1) return byName[0];
	if (byName.length > 1) {
		throw new AgentToolError(
			`Device name "${ref}" is ambiguous; use one of these ids: ${byName
				.map((d) => d.id)
				.join(", ")}`,
		);
	}
	throw new AgentToolError(
		`No device with id or name "${ref}" in this workspace (${devices.length} devices)`,
	);
}

const REACHABILITY_MEANING: Record<ReachabilityStatus, string> = {
	focus: "same device",
	l2: "same L2 segment (switched, no routing needed)",
	l3: "reachable via IP routing",
	"nat-only": "reachable outbound only, through NAT",
	unreachable: "not reachable with the current addressing and routes",
};

/**
 * Path between two devices: the physical cable path (fewest hops over any
 * device) plus L2/L3 reachability from the analyzer, in both directions.
 */
export function findPath(snapshot: Snapshot, fromRef: string, toRef: string) {
	const { devices, connections, interfaces, routes } = snapshot;
	const nameOf = deviceNamer(devices);
	const from = resolveDevice(devices, fromRef);
	const to = resolveDevice(devices, toRef);

	/* ── Physical path: BFS over cables ── */
	const prev = new Map<
		string,
		{ via: (typeof connections)[number]; from: string }
	>();
	const seen = new Set([from.id]);
	const queue = [from.id];
	while (queue.length > 0 && !seen.has(to.id)) {
		const cur = queue.shift() as string;
		for (const c of connections) {
			const next =
				c.deviceAId === cur
					? c.deviceBId
					: c.deviceBId === cur
						? c.deviceAId
						: null;
			if (!next || seen.has(next)) continue;
			seen.add(next);
			prev.set(next, { via: c, from: cur });
			queue.push(next);
		}
	}

	let physicalPath: Array<{
		connectionId: string;
		connectionType: string | null;
		speed: string | null;
		from: { deviceId: string; deviceName: string; portNumber: number };
		to: { deviceId: string; deviceName: string; portNumber: number };
	}> | null = null;
	if (from.id === to.id) {
		physicalPath = [];
	} else if (seen.has(to.id)) {
		physicalPath = [];
		let cur = to.id;
		while (cur !== from.id) {
			const step = prev.get(cur);
			if (!step) break;
			const c = step.via;
			const fromIsA = c.deviceAId === step.from;
			physicalPath.unshift({
				connectionId: c.id,
				connectionType: c.connectionType,
				speed: c.speed,
				from: {
					deviceId: step.from,
					deviceName: nameOf(step.from),
					portNumber: fromIsA ? c.portA : c.portB,
				},
				to: {
					deviceId: cur,
					deviceName: nameOf(cur),
					portNumber: fromIsA ? c.portB : c.portA,
				},
			});
			cur = step.from;
		}
	}

	/* ── Logical reachability (same engine as the canvas focus view) ── */
	const forward =
		computeDeviceReachability(
			from.id,
			devices,
			connections,
			interfaces,
			routes,
		).deviceStatus.get(to.id) ?? "unreachable";
	const reverse =
		computeDeviceReachability(
			to.id,
			devices,
			connections,
			interfaces,
			routes,
		).deviceStatus.get(from.id) ?? "unreachable";

	const segments = discoverAllSegments(devices, connections, interfaces);
	const sharedSegments = segments
		.filter(
			(s) =>
				s.ports.some((p) => p.deviceId === from.id) &&
				s.ports.some((p) => p.deviceId === to.id),
		)
		.map((s) => describeSegment(s, nameOf));

	return {
		from: { id: from.id, name: from.name, deviceType: from.deviceType },
		to: { id: to.id, name: to.name, deviceType: to.deviceType },
		physicallyConnected: physicalPath !== null,
		physicalPath,
		reachability: {
			forward: { status: forward, meaning: REACHABILITY_MEANING[forward] },
			reverse: { status: reverse, meaning: REACHABILITY_MEANING[reverse] },
		},
		sharedSegments,
	};
}
