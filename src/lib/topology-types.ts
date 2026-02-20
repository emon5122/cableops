/* ───────── CableOps – shared type definitions ───────── */

export interface Position {
	x: number;
	y: number;
}

/* ── Device types with display info ── */

export const DEVICE_TYPES = [
	"switch",
	"router",
	"pc",
	"server",
	"ip-phone",
	"smartphone",
	"camera",
	"firewall",
	"access-point",
	"cloud",
	"hub",
	"patch-panel",
	"nas",
	"printer",
	"load-balancer",
	"modem",
	"laptop",
	"tablet",
] as const;

export type DeviceType = (typeof DEVICE_TYPES)[number];

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
	switch: "Switch",
	router: "Router",
	pc: "PC",
	server: "Server",
	"ip-phone": "IP Phone",
	smartphone: "Smartphone",
	camera: "Camera",
	firewall: "Firewall",
	"access-point": "Access Point",
	cloud: "Internet",
	hub: "Hub",
	"patch-panel": "Patch Panel",
	nas: "NAS",
	printer: "Printer",
	"load-balancer": "Load Balancer",
	modem: "Modem",
	laptop: "Laptop",
	tablet: "Tablet",
};

export const DEVICE_TYPE_DEFAULT_PORTS: Record<DeviceType, number> = {
	switch: 24,
	router: 8,
	pc: 1,
	server: 4,
	"ip-phone": 2,
	smartphone: 0,
	camera: 1,
	firewall: 8,
	"access-point": 4,
	cloud: 2,
	hub: 8,
	"patch-panel": 24,
	nas: 2,
	printer: 1,
	"load-balancer": 8,
	modem: 2,
	laptop: 2,
	tablet: 0,
};

/* ── Network behaviour capabilities per device type ── */

/**
 * Defines what networking features each device type supports,
 * following proper OSI-layer rules:
 *
 * L1 (hub)           — no IP, no MAC table, no VLAN, pure repeater
 * L2 (switch, AP)    — single management IP for whole device, VLANs per port, MAC learning
 * L3 (router, fw)    — per-interface IP (defines subnet), NAT, routing
 * Endpoint (pc, server, phone, camera) — per-NIC IP assigned from subnet
 * Cloud              — external network, per-interface public IP
 */
export interface DeviceCapabilities {
	/** Device operates at this OSI layer */
	layer: 1 | 2 | 3 | "endpoint" | "cloud";
	/** Each port/interface can have its own IP address */
	perPortIp: boolean;
	/** The whole device has a single management IP (switches, APs) */
	managementIp: boolean;
	/** Ports support VLAN tagging (access/trunk) */
	vlanSupport: boolean;
	/** Device can perform NAT (router, firewall) */
	natCapable: boolean;
	/** Device can act as a DHCP server */
	dhcpCapable: boolean;
	/** Ports have MAC addresses */
	macPerPort: boolean;
	/** Device can act as default gateway for a subnet */
	canBeGateway: boolean;
	/** Port mode selection (access/trunk) available */
	portModeSupport: boolean;
	/** Device can host a WiFi network (SSID/password) */
	wifiHost: boolean;
	/** Device can connect to WiFi networks as a client */
	wifiClient: boolean;
}

export const DEVICE_CAPABILITIES: Record<DeviceType, DeviceCapabilities> = {
	router: {
		layer: 3,
		perPortIp: true,
		managementIp: false,
		vlanSupport: false,
		natCapable: true,
		dhcpCapable: true,
		macPerPort: true,
		canBeGateway: true,
		portModeSupport: false,
		wifiHost: true,
		wifiClient: false,
	},
	firewall: {
		layer: 3,
		perPortIp: true,
		managementIp: false,
		vlanSupport: false,
		natCapable: true,
		dhcpCapable: false,
		macPerPort: true,
		canBeGateway: true,
		portModeSupport: false,
		wifiHost: false,
		wifiClient: false,
	},
	switch: {
		layer: 2,
		perPortIp: false,
		managementIp: true,
		vlanSupport: true,
		natCapable: false,
		dhcpCapable: false,
		macPerPort: true,
		canBeGateway: false,
		portModeSupport: true,
		wifiHost: false,
		wifiClient: false,
	},
	"access-point": {
		layer: 2,
		perPortIp: false,
		managementIp: true,
		vlanSupport: true,
		natCapable: false,
		dhcpCapable: false,
		macPerPort: true,
		canBeGateway: false,
		portModeSupport: true,
		wifiHost: true,
		wifiClient: false,
	},
	pc: {
		layer: "endpoint",
		perPortIp: true,
		managementIp: false,
		vlanSupport: false,
		natCapable: false,
		dhcpCapable: false,
		macPerPort: true,
		canBeGateway: false,
		portModeSupport: false,
		wifiHost: false,
		wifiClient: true,
	},
	server: {
		layer: "endpoint",
		perPortIp: true,
		managementIp: false,
		vlanSupport: false,
		natCapable: false,
		dhcpCapable: true,
		macPerPort: true,
		canBeGateway: false,
		portModeSupport: false,
		wifiHost: false,
		wifiClient: false,
	},
	"ip-phone": {
		layer: "endpoint",
		perPortIp: true,
		managementIp: false,
		vlanSupport: false,
		natCapable: false,
		dhcpCapable: false,
		macPerPort: true,
		canBeGateway: false,
		portModeSupport: false,
		wifiHost: false,
		wifiClient: false,
	},
	smartphone: {
		layer: "endpoint",
		perPortIp: true,
		managementIp: false,
		vlanSupport: false,
		natCapable: false,
		dhcpCapable: false,
		macPerPort: false,
		canBeGateway: false,
		portModeSupport: false,
		wifiHost: false,
		wifiClient: true,
	},
	camera: {
		layer: "endpoint",
		perPortIp: true,
		managementIp: false,
		vlanSupport: false,
		natCapable: false,
		dhcpCapable: false,
		macPerPort: true,
		canBeGateway: false,
		portModeSupport: false,
		wifiHost: false,
		wifiClient: true,
	},
	cloud: {
		layer: "cloud",
		perPortIp: false,
		managementIp: true,
		vlanSupport: false,
		natCapable: false,
		dhcpCapable: false,
		macPerPort: false,
		canBeGateway: false,
		portModeSupport: false,
		wifiHost: false,
		wifiClient: false,
	},
	hub: {
		layer: 1,
		perPortIp: false,
		managementIp: false,
		vlanSupport: false,
		natCapable: false,
		dhcpCapable: false,
		macPerPort: false,
		canBeGateway: false,
		portModeSupport: false,
		wifiHost: false,
		wifiClient: false,
	},
	"patch-panel": {
		layer: 1,
		perPortIp: false,
		managementIp: false,
		vlanSupport: false,
		natCapable: false,
		dhcpCapable: false,
		macPerPort: false,
		canBeGateway: false,
		portModeSupport: false,
		wifiHost: false,
		wifiClient: false,
	},
	nas: {
		layer: "endpoint",
		perPortIp: true,
		managementIp: false,
		vlanSupport: false,
		natCapable: false,
		dhcpCapable: false,
		macPerPort: true,
		canBeGateway: false,
		portModeSupport: false,
		wifiHost: false,
		wifiClient: false,
	},
	printer: {
		layer: "endpoint",
		perPortIp: true,
		managementIp: false,
		vlanSupport: false,
		natCapable: false,
		dhcpCapable: false,
		macPerPort: true,
		canBeGateway: false,
		portModeSupport: false,
		wifiHost: false,
		wifiClient: true,
	},
	"load-balancer": {
		layer: 3,
		perPortIp: true,
		managementIp: false,
		vlanSupport: false,
		natCapable: true,
		dhcpCapable: false,
		macPerPort: true,
		canBeGateway: true,
		portModeSupport: false,
		wifiHost: false,
		wifiClient: false,
	},
	modem: {
		layer: 2,
		perPortIp: false,
		managementIp: true,
		vlanSupport: false,
		natCapable: false,
		dhcpCapable: false,
		macPerPort: true,
		canBeGateway: false,
		portModeSupport: false,
		wifiHost: false,
		wifiClient: false,
	},
	laptop: {
		layer: "endpoint",
		perPortIp: true,
		managementIp: false,
		vlanSupport: false,
		natCapable: false,
		dhcpCapable: false,
		macPerPort: true,
		canBeGateway: false,
		portModeSupport: false,
		wifiHost: false,
		wifiClient: true,
	},
	tablet: {
		layer: "endpoint",
		perPortIp: true,
		managementIp: false,
		vlanSupport: false,
		natCapable: false,
		dhcpCapable: false,
		macPerPort: true,
		canBeGateway: false,
		portModeSupport: false,
		wifiHost: false,
		wifiClient: true,
	},
};

