/* ───────── CableOps – shared type definitions ───────── */

export interface Position {
	x: number
	y: number
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
] as const

export type DeviceType = (typeof DEVICE_TYPES)[number]

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
}

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
}

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
	layer: 1 | 2 | 3 | "endpoint" | "cloud"
	/** Each port/interface can have its own IP address */
	perPortIp: boolean
	/** The whole device has a single management IP (switches, APs) */
	managementIp: boolean
	/** Ports support VLAN tagging (access/trunk) */
	vlanSupport: boolean
	/** Device can perform NAT (router, firewall) */
	natCapable: boolean
	/** Device can act as a DHCP server */
	dhcpCapable: boolean
	/** Ports have MAC addresses */
	macPerPort: boolean
	/** Device can act as default gateway for a subnet */
	canBeGateway: boolean
	/** Port mode selection (access/trunk) available */
	portModeSupport: boolean
	/** Device can host a WiFi network (SSID/password) */
	wifiHost: boolean
	/** Device can connect to WiFi networks as a client */
	wifiClient: boolean
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
}

/** Get the capabilities for a device type string */
export function getDeviceCapabilities(deviceType: string): DeviceCapabilities {
	return DEVICE_CAPABILITIES[deviceType as DeviceType] ?? DEVICE_CAPABILITIES.pc
}

/* ── Port mode for switches ── */

export const PORT_MODES = ["access", "trunk", "hybrid"] as const
export type PortMode = (typeof PORT_MODES)[number]

/* ── Port role for directional traffic flow ── */

export const PORT_ROLES = ["uplink", "downlink"] as const
export type PortRole = (typeof PORT_ROLES)[number]

/* ── Data models (mirror DB rows) ── */

export interface WorkspaceRow {
	id: string
	name: string
	ownerId: string
	createdAt: Date | null
}

export interface DeviceRow {
	id: string
	workspaceId: string
	name: string
	deviceType: string
	color: string
	portCount: number
	positionX: number
	positionY: number
	maxSpeed: string | null
	/** Single management IP for L2 devices (switch, AP) */
	managementIp: string | null
	/** NAT enabled — only meaningful for L3 devices (router, firewall) */
	natEnabled: boolean | null
	/** Default gateway IP — for endpoint devices */
	gateway: string | null
	/** DHCP server enabled — for routers/servers */
	dhcpEnabled: boolean | null
	/** DHCP pool start address */
	dhcpRangeStart: string | null
	/** DHCP pool end address */
	dhcpRangeEnd: string | null
	/** WiFi SSID — for routers / access-points with wifiHost */
	ssid: string | null
	/** WiFi password — for routers / access-points with wifiHost */
	wifiPassword: string | null
	createdAt: Date | null
}

export interface ConnectionRow {
	id: string
	workspaceId: string
	deviceAId: string
	portA: number
	deviceBId: string
	portB: number
	speed: string | null
	/** "wired" | "wifi" — determines visual representation */
	connectionType: string | null
	createdAt: Date | null
}

export interface PortConfigRow {
	id: string
	deviceId: string
	portNumber: number
	alias: string | null
	reserved: boolean
	reservedLabel: string | null
	speed: string | null
	vlan: number | null
	ipAddress: string | null
	macAddress: string | null
	/** Port mode: access (single VLAN), trunk (tagged), hybrid — only for L2 devices */
	portMode: string | null
	/** Port role: uplink (WAN) | downlink (LAN) — determines traffic direction */
	portRole: string | null
}

export interface AnnotationRow {
	id: string
	workspaceId: string
	kind: string
	label: string | null
	x: number
	y: number
	width: number
	height: number
	color: string
	createdAt: Date | null
}

/* ── Topology canvas helpers ── */

export interface DragState {
	isDragging: boolean
	deviceId: string | null
	startMouseX: number
	startMouseY: number
	startDeviceX: number
	startDeviceY: number
}

export interface PortSelection {
	deviceId: string
	portNumber: number
}

