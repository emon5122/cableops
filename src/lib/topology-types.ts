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
	"phone",
	"camera",
	"firewall",
	"access-point",
	"cloud",
] as const

export type DeviceType = (typeof DEVICE_TYPES)[number]

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
	switch: "Switch",
	router: "Router",
	pc: "PC",
	server: "Server",
	phone: "IP Phone",
	camera: "Camera",
	firewall: "Firewall",
	"access-point": "Access Point",
	cloud: "Cloud",
}

export const DEVICE_TYPE_DEFAULT_PORTS: Record<DeviceType, number> = {
	switch: 24,
	router: 8,
	pc: 1,
	server: 4,
	phone: 2,
	camera: 1,
	firewall: 8,
	"access-point": 4,
	cloud: 2,
}

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
	const portsPerRow = Math.min(PORTS_PER_ROW, Math.max(1, portCount))
	const rows = Math.ceil(Math.max(1, portCount) / portsPerRow)
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
	return connections.some(
		(c) =>
			(c.deviceAId === deviceId && c.portA === portNumber) ||
			(c.deviceBId === deviceId && c.portB === portNumber),
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