/** Get the capabilities for a device type string */
export function getDeviceCapabilities(deviceType: string): DeviceCapabilities {
	return (
		DEVICE_CAPABILITIES[deviceType as DeviceType] ?? DEVICE_CAPABILITIES.pc
	);
}

/* ── Port mode for switches ── */

export const PORT_MODES = ["access", "trunk", "hybrid"] as const;
export type PortMode = (typeof PORT_MODES)[number];

/* ── Port role for directional traffic flow ── */

export const PORT_ROLES = ["uplink", "downlink"] as const;
export type PortRole = (typeof PORT_ROLES)[number];

/* ── Data models (inferred from Drizzle schema) ── */

import type {
	annotations,
	connections,
	devices,
	interfaces,
	routes,
	workspaces,
} from "@/db/schema";
import type { InferSelectModel } from "drizzle-orm";

export type WorkspaceRow = InferSelectModel<typeof workspaces>;
export type DeviceRow = InferSelectModel<typeof devices>;
export type ConnectionRow = InferSelectModel<typeof connections>;
export type InterfaceRow = InferSelectModel<typeof interfaces>;
export type RouteRow = InferSelectModel<typeof routes>;
export type AnnotationRow = InferSelectModel<typeof annotations>;

/** @deprecated Use InterfaceRow instead */
export type PortConfigRow = InterfaceRow;

/* ── Topology canvas helpers ── */

export interface DragState {
	isDragging: boolean;
	deviceId: string | null;
	startMouseX: number;
	startMouseY: number;
	startDeviceX: number;
	startDeviceY: number;
}

export interface PortSelection {
	deviceId: string;
	portNumber: number;
}

/* ── Layout constants (larger devices and ports) ── */

export const DEVICE_NODE_WIDTH = 280;
export const DEVICE_NODE_HEADER_HEIGHT = 48;
export const INFO_STRIP_HEIGHT = 22;
export const PORT_SIZE = 28;
export const PORT_GAP = 4;
export const PORTS_PER_ROW = 8;

export const SPEED_OPTIONS = [
	"10 Mbit",
	"100 Mbit",
	"1 Gbit",
	"2.5 Gbit",
	"5 Gbit",
	"10 Gbit",
	"25 Gbit",
	"40 Gbit",
	"100 Gbit",
] as const;

export type SpeedOption = (typeof SPEED_OPTIONS)[number];

export const VLAN_PRESETS = [
	1, 10, 20, 30, 40, 50, 100, 200, 300, 999,
] as const;

export const DEFAULT_COLORS = [
	"#3b82f6",
	"#ef4444",
	"#22c55e",
	"#f59e0b",
	"#8b5cf6",
	"#ec4899",
	"#06b6d4",
	"#f97316",
	"#14b8a6",
	"#6366f1",
	"#84cc16",
	"#a855f7",
] as const;

/* ── Geometry helpers ── */

export function getPortPosition(
	portIndex: number,
	portCount: number,
	nodeWidth: number = DEVICE_NODE_WIDTH,
): Position {
	const portsPerRow = Math.min(PORTS_PER_ROW, portCount);
	const spacing = PORT_SIZE + PORT_GAP;
	const totalRowWidth = portsPerRow * spacing - PORT_GAP;
	const startX = (nodeWidth - totalRowWidth) / 2 + PORT_SIZE / 2;

	const col = portIndex % portsPerRow;
	const row = Math.floor(portIndex / portsPerRow);

	return {
		x: startX + col * spacing,
		y:
			DEVICE_NODE_HEADER_HEIGHT +
			INFO_STRIP_HEIGHT +
			14 +
			row * spacing +
			PORT_SIZE / 2,
	};
}