/* ── Layout constants (larger devices and ports) ── */

export const DEVICE_NODE_WIDTH = 280
export const DEVICE_NODE_HEADER_HEIGHT = 48
export const PORT_SIZE = 28
export const PORT_GAP = 4
export const PORTS_PER_ROW = 8

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
] as const

export type SpeedOption = (typeof SPEED_OPTIONS)[number]

export const VLAN_PRESETS = [1, 10, 20, 30, 40, 50, 100, 200, 300, 999] as const

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
] as const

/* ── Geometry helpers ── */

export function getPortPosition(
	portIndex: number,
	portCount: number,
	nodeWidth: number = DEVICE_NODE_WIDTH,
): Position {
	const portsPerRow = Math.min(PORTS_PER_ROW, portCount)
	const spacing = PORT_SIZE + PORT_GAP
	const totalRowWidth = portsPerRow * spacing - PORT_GAP
	const startX = (nodeWidth - totalRowWidth) / 2 + PORT_SIZE / 2

	const col = portIndex % portsPerRow
	const row = Math.floor(portIndex / portsPerRow)

	return {
		x: startX + col * spacing,
		y: DEVICE_NODE_HEADER_HEIGHT + 14 + row * spacing + PORT_SIZE / 2,
	}
}

export function getDeviceNodeHeight(portCount: number): number {
	if (portCount <= 0) return DEVICE_NODE_HEADER_HEIGHT + 36 /* WiFi-only indicator space */
	const portsPerRow = Math.min(PORTS_PER_ROW, Math.max(1, portCount))
	const rows = Math.ceil(portCount / portsPerRow)
	const spacing = PORT_SIZE + PORT_GAP
	return DEVICE_NODE_HEADER_HEIGHT + 14 + rows * spacing + 14
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
	let h = hex.replace("#", "").trim()
	if (h.length === 3) h = h.split("").map((c) => c + c).join("")
	const n = Number.parseInt(h, 16)
	if (Number.isNaN(n) || h.length !== 6) return { r: 59, g: 130, b: 246 }
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function bestTextColor(bgHex: string): string {
	const c = hexToRgb(bgHex)
	const lum =
		0.2126 * (c.r / 255) + 0.7152 * (c.g / 255) + 0.0722 * (c.b / 255)
	return lum > 0.5 ? "#000000" : "#ffffff"
}

export function luminance(hex: string): number {
	const c = hexToRgb(hex)
	return 0.2126 * (c.r / 255) + 0.7152 * (c.g / 255) + 0.0722 * (c.b / 255)
}

export function isPortConnected(
	deviceId: string,
	portNumber: number,
	connections: ConnectionRow[],
): boolean {
	/* Port 0 is the virtual WiFi interface — always "available" for more clients on a host */
	if (portNumber === 0) return false
	return connections.some(
		(c) =>
			(c.deviceAId === deviceId && c.portA === portNumber) ||
			(c.deviceBId === deviceId && c.portB === portNumber),
	)
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
	)
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
	)
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
	const conn = getPortConnection(deviceId, portNumber, connections)
	if (!conn) return "#2a2f3b" // unconnected — dark grey
	const isA = conn.deviceAId === deviceId && conn.portA === portNumber
	const peerId = isA ? conn.deviceBId : conn.deviceAId
	const peerDevice = devices.find((d) => d.id === peerId)
	return peerDevice?.color ?? "#3b82f6"
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
	)
	if (!conn) return null

	const isA = conn.deviceAId === deviceId && conn.portA === portNumber
	const peerId = isA ? conn.deviceBId : conn.deviceAId
	const peerPort = isA ? conn.portB : conn.portA
	const peerDevice = devices.find((d) => d.id === peerId)
	return peerDevice
		? { deviceName: peerDevice.name, port: peerPort, color: peerDevice.color }
		: null
}

/* ── Speed helpers ── */

/** Parse a speed string like "10 Gbit" into a number in Mbit */
export function parseSpeedToMbit(speed: string): number {
	const m = speed.match(/^([\d.]+)\s*(Mbit|Gbit)$/i)
	if (!m) return 0
	const val = Number.parseFloat(m[1]!)
	return m[2]!.toLowerCase() === "gbit" ? val * 1000 : val
}

/** Given two port speeds, return the negotiated (minimum) speed string */
export function negotiatedSpeed(
	speedA: string | null | undefined,
	speedB: string | null | undefined,
): string | null {
	if (!speedA && !speedB) return null
	if (!speedA) return speedB ?? null
	if (!speedB) return speedA
	const a = parseSpeedToMbit(speedA)
	const b = parseSpeedToMbit(speedB)
	return a <= b ? speedA : speedB
}

/* ── IP / subnet helpers ── */

export function parseIp(ipCidr: string): { ip: number; cidr: number; network: number; mask: number } | null {
	const m = ipCidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/)
	if (!m) return null
	const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
	if (octets.some((o) => o > 255)) return null
	const cidr = Number(m[5])
	if (cidr > 32) return null
	const ip = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
	const mask = cidr > 0 ? (~0 << (32 - cidr)) >>> 0 : 0
	const network = (ip & mask) >>> 0
	return { ip, cidr, network, mask }
}