export function getDeviceNodeHeight(portCount: number): number {
	if (portCount <= 0)
		return (
			DEVICE_NODE_HEADER_HEIGHT + INFO_STRIP_HEIGHT + 36
		); /* WiFi-only indicator space */
	const portsPerRow = Math.min(PORTS_PER_ROW, Math.max(1, portCount));
	const rows = Math.ceil(portCount / portsPerRow);
	const spacing = PORT_SIZE + PORT_GAP;
	return (
		DEVICE_NODE_HEADER_HEIGHT + INFO_STRIP_HEIGHT + 14 + rows * spacing + 14
	);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
	let h = hex.replace("#", "").trim();
	if (h.length === 3)
		h = h
			.split("")
			.map((c) => c + c)
			.join("");
	const n = Number.parseInt(h, 16);
	if (Number.isNaN(n) || h.length !== 6) return { r: 59, g: 130, b: 246 };
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function bestTextColor(bgHex: string): string {
	const c = hexToRgb(bgHex);
	const lum =
		0.2126 * (c.r / 255) + 0.7152 * (c.g / 255) + 0.0722 * (c.b / 255);
	return lum > 0.5 ? "#000000" : "#ffffff";
}

export function luminance(hex: string): number {
	const c = hexToRgb(hex);
	return 0.2126 * (c.r / 255) + 0.7152 * (c.g / 255) + 0.0722 * (c.b / 255);
}

export function isPortConnected(
	deviceId: string,
	portNumber: number,
	connections: ConnectionRow[],
): boolean {
	/* Port 0 is the virtual WiFi interface — always "available" for more clients on a host */
	if (portNumber === 0) return false;
	return connections.some(
		(c) =>
			(c.deviceAId === deviceId && c.portA === portNumber) ||
			(c.deviceBId === deviceId && c.portB === portNumber),
	);
}

/** Get WiFi connections for a device (where port is 0 on either side) */
export function getWifiConnections(
	deviceId: string,
	connections: ConnectionRow[],
): ConnectionRow[] {
	return connections.filter(
		(c) =>
			(c.deviceAId === deviceId && c.portA === 0) ||
			(c.deviceBId === deviceId && c.portB === 0),
	);
}

/** Get the connection object for a specific port */
export function getPortConnection(
	deviceId: string,
	portNumber: number,
	connections: ConnectionRow[],
): ConnectionRow | null {
	return (
		connections.find(
			(c) =>
				(c.deviceAId === deviceId && c.portA === portNumber) ||
				(c.deviceBId === deviceId && c.portB === portNumber),
		) ?? null
	);
}

/**
 * Color exchange: When device A port connects to device B,
 * the port on A shows B's color and vice versa.
 */
export function getPortDisplayColor(
	deviceId: string,
	portNumber: number,
	connections: ConnectionRow[],
	devices: DeviceRow[],
): string {
	const conn = getPortConnection(deviceId, portNumber, connections);
	if (!conn) return "#2a2f3b"; // unconnected — dark grey
	const isA = conn.deviceAId === deviceId && conn.portA === portNumber;
	const peerId = isA ? conn.deviceBId : conn.deviceAId;
	const peerDevice = devices.find((d) => d.id === peerId);
	return peerDevice?.color ?? "#3b82f6";
}

export function getPortPeer(
	deviceId: string,
	portNumber: number,
	connections: ConnectionRow[],
	devices: DeviceRow[],
): { deviceName: string; port: number; color: string } | null {
	const conn = connections.find(
		(c) =>
			(c.deviceAId === deviceId && c.portA === portNumber) ||
			(c.deviceBId === deviceId && c.portB === portNumber),
	);
	if (!conn) return null;

	const isA = conn.deviceAId === deviceId && conn.portA === portNumber;
	const peerId = isA ? conn.deviceBId : conn.deviceAId;
	const peerPort = isA ? conn.portB : conn.portA;
	const peerDevice = devices.find((d) => d.id === peerId);
	return peerDevice
		? { deviceName: peerDevice.name, port: peerPort, color: peerDevice.color }
		: null;
}

/* ── Speed helpers ── */

/** Parse a speed string like "10 Gbit" into a number in Mbit */
export function parseSpeedToMbit(speed: string): number {
	const m = speed.match(/^([\d.]+)\s*(Mbit|Gbit)$/i);
	if (!m) return 0;
	const val = Number.parseFloat(m[1]!);
	return m[2]?.toLowerCase() === "gbit" ? val * 1000 : val;
}

/** Given two port speeds, return the negotiated (minimum) speed string */
export function negotiatedSpeed(
	speedA: string | null | undefined,
	speedB: string | null | undefined,
): string | null {
	if (!speedA && !speedB) return null;
	if (!speedA) return speedB ?? null;
	if (!speedB) return speedA;
	const a = parseSpeedToMbit(speedA);
	const b = parseSpeedToMbit(speedB);
	return a <= b ? speedA : speedB;
}

/* ── IP / subnet helpers ── */

export function parseIp(
	ipCidr: string,
): { ip: number; cidr: number; network: number; mask: number } | null {
	const m = ipCidr.match(
		/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/,
	);
	if (!m) return null;
	const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
	if (octets.some((o) => o > 255)) return null;
	const cidr = Number(m[5]);
	if (cidr > 32) return null;
	const ip =
		((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>>
		0;
	const mask = cidr > 0 ? (~0 << (32 - cidr)) >>> 0 : 0;
	const network = (ip & mask) >>> 0;
	return { ip, cidr, network, mask };
}

export function ipToString(n: number): string {
	return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
}

export function sameSubnet(a: string, b: string): boolean {
	const pa = parseIp(a);
	const pb = parseIp(b);
	if (!pa || !pb) return false;
	const cidr = Math.min(pa.cidr, pb.cidr);
	const mask = cidr > 0 ? (~0 << (32 - cidr)) >>> 0 : 0;
	return (pa.ip & mask) >>> 0 === (pb.ip & mask) >>> 0;
}

/**
 * Walk the L2 broadcast domain from a given device, returning all device IDs
 * reachable without crossing an L3 boundary.
 *
 * **LEGACY — device-level walk.** Use `getNetworkSegment()` for port-accurate
 * segment detection that handles multi-homed endpoints correctly.
 */
export function getBroadcastDomain(
	startDeviceId: string,
	connections: ConnectionRow[],
	devices: DeviceRow[],
): Set<string> {
	const domain = new Set<string>();
	const queue = [startDeviceId];
	while (queue.length > 0) {
		const devId = queue.shift()!;
		if (domain.has(devId)) continue;
		domain.add(devId);
		const dev = devices.find((d) => d.id === devId);
		if (!dev) continue;
		const caps = DEVICE_CAPABILITIES[dev.deviceType as DeviceType];
		if (devId !== startDeviceId && caps && caps.layer === 3) continue;
		const conns = connections.filter(
			(c) => c.deviceAId === devId || c.deviceBId === devId,
		);
		for (const c of conns) {
			const peerId = c.deviceAId === devId ? c.deviceBId : c.deviceAId;
			if (!domain.has(peerId)) queue.push(peerId);
		}
	}
	return domain;
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  NETWORK RULE ENGINE — Port-level segment detection + reachability analysis
 * ══════════════════════════════════════════════════════════════════════════════ */

/** A port on a specific device */
export interface SegmentPort {
	deviceId: string;
	portNumber: number;
}

/** A discovered L2 network segment */
export interface NetworkSegment {
	/** Unique key like "seg-0" */
	id: string;
	/** All device:port pairs in this L2 segment */
	ports: SegmentPort[];
	/** The L3 gateway port (router/firewall interface) if one exists */
	gateway: {
		deviceId: string;
		portNumber: number;
		ip: string;
		cidr: number;
		network: number;
		mask: number;
	} | null;
	/** Computed subnet string like "192.168.0.0/24", derived from gateway or first IP */
	subnet: string | null;
}

/** Detected issue in the network topology */
export interface NetworkIssue {
	severity: "error" | "warning" | "info";
	deviceId: string;
	portNumber?: number;
	message: string;
	type:
		| "subnet_mismatch"
		| "no_gateway"
		| "duplicate_ip"
		| "unreachable_segment"
		| "no_ip"
		| "no_dhcp_match"
		| "no_dhcp_server"
		| "needs_forwarding"
		| "multiple_gateways"
		| "dhcp_collision"
		| "no_return_path"
		| "nat_misconfigured";
}

export interface NetworkAnalysis {
	segments: NetworkSegment[];
	issues: NetworkIssue[];
}

/**
 * Is a device type transparent at L2? (all ports = same broadcast domain)
 * L1 (hub, patch-panel) and L2 (switch, AP, modem) devices forward frames
 * across all ports. Everything else (routers, endpoints, cloud) has per-port
 * segment boundaries.
 */
function isL2Transparent(layer: DeviceCapabilities["layer"]): boolean {
	return layer === 1 || layer === 2;
}

function getPortConfig(
	deviceId: string,
	portNumber: number,
	portConfigs: PortConfigRow[],
): PortConfigRow | undefined {
	return portConfigs.find(
		(pc) => pc.deviceId === deviceId && pc.portNumber === portNumber,
	);
}

function getPortVlanId(
	deviceId: string,
	portNumber: number,
	portConfigs: PortConfigRow[],
): number {
	const pc = getPortConfig(deviceId, portNumber, portConfigs);
	return pc?.vlan ?? 1;
}

function portCarriesVlan(pc: PortConfigRow | undefined, vlanId: number): boolean {
	const mode = pc?.portMode ?? "access";
	if (mode === "trunk" || mode === "hybrid") {
		if (pc?.vlan == null) return true;
		return pc.vlan === vlanId;
	}
	return (pc?.vlan ?? 1) === vlanId;
}

/**
 * Discover the L2 network segment reachable from a specific device:port.
 *
 * Walk rules:
 * - L1/L2 devices (switch/hub/AP): ALL ports in the same segment → traverse every connection
 * - L3 devices (router/firewall/LB): each port is a segment edge → DON'T cross to other ports
 * - Endpoints (PC/server/etc.): each port is a segment edge → DON'T cross to other ports
 * - Cloud: each port is a segment edge
 *
 * This means a multi-homed PC with port 1 on 192.168.0.0/24 and port 2 on
 * 10.0.0.0/31 is correctly in TWO separate segments.
 */
export function getNetworkSegment(
	deviceId: string,
	portNumber: number,
	connections: ConnectionRow[],
	devices: DeviceRow[],
	portConfigs: PortConfigRow[],
): NetworkSegment {
	type QueueItem = {
		deviceId: string;
		portNumber: number;
		vlanId: number;
	};

	const visited = new Set<string>(); // "deviceId:portNumber:vlanId"
	const segmentPorts: SegmentPort[] = [];
	const segmentPortSet = new Set<string>();
	let gateway: NetworkSegment["gateway"] = null;

	const tryEnqueue = (
		queue: QueueItem[],
		devId: string,
		port: number,
		vlanId: number,
	) => {
		const key = `${devId}:${port}:${vlanId}`;
		if (!visited.has(key)) {
			queue.push({ deviceId: devId, portNumber: port, vlanId });
		}
	};

	const initialVlan = getPortVlanId(deviceId, portNumber, portConfigs);
	const queue: QueueItem[] = [{ deviceId, portNumber, vlanId: initialVlan }];

	while (queue.length > 0) {
		const current = queue.shift()!;
		const key = `${current.deviceId}:${current.portNumber}:${current.vlanId}`;
		if (visited.has(key)) continue;
		visited.add(key);

		const segmentPortKey = `${current.deviceId}:${current.portNumber}`;
		if (!segmentPortSet.has(segmentPortKey)) {
			segmentPortSet.add(segmentPortKey);
			segmentPorts.push({
				deviceId: current.deviceId,
				portNumber: current.portNumber,
			});
		}

		const dev = devices.find((d) => d.id === current.deviceId);
		if (!dev) continue;
		const caps = DEVICE_CAPABILITIES[dev.deviceType as DeviceType];
		if (!caps) continue;

		// Check if this port is a gateway interface (L3 device with IP on this port)
		if (caps.canBeGateway && !gateway) {
			const pc = portConfigs.find(
				(p) =>
					p.deviceId === current.deviceId &&
					p.portNumber === current.portNumber &&
					p.ipAddress,
			);
			if (pc?.ipAddress) {
				const parsed = parseIp(pc.ipAddress);
				if (parsed) {
					gateway = {
						deviceId: current.deviceId,
						portNumber: current.portNumber,
						ip: pc.ipAddress,
						cidr: parsed.cidr,
						network: parsed.network,
						mask: parsed.mask,
					};
				}
			}
		}

		// Find the connection from this specific port
		const conn = connections.find(
			(c) =>
				(c.deviceAId === current.deviceId && c.portA === current.portNumber) ||
				(c.deviceBId === current.deviceId && c.portB === current.portNumber),
		);
		if (!conn) continue;

		const peerId =
			conn.deviceAId === current.deviceId ? conn.deviceBId : conn.deviceAId;
		const peerPort =
			conn.deviceAId === current.deviceId ? conn.portB : conn.portA;
		const currentPc = getPortConfig(
			current.deviceId,
			current.portNumber,
			portConfigs,
		);
		const peerPc = getPortConfig(peerId, peerPort, portConfigs);

		// Add the peer's specific port if VLAN can traverse this link
		if (
			portCarriesVlan(currentPc, current.vlanId) &&
			portCarriesVlan(peerPc, current.vlanId)
		) {
			tryEnqueue(queue, peerId, peerPort, current.vlanId);
		}

		// If the peer is L2-transparent, ALL its other connected ports are also
		// part of this same segment (switch/hub bridge traffic between ports),
		// but only for VLAN-compatible ports.
		const peerDev = devices.find((d) => d.id === peerId);
		if (peerDev) {
			const peerCaps = DEVICE_CAPABILITIES[peerDev.deviceType as DeviceType];
			if (peerCaps && isL2Transparent(peerCaps.layer)) {
				for (const c of connections) {
					if (c.deviceAId === peerId) {
						const pc = getPortConfig(peerId, c.portA, portConfigs);
						if (portCarriesVlan(pc, current.vlanId)) {
							tryEnqueue(queue, peerId, c.portA, current.vlanId);
						}
					}
					if (c.deviceBId === peerId) {
						const pc = getPortConfig(peerId, c.portB, portConfigs);
						if (portCarriesVlan(pc, current.vlanId)) {
							tryEnqueue(queue, peerId, c.portB, current.vlanId);
						}
					}
				}
			}
		}
	}

	// Compute subnet from gateway IP, or fall back to first port IP in segment
	let subnet: string | null = null;
	if (gateway) {
		subnet = `${ipToString(gateway.network)}/${gateway.cidr}`;
	} else {
		for (const sp of segmentPorts) {
			const pc = portConfigs.find(
				(p) =>
					p.deviceId === sp.deviceId &&
					p.portNumber === sp.portNumber &&
					p.ipAddress,
			);
			if (pc?.ipAddress) {
				const parsed = parseIp(pc.ipAddress);
				if (parsed) {
					subnet = `${ipToString(parsed.network)}/${parsed.cidr}`;
					break;
				}
			}
		}
	}

	return { id: "", ports: segmentPorts, gateway, subnet };
}

/**
 * Discover ALL distinct network segments in a workspace.
 * Iterates every connected port and groups them into non-overlapping segments.
 */
export function discoverAllSegments(
	devices: DeviceRow[],
	connections: ConnectionRow[],
	portConfigs: PortConfigRow[],
): NetworkSegment[] {
	const visited = new Set<string>(); // "deviceId:portNumber:vlanId"
	const segments: NetworkSegment[] = [];
	let idx = 0;

	for (const conn of connections) {
		for (const [devId, port] of [
			[conn.deviceAId, conn.portA],
			[conn.deviceBId, conn.portB],
		] as [string, number][]) {
			const vlanId = getPortVlanId(devId, port, portConfigs);
			const key = `${devId}:${port}:${vlanId}`;
			if (visited.has(key)) continue;

			const seg = getNetworkSegment(
				devId,
				port,
				connections,
				devices,
				portConfigs,
			);
			seg.id = `seg-${idx++}`;
			for (const sp of seg.ports) {
				const svlan = getPortVlanId(sp.deviceId, sp.portNumber, portConfigs);
				visited.add(`${sp.deviceId}:${sp.portNumber}:${svlan}`);
			}
			segments.push(seg);
		}
	}

	return segments;
}

/**
 * Full network analysis: discover segments, validate IPs, check reachability.
 */
export function analyzeNetwork(
	devices: DeviceRow[],
	connections: ConnectionRow[],
	portConfigs: PortConfigRow[],
	routes: RouteRow[] = [],
): NetworkAnalysis {
	const segments = discoverAllSegments(devices, connections, portConfigs);
	const issues: NetworkIssue[] = [];

	// Lookup: "deviceId:portNumber" → segment
	const portToSegment = new Map<string, NetworkSegment>();
	for (const seg of segments) {
		for (const sp of seg.ports) {
			portToSegment.set(`${sp.deviceId}:${sp.portNumber}`, seg);
		}
	}

	/* ── 1. Subnet mismatch: port IPs must match their segment gateway ── */
	for (const seg of segments) {
		const gatewayCandidates = seg.ports
			.map((sp) => {
				const dev = devices.find((d) => d.id === sp.deviceId);
				if (!dev) return null;
				const caps = DEVICE_CAPABILITIES[dev.deviceType as DeviceType];
				if (!caps?.canBeGateway) return null;
				const iface = portConfigs.find(
					(pc) =>
						pc.deviceId === sp.deviceId &&
						pc.portNumber === sp.portNumber &&
						pc.ipAddress,
				);
				if (!iface?.ipAddress || !parseIp(iface.ipAddress)) return null;
				return { deviceId: sp.deviceId, portNumber: sp.portNumber, ip: iface.ipAddress };
			})
			.filter((v): v is { deviceId: string; portNumber: number; ip: string } =>
				Boolean(v),
			);

		if (gatewayCandidates.length > 1) {
			const labels = gatewayCandidates
				.map((g) => {
					const dev = devices.find((d) => d.id === g.deviceId);
					return `${dev?.name ?? g.deviceId} P${g.portNumber}`;
				})
				.join(", ");
			issues.push({
				severity: "warning",
				deviceId: gatewayCandidates[0].deviceId,
				message: `Multiple gateways detected in segment ${seg.subnet ?? seg.id}: ${labels}`,
				type: "multiple_gateways",
			});
		}

		if (!seg.gateway) continue;
		const gw = seg.gateway;

		for (const sp of seg.ports) {
			if (sp.deviceId === gw.deviceId && sp.portNumber === gw.portNumber)
				continue;

			const pc = portConfigs.find(
				(p) =>
					p.deviceId === sp.deviceId &&
					p.portNumber === sp.portNumber &&
					p.ipAddress,
			);
			if (!pc?.ipAddress) continue;

			const parsed = parseIp(pc.ipAddress);
			if (!parsed) continue;

			if ((parsed.ip & gw.mask) >>> 0 !== gw.network) {
				const dev = devices.find((d) => d.id === sp.deviceId);
				const gwDev = devices.find((d) => d.id === gw.deviceId);
				issues.push({
					severity: "error",
					deviceId: sp.deviceId,
					portNumber: sp.portNumber,
					message: `${dev?.name ?? "Device"} port ${sp.portNumber} IP ${pc.ipAddress} is not in subnet ${seg.subnet} (gateway: ${gwDev?.name ?? "?"} port ${gw.portNumber})`,
					type: "subnet_mismatch",
				});
			}
		}

		// Management IPs of L2 devices in this segment (port 0 interface)
		const checkedMgmt = new Set<string>();
		for (const sp of seg.ports) {
			const dev = devices.find((d) => d.id === sp.deviceId);
			if (!dev || checkedMgmt.has(dev.id)) continue;
			checkedMgmt.add(dev.id);
			const caps = DEVICE_CAPABILITIES[dev.deviceType as DeviceType];
			if (!caps?.managementIp) continue;

			const mgmtIface = portConfigs.find(
				(pc) => pc.deviceId === dev.id && pc.portNumber === 0 && pc.ipAddress,
			);
			if (!mgmtIface?.ipAddress) continue;

			const mgmtIpStr = mgmtIface.ipAddress.includes("/")
				? mgmtIface.ipAddress
				: `${mgmtIface.ipAddress}/24`;
			const parsed = parseIp(mgmtIpStr);
			if (!parsed) continue;

			if ((parsed.ip & gw.mask) >>> 0 !== gw.network) {
				const gwDev = devices.find((d) => d.id === gw.deviceId);
				issues.push({
					severity: "error",
					deviceId: dev.id,
					message: `${dev.name} management IP ${mgmtIface.ipAddress} is not in subnet ${seg.subnet} (gateway: ${gwDev?.name ?? "?"})`,
					type: "subnet_mismatch",
				});
			}
		}
	}

	/* ── 2. No gateway: segments with IPs but no L3 device ── */
	for (const seg of segments) {
		if (seg.gateway) continue;
		const parsedIps = seg.ports
			.map((sp) =>
				portConfigs.find(
					(pc) =>
						pc.deviceId === sp.deviceId &&
						pc.portNumber === sp.portNumber &&
						pc.ipAddress,
				)?.ipAddress,
			)
			.filter((v): v is string => Boolean(v))
			.map((ip) => parseIp(ip))
			.filter((v): v is { ip: number; cidr: number; network: number; mask: number } =>
				Boolean(v),
			);

		if (parsedIps.length === 0) continue;

		/* /31 and /32 are edge point-to-point / host routes: no-gateway warning is noisy */
		if (parsedIps.every((p) => p.cidr >= 31)) continue;

		const names = [
			...new Set(
				seg.ports
					.map((sp) => devices.find((d) => d.id === sp.deviceId)?.name)
					.filter(Boolean),
			),
		];
		issues.push({
			severity: "warning",
			deviceId: seg.ports[0].deviceId,
			message: `Segment with ${names.join(", ")} has IPs but no L3 gateway — no routing to other segments`,
			type: "no_gateway",
		});
	}

	/* ── 3. Duplicate IPs within a segment ── */
	for (const seg of segments) {
		const ips = new Map<string, SegmentPort>();
		for (const sp of seg.ports) {
			const pc = portConfigs.find(
				(p) =>
					p.deviceId === sp.deviceId &&
					p.portNumber === sp.portNumber &&
					p.ipAddress,
			);
			if (!pc?.ipAddress) continue;
			const plain = pc.ipAddress.split("/")[0];
			const existing = ips.get(plain);
			if (existing) {
				const d1 = devices.find((d) => d.id === existing.deviceId);
				const d2 = devices.find((d) => d.id === sp.deviceId);
				issues.push({
					severity: "error",
					deviceId: sp.deviceId,
					portNumber: sp.portNumber,
					message: `Duplicate IP ${plain}: ${d1?.name ?? "?"} P${existing.portNumber} and ${d2?.name ?? "?"} P${sp.portNumber}`,
					type: "duplicate_ip",
				});
			} else {
				ips.set(plain, sp);
			}
		}
	}

	/* ── 4. Cross-segment reachability (route-aware, multi-hop capable) ── */
	if (segments.length > 1) {
		const adj = new Map<string, Set<string>>();
		for (const s of segments) adj.set(s.id, new Set());
		const natOneWayEdges = new Set<string>();

		type RouteEntry = {
			destination: { ip: number; cidr: number; network: number; mask: number };
			egressPort: number;
			metric: number;
		};

		const getRepresentativeIp = (seg: NetworkSegment): number | null => {
			if (seg.gateway?.ip) {
				const parsed = parseIp(seg.gateway.ip);
				if (parsed) return parsed.ip;
			}
			for (const sp of seg.ports) {
				const iface = portConfigs.find(
					(pc) =>
						pc.deviceId === sp.deviceId &&
						pc.portNumber === sp.portNumber &&
						pc.ipAddress,
				);
				if (!iface?.ipAddress) continue;
				const parsed = parseIp(iface.ipAddress);
				if (parsed) return parsed.ip;
			}
			return null;
		};

		const routesByDevice = new Map<string, RouteEntry[]>();
		for (const dev of devices) {
			const entries: RouteEntry[] = [];

			for (const iface of portConfigs) {
				if (iface.deviceId !== dev.id || !iface.ipAddress) continue;
				const parsed = parseIp(iface.ipAddress);
				if (!parsed) continue;
				entries.push({
					destination: parsed,
					egressPort: iface.portNumber,
					metric: 0,
				});
			}

			for (const r of routes.filter((rr) => rr.deviceId === dev.id)) {
				const parsedDest = parseIp(r.destination);
				if (!parsedDest) continue;

				let egressPort = r.interfacePort ?? null;
				if (egressPort == null) {
					const nextHop = parseIpPlain(r.nextHop);
					if (nextHop !== null) {
						for (const iface of portConfigs) {
							if (iface.deviceId !== dev.id || !iface.ipAddress) continue;
							const parsedIface = parseIp(iface.ipAddress);
							if (!parsedIface) continue;
							if (
								((nextHop & parsedIface.mask) >>> 0) === parsedIface.network
							) {
								egressPort = iface.portNumber;
								break;
							}
						}
					}
				}

				if (egressPort == null) continue;

				entries.push({
					destination: parsedDest,
					egressPort,
					metric: r.metric ?? 100,
				});
			}

			routesByDevice.set(dev.id, entries);
		}

		const selectBestRoute = (
			deviceId: string,
			targetIp: number,
		): RouteEntry | null => {
			const entries = routesByDevice.get(deviceId) ?? [];
			const matches = entries.filter(
				(entry) =>
					((targetIp & entry.destination.mask) >>> 0) === entry.destination.network,
			);
			if (matches.length === 0) return null;
			matches.sort((a, b) => {
				if (b.destination.cidr !== a.destination.cidr) {
					return b.destination.cidr - a.destination.cidr;
				}
				return a.metric - b.metric;
			});
			return matches[0] ?? null;
		};

		const segmentHasCloud = (seg: NetworkSegment): boolean =>
			seg.ports.some((sp) => {
				const d = devices.find((dev) => dev.id === sp.deviceId);
				return d?.deviceType === "cloud";
			});

		for (const dev of devices) {
			if (!dev.ipForwarding) continue;

			const devSegmentIds = new Set<string>();
			for (const seg of segments) {
				if (seg.ports.some((sp) => sp.deviceId === dev.id)) {
					devSegmentIds.add(seg.id);
				}
			}
			if (devSegmentIds.size < 2) continue;

			for (const ingressId of devSegmentIds) {
				const ingressSeg = segments.find((s) => s.id === ingressId);
				if (!ingressSeg) continue;
				const ingressIp = getRepresentativeIp(ingressSeg);

				for (const targetSeg of segments) {
					if (targetSeg.id === ingressId) continue;
					const targetIp = getRepresentativeIp(targetSeg);
					if (targetIp === null) continue;

					const forwardRoute = selectBestRoute(dev.id, targetIp);
					if (!forwardRoute) continue;

					if (ingressIp !== null && !selectBestRoute(dev.id, ingressIp)) {
						continue;
					}

					const outSeg = portToSegment.get(
						`${dev.id}:${forwardRoute.egressPort}`,
					);
					if (!outSeg || outSeg.id === ingressId) continue;

					adj.get(ingressId)?.add(outSeg.id);
				}
			}

			/* NAT egress enables one-way outbound reachability to cloud-facing segment */
			const natIfaces = portConfigs.filter(
				(pc) => pc.deviceId === dev.id && pc.natEnabled,
			);
			for (const natIface of natIfaces) {
				const outSeg = portToSegment.get(`${dev.id}:${natIface.portNumber}`);
				if (!outSeg) continue;
				if (!segmentHasCloud(outSeg)) continue;

				for (const ingressId of devSegmentIds) {
					if (ingressId === outSeg.id) continue;
					adj.get(ingressId)?.add(outSeg.id);
					natOneWayEdges.add(`${ingressId}->${outSeg.id}`);
				}
			}
		}

		/* Return-path diagnostics (except NAT-intended one-way edges) */
		for (const [src, targets] of adj) {
			for (const dst of targets) {
				if (adj.get(dst)?.has(src)) continue;
				if (natOneWayEdges.has(`${src}->${dst}`)) continue;

				const srcSeg = segments.find((s) => s.id === src);
				if (!srcSeg) continue;
				issues.push({
					severity: "warning",
					deviceId: srcSeg.ports[0]?.deviceId ?? "",
					message: `Route path exists from ${srcSeg.subnet ?? src} to ${segments.find((s) => s.id === dst)?.subnet ?? dst} but no return path was found`,
					type: "no_return_path",
				});
			}
		}

		const undirected = new Map<string, Set<string>>();
		for (const s of segments) undirected.set(s.id, new Set());
		for (const [src, targets] of adj) {
			for (const dst of targets) {
				const bidirectional = adj.get(dst)?.has(src) ?? false;
				const natReachable =
					natOneWayEdges.has(`${src}->${dst}`) ||
					natOneWayEdges.has(`${dst}->${src}`);
				if (bidirectional || natReachable) {
					undirected.get(src)?.add(dst);
					undirected.get(dst)?.add(src);
				}
			}
		}

		// Find isolated groups via BFS on the computed segment graph
		const seen = new Set<string>();
		const groups: string[][] = [];
		for (const seg of segments) {
			if (seen.has(seg.id)) continue;
			const group: string[] = [];
			const q = [seg.id];
			while (q.length > 0) {
				const cur = q.shift()!;
				if (seen.has(cur)) continue;
				seen.add(cur);
				group.push(cur);
				for (const nb of undirected.get(cur) ?? []) {
					if (!seen.has(nb)) q.push(nb);
				}
			}
			groups.push(group);
		}

		if (groups.length > 1) {
			for (let g = 1; g < groups.length; g++) {
				const segNames = groups[g]
					.map((id) => segments.find((s) => s.id === id)?.subnet ?? id)
					.join(", ");
				issues.push({
					severity: "warning",
					deviceId:
						segments.find((s) => s.id === groups[g][0])?.ports[0]?.deviceId ??
						"",
					message: `Segments [${segNames}] are isolated — no L3 device routes them to other networks`,
					type: "unreachable_segment",
				});
			}
		}
	}

	/* ── 5. Multi-homed endpoint warning ── */
	for (const dev of devices) {
		const caps = DEVICE_CAPABILITIES[dev.deviceType as DeviceType];
		if (!caps || caps.canBeGateway || isL2Transparent(caps.layer)) continue;

		const devSegs = new Set<string>();
		for (const conn of connections) {
			let port: number | null = null;
			if (conn.deviceAId === dev.id) port = conn.portA;
			else if (conn.deviceBId === dev.id) port = conn.portB;
			if (port === null) continue;
			const seg = portToSegment.get(`${dev.id}:${port}`);
			if (seg) devSegs.add(seg.id);
		}

		if (devSegs.size > 1) {
			const subs = Array.from(devSegs)
				.map((sid) => segments.find((s) => s.id === sid)?.subnet ?? "?")
				.join(" ↔ ");
			issues.push({
				severity: "info",
				deviceId: dev.id,
				message: `${dev.name} bridges segments [${subs}] — requires IP forwarding + static routes for cross-segment traffic`,
				type: "needs_forwarding",
			});
		}
	}

	/* ── 6. DHCP range vs. subnet + static collision ── */
	for (const iface of portConfigs) {
		if (!iface.dhcpEnabled || !iface.dhcpRangeStart || !iface.dhcpRangeEnd)
			continue;
		const start = parseIpPlain(iface.dhcpRangeStart);
		const end = parseIpPlain(iface.dhcpRangeEnd);
		if (start === null) continue;
		if (end === null) continue;

		/* Check if this interface's own IP subnet matches the DHCP range */
		if (!iface.ipAddress) continue;
		const parsed = parseIp(iface.ipAddress);
		if (!parsed) continue;

		if ((start & parsed.mask) >>> 0 !== parsed.network) {
			const dev = devices.find((d) => d.id === iface.deviceId);
			issues.push({
				severity: "warning",
				deviceId: iface.deviceId,
				portNumber: iface.portNumber,
				message: `${dev?.name ?? "Device"} port ${iface.portNumber} subnet ${ipToString(parsed.network)}/${parsed.cidr} doesn't match DHCP range ${iface.dhcpRangeStart}–${iface.dhcpRangeEnd}`,
				type: "no_dhcp_match",
			});
			continue;
		}

		const seg = portToSegment.get(`${iface.deviceId}:${iface.portNumber}`);
		if (!seg) continue;

		for (const sp of seg.ports) {
			if (sp.deviceId === iface.deviceId && sp.portNumber === iface.portNumber)
				continue;
			const other = portConfigs.find(
				(pc) =>
					pc.deviceId === sp.deviceId &&
					pc.portNumber === sp.portNumber &&
					pc.ipAddress,
			);
			if (!other?.ipAddress) continue;
			const otherPlain = parseIpPlain(other.ipAddress.split("/")[0]);
			if (otherPlain === null) continue;
			if (otherPlain >= start && otherPlain <= end) {
				const dev = devices.find((d) => d.id === sp.deviceId);
				issues.push({
					severity: "warning",
					deviceId: iface.deviceId,
					portNumber: iface.portNumber,
					message: `DHCP range ${iface.dhcpRangeStart}–${iface.dhcpRangeEnd} overlaps static IP ${other.ipAddress} on ${dev?.name ?? sp.deviceId} P${sp.portNumber}`,
					type: "dhcp_collision",
				});
			}
		}
	}

	/* ── 6b. WiFi client connected but no reachable DHCP server ── */
	const warnedWifiClients = new Set<string>();
	for (const conn of connections) {
		const devA = devices.find((d) => d.id === conn.deviceAId);
		const devB = devices.find((d) => d.id === conn.deviceBId);
		if (!devA || !devB) continue;

		const capsA = DEVICE_CAPABILITIES[devA.deviceType as DeviceType];
		const capsB = DEVICE_CAPABILITIES[devB.deviceType as DeviceType];
		const isWifiLink =
			conn.connectionType === "wifi" ||
			(conn.portA === 0 &&
				conn.portB === 0 &&
				((capsA?.wifiHost && capsB?.wifiClient) ||
					(capsB?.wifiHost && capsA?.wifiClient)));
		if (!isWifiLink) continue;

		let clientDevice = devA;
		let clientPort = conn.portA;
		let hostDevice = devB;
		if (capsA?.wifiHost && capsB?.wifiClient) {
			clientDevice = devB;
			clientPort = conn.portB;
			hostDevice = devA;
		}

		const clientKey = `${clientDevice.id}:${clientPort}`;
		if (warnedWifiClients.has(clientKey)) continue;

		const clientIface = portConfigs.find(
			(pc) =>
				pc.deviceId === clientDevice.id &&
				pc.portNumber === clientPort,
		);
		if (clientIface?.ipAddress) continue;

		const seg =
			portToSegment.get(clientKey) ??
			getNetworkSegment(
				clientDevice.id,
				clientPort,
				connections,
				devices,
				portConfigs,
			);

		const hasReachableDhcp = seg.ports.some((sp) => {
			const iface = portConfigs.find(
				(pc) => pc.deviceId === sp.deviceId && pc.portNumber === sp.portNumber,
			);
			return !!(
				iface?.dhcpEnabled &&
				iface.dhcpRangeStart &&
				iface.dhcpRangeEnd
			);
		});
		if (hasReachableDhcp) continue;

		issues.push({
			severity: "warning",
			deviceId: clientDevice.id,
			portNumber: clientPort,
			message: `${clientDevice.name} is connected to WiFi ${hostDevice.name}, but no reachable DHCP server exists in segment ${seg.subnet ?? seg.id}`,
			type: "no_dhcp_server",
		});
		warnedWifiClients.add(clientKey);
	}

	/* ── 7. NAT sanity checks ── */
	for (const iface of portConfigs) {
		if (!iface.natEnabled) continue;
		const dev = devices.find((d) => d.id === iface.deviceId);
		if (!dev) continue;

		if (!dev.ipForwarding) {
			issues.push({
				severity: "warning",
				deviceId: dev.id,
				portNumber: iface.portNumber,
				message: `${dev.name} has NAT enabled on port ${iface.portNumber} but IP forwarding is disabled`,
				type: "nat_misconfigured",
			});
		}

		const outSeg = portToSegment.get(`${iface.deviceId}:${iface.portNumber}`);
		if (!outSeg) {
			issues.push({
				severity: "warning",
				deviceId: dev.id,
				portNumber: iface.portNumber,
				message: `${dev.name} NAT interface port ${iface.portNumber} is not connected to any segment`,
				type: "nat_misconfigured",
			});
			continue;
		}

		const hasCloudUplink = outSeg.ports.some((sp) => {
			const d = devices.find((dd) => dd.id === sp.deviceId);
			return d?.deviceType === "cloud";
		});
		if (!hasCloudUplink) {
			issues.push({
				severity: "info",
				deviceId: dev.id,
				portNumber: iface.portNumber,
				message: `${dev.name} NAT on port ${iface.portNumber} is not on a cloud-facing segment`,
				type: "nat_misconfigured",
			});
		}
	}

	return { segments, issues };
}

/**
 * Find the gateway subnet for a port using the segment engine.
 * Returns the L3 device interface (IP/subnet) that defines the subnet
 * for the segment containing deviceId:portNumber.
 */
export function getGatewaySubnet(
	deviceId: string,
	portNumber: number,
	devices: DeviceRow[],
	connections: ConnectionRow[],
	portConfigs: PortConfigRow[],
): {
	subnet: string;
	gatewayIp: string;
	gatewayDeviceName: string;
	network: number;
	cidr: number;
	mask: number;
} | null {
	const seg = getNetworkSegment(
		deviceId,
		portNumber,
		connections,
		devices,
		portConfigs,
	);
	if (!seg.gateway) return null;
	const gwDev = devices.find((d) => d.id === seg.gateway?.deviceId);
	return {
		subnet: seg.subnet!,
		gatewayIp: seg.gateway.ip,
		gatewayDeviceName: gwDev?.name ?? "Gateway",
		network: seg.gateway.network,
		cidr: seg.gateway.cidr,
		mask: seg.gateway.mask,
	};
}

/**
 * Validate whether a proposed IP address belongs to the correct subnet
 * for the segment the port is in.
 * Returns `{ valid, warning, gatewaySubnet }`.
 */
export function validatePortIp(
	proposedIp: string,
	deviceId: string,
	portNumber: number,
	devices: DeviceRow[],
	connections: ConnectionRow[],
	portConfigs: PortConfigRow[],
): { valid: boolean; warning: string | null; gatewaySubnet: string | null } {
	const parsed = parseIp(proposedIp);
	if (!parsed)
		return {
			valid: false,
			warning: "Invalid IP/CIDR format",
			gatewaySubnet: null,
		};

	const gw = getGatewaySubnet(
		deviceId,
		portNumber,
		devices,
		connections,
		portConfigs,
	);
	if (!gw) return { valid: true, warning: null, gatewaySubnet: null };

	if ((parsed.ip & gw.mask) >>> 0 !== gw.network) {
		return {
			valid: false,
			warning: `IP ${proposedIp} is not in subnet ${gw.subnet} (via ${gw.gatewayDeviceName})`,
			gatewaySubnet: gw.subnet,
		};
	}

	return { valid: true, warning: null, gatewaySubnet: gw.subnet };
}

/* ── DHCP auto-IP assignment ── */

/** Parse a plain IP like "192.168.1.100" (no CIDR) into a 32-bit number */
function parseIpPlain(ip: string): number | null {
	const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!m) return null;
	const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
	if (o.some((v) => v > 255)) return null;
	return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}

/**
 * Get the next available IP from a DHCP interface's range.
 * Looks at the interface on `hostPortNumber` of the host device for DHCP config.
 * Scans dhcpRangeStart..dhcpRangeEnd, skipping IPs already assigned to connected clients.
 *
 * If the host interface has an IP with CIDR (e.g. "192.168.68.1/24"),
 * the DHCP range must fall within that subnet. Otherwise assignment is skipped.
 *
 * Returns an IP string with CIDR notation like "192.168.1.101/24"
 * or null if the range is full, subnet mismatch, or DHCP not configured.
 */
export function getNextDhcpIp(
	hostDevice: DeviceRow,
	hostPortNumber: number,
	connections: ConnectionRow[],
	portConfigs: InterfaceRow[],
): string | null {
	const hostIface = portConfigs.find(
		(p) => p.deviceId === hostDevice.id && p.portNumber === hostPortNumber,
	);
	if (
		!hostIface?.dhcpEnabled ||
		!hostIface.dhcpRangeStart ||
		!hostIface.dhcpRangeEnd
	)
		return null;

	const start = parseIpPlain(hostIface.dhcpRangeStart);
	const end = parseIpPlain(hostIface.dhcpRangeEnd);
	if (start === null || end === null || start > end) return null;

	/* If the host interface has an IP, verify DHCP range is in the same subnet */
	let cidr = 24; /* default */
	if (hostIface.ipAddress) {
		const gw = parseIp(hostIface.ipAddress);
		if (!gw) return null;
		cidr = gw.cidr;
		const mask = cidr > 0 ? (~0 << (32 - cidr)) >>> 0 : 0;
		const gwNet = (gw.ip & mask) >>> 0;
		const startNet = (start & mask) >>> 0;
		if (gwNet !== startNet)
			return null; /* DHCP range not in this port's subnet */
	} else {
		/* Derive CIDR from the common prefix of start..end range (min /24) */
		const xor = (start ^ end) >>> 0;
		if (xor > 0) {
			cidr = 32 - Math.ceil(Math.log2(xor + 1));
		}
		if (cidr > 24) cidr = 24;
	}

	/* Collect all IPs assigned to any client connected to this host (WiFi + wired) */
	const allConns = connections.filter(
		(c) => c.deviceAId === hostDevice.id || c.deviceBId === hostDevice.id,
	);
	const assignedIps = new Set<number>();
	for (const conn of allConns) {
		const clientId =
			conn.deviceAId === hostDevice.id ? conn.deviceBId : conn.deviceAId;
		const clientPort =
			conn.deviceAId === hostDevice.id ? conn.portB : conn.portA;
		const pc = portConfigs.find(
			(p) => p.deviceId === clientId && p.portNumber === clientPort,
		);
		if (pc?.ipAddress) {
			const plain = pc.ipAddress.split("/")[0];
			const n = parseIpPlain(plain);
			if (n !== null) assignedIps.add(n);
		}
	}

	/* Also exclude any IPs on host device ports themselves */
	for (const pc of portConfigs) {
		if (pc.deviceId === hostDevice.id && pc.ipAddress) {
			const plain = pc.ipAddress.split("/")[0];
			const n = parseIpPlain(plain);
			if (n !== null) assignedIps.add(n);
		}
	}

	/* Find first free IP */
	for (let ip = start; ip <= end; ip++) {
		if (!assignedIps.has(ip)) return `${ipToString(ip)}/${cidr}`;
	}
	return null; /* Range exhausted */
}