export function ipToString(n: number): string {
	return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`
}

export function sameSubnet(a: string, b: string): boolean {
	const pa = parseIp(a)
	const pb = parseIp(b)
	if (!pa || !pb) return false
	const cidr = Math.min(pa.cidr, pb.cidr)
	const mask = cidr > 0 ? (~0 << (32 - cidr)) >>> 0 : 0
	return ((pa.ip & mask) >>> 0) === ((pb.ip & mask) >>> 0)
}

/**
 * Walk the L2 broadcast domain from a given port, returning all device IDs
 * reachable without crossing an L3 boundary (router/firewall/load-balancer).
 * Returns the set of device IDs in the same broadcast domain.
 */
export function getBroadcastDomain(
	startDeviceId: string,
	connections: ConnectionRow[],
	devices: DeviceRow[],
): Set<string> {
	const domain = new Set<string>()
	const queue = [startDeviceId]
	while (queue.length > 0) {
		const devId = queue.shift()!
		if (domain.has(devId)) continue
		domain.add(devId)
		const dev = devices.find((d) => d.id === devId)
		if (!dev) continue
		const caps = DEVICE_CAPABILITIES[dev.deviceType as DeviceType]
		// Don't traverse through L3 devices — they terminate the broadcast domain
		// (but we DO include the L3 device itself if it's the starting point or an edge)
		if (devId !== startDeviceId && caps && (caps.layer === 3)) continue
		const conns = connections.filter(
			(c) => c.deviceAId === devId || c.deviceBId === devId,
		)
		for (const c of conns) {
			const peerId = c.deviceAId === devId ? c.deviceBId : c.deviceAId
			if (!domain.has(peerId)) queue.push(peerId)
		}
	}
	return domain
}

/**
 * Find the gateway subnet for a port by walking the broadcast domain and
 * looking for an L3 device (router/firewall/LB) interface with an IP.
 * Returns the subnet info if found, or null.
 */
export function getGatewaySubnet(
	deviceId: string,
	portNumber: number,
	devices: DeviceRow[],
	connections: ConnectionRow[],
	portConfigs: PortConfigRow[],
): { subnet: string; gatewayIp: string; gatewayDeviceName: string; network: number; cidr: number; mask: number } | null {
	const domain = getBroadcastDomain(deviceId, connections, devices)
	// Look for L3 device interfaces within this domain that have IPs
	for (const devId of domain) {
		const dev = devices.find((d) => d.id === devId)
		if (!dev) continue
		const caps = DEVICE_CAPABILITIES[dev.deviceType as DeviceType]
		if (!caps || !caps.canBeGateway) continue
		// Find ports on this L3 device that connect into this broadcast domain and have IPs
		const l3Ports = portConfigs.filter((pc) => pc.deviceId === devId && pc.ipAddress)
		for (const l3Port of l3Ports) {
			const parsed = parseIp(l3Port.ipAddress!)
			if (!parsed) continue
			return {
				subnet: `${ipToString(parsed.network)}/${parsed.cidr}`,
				gatewayIp: l3Port.ipAddress!,
				gatewayDeviceName: dev.name,
				network: parsed.network,
				cidr: parsed.cidr,
				mask: parsed.mask,
			}
		}
	}
	return null
}

/**
 * Validate whether a proposed IP address belongs to the correct subnet
 * for the broadcast domain the port is connected to.
 * Returns null if valid (or no gateway found), or an error message.
 */
export function validatePortIp(
	proposedIp: string,
	deviceId: string,
	portNumber: number,
	devices: DeviceRow[],
	connections: ConnectionRow[],
	portConfigs: PortConfigRow[],
): { valid: boolean; warning: string | null; gatewaySubnet: string | null } {
	const parsed = parseIp(proposedIp)
	if (!parsed) return { valid: false, warning: "Invalid IP/CIDR format", gatewaySubnet: null }

	const gw = getGatewaySubnet(deviceId, portNumber, devices, connections, portConfigs)
	if (!gw) return { valid: true, warning: null, gatewaySubnet: null } // No gateway found — can't validate

	// Check if the proposed IP is in the same subnet as the gateway
	if (((parsed.ip & gw.mask) >>> 0) !== gw.network) {
		return {
			valid: false,
			warning: `IP ${proposedIp} is not in the gateway subnet ${gw.subnet} (via ${gw.gatewayDeviceName})`,
			gatewaySubnet: gw.subnet,
		}
	}

	return { valid: true, warning: null, gatewaySubnet: gw.subnet }
}

/* ── DHCP auto-IP assignment ── */

/** Parse a plain IP like "192.168.1.100" (no CIDR) into a 32-bit number */
function parseIpPlain(ip: string): number | null {
	const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
	if (!m) return null
	const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
	if (o.some((v) => v > 255)) return null
	return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0
}

/**
 * Get the next available IP from a DHCP host's range.
 * Scans the host device's dhcpRangeStart..dhcpRangeEnd, skipping IPs
 * already assigned to devices connected via WiFi to this host.
 *
 * Returns a plain IP string like "192.168.1.101" or null if the range
 * is full or the host doesn't have DHCP configured.
 */
export function getNextDhcpIp(
	hostDevice: DeviceRow,
	connections: ConnectionRow[],
	devices: DeviceRow[],
	portConfigs: PortConfigRow[],
): string | null {
	if (!hostDevice.dhcpEnabled || !hostDevice.dhcpRangeStart || !hostDevice.dhcpRangeEnd) return null

	const start = parseIpPlain(hostDevice.dhcpRangeStart)
	const end = parseIpPlain(hostDevice.dhcpRangeEnd)
	if (start === null || end === null || start > end) return null

	/* Collect all IPs currently assigned to WiFi clients of this host */
	const wifiConns = connections.filter(
		(c) => c.connectionType === "wifi" &&
			(c.deviceAId === hostDevice.id || c.deviceBId === hostDevice.id),
	)
	const assignedIps = new Set<number>()
	for (const wc of wifiConns) {
		const clientId = wc.deviceAId === hostDevice.id ? wc.deviceBId : wc.deviceAId
		const pc = portConfigs.find((p) => p.deviceId === clientId && p.portNumber === 0)
		if (pc?.ipAddress) {
			/* strip CIDR if present */
			const plain = pc.ipAddress.split("/")[0]
			const n = parseIpPlain(plain)
			if (n !== null) assignedIps.add(n)
		}
	}

	/* Find first free IP */
	for (let ip = start; ip <= end; ip++) {
		if (!assignedIps.has(ip)) return ipToString(ip)
	}
	return null /* Range exhausted */
}
