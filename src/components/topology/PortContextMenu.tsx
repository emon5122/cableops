import {
    SPEED_OPTIONS,
    VLAN_PRESETS,
    type ConnectionRow,
    type DeviceRow,
    type PortConfigRow,
} from "@/lib/topology-types"
import { useCallback, useEffect, useRef, useState } from "react"

interface PortContextMenuProps {
	x: number
	y: number
	deviceId: string
	portNumber: number
	device: DeviceRow
	connections: ConnectionRow[]
	devices: DeviceRow[]
	portConfig: PortConfigRow | null
	onClose: () => void
	onUpdatePortConfig: (config: {
		deviceId: string
		portNumber: number
		alias?: string | null
		speed?: string | null
		vlan?: number | null
		reserved?: boolean
		reservedLabel?: string | null
		ipAddress?: string | null
		macAddress?: string | null
	}) => void
	onDisconnect: (connectionId: string) => void
}

export default function PortContextMenu({
	x,
	y,
	deviceId,
	portNumber,
	device,
	connections,
	devices,
	portConfig,
	onClose,
	onUpdatePortConfig,
	onDisconnect,
}: PortContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null)
	const [activePanel, setActivePanel] = useState<
		"main" | "speed" | "vlan" | "alias" | "ip" | "mac"
	>("main")
	const [aliasValue, setAliasValue] = useState(portConfig?.alias ?? "")
	const [customVlan, setCustomVlan] = useState("")
	const [ipValue, setIpValue] = useState(portConfig?.ipAddress ?? "")
	const [macValue, setMacValue] = useState(portConfig?.macAddress ?? "")

	// Find connection for this port
	const connection = connections.find(
		(c) =>
			(c.deviceAId === deviceId && c.portA === portNumber) ||
			(c.deviceBId === deviceId && c.portB === portNumber),
	)
	const isConnected = !!connection

	// Find peer device
	let peerInfo: { name: string; port: number; color: string } | null = null
	if (connection) {
		const isA =
			connection.deviceAId === deviceId &&
			connection.portA === portNumber
		const peerId = isA ? connection.deviceBId : connection.deviceAId
		const peerPort = isA ? connection.portB : connection.portA
		const peerDev = devices.find((d) => d.id === peerId)
		if (peerDev) {
			peerInfo = { name: peerDev.name, port: peerPort, color: peerDev.color }
		}
	}

	// Close on click outside
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose()
			}
		}
		document.addEventListener("mousedown", handler)
		return () => document.removeEventListener("mousedown", handler)
	}, [onClose])

	// Close on Escape
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose()
		}
		document.addEventListener("keydown", handler)
		return () => document.removeEventListener("keydown", handler)
	}, [onClose])

	const setSpeed = useCallback(
		(speed: string | null) => {
			onUpdatePortConfig({ deviceId, portNumber, speed })
			onClose()
		},
		[deviceId, portNumber, onUpdatePortConfig, onClose],
	)

	const setVlan = useCallback(
		(vlan: number | null) => {
			onUpdatePortConfig({ deviceId, portNumber, vlan })
			onClose()
		},
		[deviceId, portNumber, onUpdatePortConfig, onClose],
	)

	const setAlias = useCallback(() => {
		onUpdatePortConfig({
			deviceId,
			portNumber,
			alias: aliasValue.trim() || null,
		})
		onClose()
	}, [deviceId, portNumber, aliasValue, onUpdatePortConfig, onClose])

	const saveIp = useCallback(() => {
		onUpdatePortConfig({
			deviceId,
			portNumber,
			ipAddress: ipValue.trim() || null,
		})
		onClose()
	}, [deviceId, portNumber, ipValue, onUpdatePortConfig, onClose])

	const saveMac = useCallback(() => {
		onUpdatePortConfig({
			deviceId,
			portNumber,
			macAddress: macValue.trim().toUpperCase() || null,
		})
		onClose()
	}, [deviceId, portNumber, macValue, onUpdatePortConfig, onClose])

	const generateRandomMac = useCallback(() => {
		const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0").toUpperCase()
		// Set locally administered + unicast bits on first octet
		const first = (Math.floor(Math.random() * 256) | 0x02) & 0xfe
		const mac = [first.toString(16).padStart(2, "0").toUpperCase(), hex(), hex(), hex(), hex(), hex()].join(":")
		setMacValue(mac)
	}, [])

	const formatMacInput = useCallback((val: string) => {
		// Strip non-hex characters, auto-insert colons
		const clean = val.replace(/[^0-9a-fA-F]/g, "").slice(0, 12)
		const parts = clean.match(/.{1,2}/g) ?? []
		return parts.join(":")
	}, [])

	const toggleReserved = useCallback(() => {
		onUpdatePortConfig({
			deviceId,
			portNumber,
			reserved: !portConfig?.reserved,
			reservedLabel: !portConfig?.reserved ? "Reserved" : null,
		})
		onClose()
	}, [deviceId, portNumber, portConfig, onUpdatePortConfig, onClose])

	// Position adjustment to keep menu in viewport
	const menuStyle: React.CSSProperties = {
		position: "fixed",
		left: x,
		top: y,
		zIndex: 9999,
	}

	return (
		<div ref={menuRef} style={menuStyle}>
			<div className="bg-(--app-menu-bg) border border-(--app-border-light) rounded-lg shadow-2xl text-sm min-w-55 overflow-hidden">
				{/* Header */}
				<div className="px-3 py-2 border-b border-(--app-border-light) bg-(--app-surface)">
					<div className="flex items-center gap-2">
						<div
							className="w-3 h-3 rounded-sm"
							style={{ backgroundColor: device.color }}
						/>
						<span className="text-(--app-text) font-semibold text-xs">
							{device.name} — Port {portNumber}
						</span>
					</div>
					{isConnected && peerInfo && (
						<div className="mt-1 flex items-center gap-1.5 text-[10px] text-(--app-text-muted)">
							<span>→</span>
							<div
								className="w-2 h-2 rounded-sm"
								style={{ backgroundColor: peerInfo.color }}
							/>
							<span>
								{peerInfo.name}:{peerInfo.port}
							</span>
						</div>
					)}
					{portConfig?.alias && (
						<div className="mt-0.5 text-[10px] text-cyan-400">
							Alias: {portConfig.alias}
						</div>
					)}
					{portConfig?.ipAddress && (
						<div className="mt-0.5 text-[10px] text-emerald-400 font-mono">
							IP: {portConfig.ipAddress}
						</div>
					)}
					{portConfig?.macAddress && (
						<div className="mt-0.5 text-[10px] text-violet-400 font-mono">
							MAC: {portConfig.macAddress}
						</div>
					)}
				</div>

				{/* Main panel */}
				{activePanel === "main" && (
					<div className="py-1">
						{/* Speed */}
						<button
							type="button"
							className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
							onClick={() => setActivePanel("speed")}
						>
							<span className="flex items-center gap-2">
								<SpeedIcon />
								Link Speed
							</span>
							<span className="text-[10px] text-(--app-text-muted)">
								{portConfig?.speed ?? connection?.speed ?? "Auto"}
							</span>
						</button>

						{/* VLAN */}
						<button
							type="button"
							className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
							onClick={() => setActivePanel("vlan")}
						>
							<span className="flex items-center gap-2">
								<VlanIcon />
								VLAN
							</span>
							<span className="text-[10px] text-(--app-text-muted)">
								{portConfig?.vlan ?? "None"}
							</span>
						</button>

						{/* Alias */}
						<button
							type="button"
							className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
							onClick={() => setActivePanel("alias")}
						>
							<span className="flex items-center gap-2">
								<AliasIcon />
								Port Alias
							</span>
							<span className="text-[10px] text-(--app-text-muted) truncate max-w-20">
								{portConfig?.alias ?? "—"}
							</span>
						</button>

						{/* IP Address */}
						<button
							type="button"
							className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
							onClick={() => setActivePanel("ip")}
						>
							<span className="flex items-center gap-2">
								<IpIcon />
								IP Address
							</span>
							<span className="text-[10px] text-(--app-text-muted) truncate max-w-24 font-mono">
								{portConfig?.ipAddress ?? "—"}
							</span>
						</button>

						{/* MAC Address */}
						<button
							type="button"
							className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
							onClick={() => setActivePanel("mac")}
						>
							<span className="flex items-center gap-2">
								<MacIcon />
								MAC Address
							</span>
							<span className="text-[10px] text-(--app-text-muted) truncate max-w-24 font-mono">
								{portConfig?.macAddress ?? "—"}
							</span>
						</button>

						{/* Reserve */}
						<button
							type="button"
							className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
							onClick={toggleReserved}
						>
							<span className="flex items-center gap-2">
								<ReserveIcon />
								{portConfig?.reserved ? "Unreserve" : "Reserve"}
							</span>
							{portConfig?.reserved && (
								<span className="text-[10px] text-amber-400">●</span>
							)}
						</button>

						{/* Disconnect */}
						{isConnected && connection && (
							<>
								<div className="border-t border-(--app-border-light) my-1" />
								<button
									type="button"
									className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-400/10 flex items-center gap-2"
									onClick={() => {
										onDisconnect(connection.id)
										onClose()
									}}
								>
									<DisconnectIcon />
									Disconnect
								</button>
							</>
						)}
					</div>
				)}

				{/* Speed panel */}
				{activePanel === "speed" && (
					<div className="py-1">
						<button
							type="button"
							className="w-full px-3 py-1 text-left text-(--app-text-muted) hover:bg-(--app-surface-hover) text-xs"
							onClick={() => setActivePanel("main")}
						>
							← Back
						</button>
						<div className="border-t border-(--app-border-light) my-1" />
						<button
							type="button"
							className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
							onClick={() => setSpeed(null)}
						>
							Auto
							{!portConfig?.speed && (
								<span className="text-cyan-400 text-xs">✓</span>
							)}
						</button>
						{SPEED_OPTIONS.map((s) => (
							<button
								key={s}
								type="button"
								className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
								onClick={() => setSpeed(s)}
							>
								{s}
								{portConfig?.speed === s && (
									<span className="text-cyan-400 text-xs">✓</span>
								)}
							</button>
						))}
					</div>
				)}

				{/* VLAN panel */}
				{activePanel === "vlan" && (
					<div className="py-1">
						<button
							type="button"
							className="w-full px-3 py-1 text-left text-(--app-text-muted) hover:bg-(--app-surface-hover) text-xs"
							onClick={() => setActivePanel("main")}
						>
							← Back
						</button>
						<div className="border-t border-(--app-border-light) my-1" />
						<button
							type="button"
							className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
							onClick={() => setVlan(null)}
						>
							None
							{!portConfig?.vlan && (
								<span className="text-cyan-400 text-xs">✓</span>
							)}
						</button>
						{VLAN_PRESETS.map((v) => (
							<button
								key={v}
								type="button"
								className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
								onClick={() => setVlan(v)}
							>
								VLAN {v}
								{portConfig?.vlan === v && (
									<span className="text-cyan-400 text-xs">✓</span>
								)}
							</button>
						))}
						<div className="border-t border-(--app-border-light) my-1" />
						<div className="px-3 py-1 flex gap-1">
							<input
								type="number"
								min={1}
								max={4094}
								placeholder="Custom (1-4094)"
								value={customVlan}
								onChange={(e) => setCustomVlan(e.target.value)}
								className="flex-1 bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1 text-xs text-(--app-text) outline-none"
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										const num = Number(customVlan)
										if (num >= 1 && num <= 4094) setVlan(num)
									}
								}}
							/>
							<button
								type="button"
								className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded"
								onClick={() => {
									const num = Number(customVlan)
									if (num >= 1 && num <= 4094) setVlan(num)
								}}
							>
								Set
							</button>
						</div>
					</div>
				)}

				{/* Alias panel */}
				{activePanel === "alias" && (
					<div className="py-1">
						<button
							type="button"
							className="w-full px-3 py-1 text-left text-(--app-text-muted) hover:bg-(--app-surface-hover) text-xs"
							onClick={() => setActivePanel("main")}
						>
							← Back
						</button>
						<div className="border-t border-(--app-border-light) my-1" />
						<div className="px-3 py-2 space-y-2">
							<input
								type="text"
								placeholder="e.g. Uplink-1, MGMT"
								value={aliasValue}
								onChange={(e) => setAliasValue(e.target.value)}
								className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1.5 text-xs text-(--app-text) outline-none"
								onKeyDown={(e) => {
									if (e.key === "Enter") setAlias()
								}}
								autoFocus
							/>
							<div className="flex gap-1">
								<button
									type="button"
									className="flex-1 px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded"
									onClick={setAlias}
								>
									Save
								</button>
								<button
									type="button"
									className="px-2 py-1 bg-(--app-surface-hover) hover:bg-(--app-border-light) text-(--app-text-muted) text-xs rounded"
									onClick={() => {
										setAliasValue("")
										onUpdatePortConfig({
											deviceId,
											portNumber,
											alias: null,
										})
										onClose()
									}}
								>
									Clear
								</button>
							</div>
						</div>
					</div>
				)}

				{/* IP Address panel */}
				{activePanel === "ip" && (
					<div className="py-1">
						<button
							type="button"
							className="w-full px-3 py-1 text-left text-(--app-text-muted) hover:bg-(--app-surface-hover) text-xs"
							onClick={() => setActivePanel("main")}
						>
							← Back
						</button>
						<div className="border-t border-(--app-border-light) my-1" />
						<div className="px-3 py-2 space-y-2">
							<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block">
								IP Address (CIDR notation)
							</label>
							<input
								type="text"
								placeholder="192.168.1.1/24"
								value={ipValue}
								onChange={(e) => setIpValue(e.target.value)}
								className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1.5 text-xs text-(--app-text) font-mono outline-none"
								onKeyDown={(e) => {
									if (e.key === "Enter") saveIp()
								}}
								autoFocus
							/>
							{ipValue && /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(ipValue.trim()) && (() => {
								const [ip, cidrStr] = ipValue.trim().split("/")
								const cidr = Number(cidrStr)
								const mask = cidr > 0 ? (~0 << (32 - cidr)) >>> 0 : 0
								const parts = ip.split(".").map(Number)
								const ipNum = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
								const network = (ipNum & mask) >>> 0
								const broadcast = (network | ~mask) >>> 0
								const hosts = cidr <= 30 ? Math.pow(2, 32 - cidr) - 2 : cidr === 31 ? 2 : 1
								const toIp = (n: number) => `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`
								return (
									<div className="text-[10px] text-(--app-text-dim) space-y-0.5 bg-(--app-surface-alt) rounded p-2">
										<div>Network: <span className="font-mono text-emerald-400">{toIp(network)}/{cidr}</span></div>
										<div>Mask: <span className="font-mono">{toIp(mask)}</span></div>
										<div>Broadcast: <span className="font-mono">{toIp(broadcast)}</span></div>
										<div>Usable hosts: <span className="font-mono text-cyan-400">{hosts}</span></div>
									</div>
								)
							})()}
							<div className="flex gap-1">
								<button
									type="button"
									className="flex-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded"
									onClick={saveIp}
								>
									Save
								</button>
								<button
									type="button"
									className="px-2 py-1 bg-(--app-surface-hover) hover:bg-(--app-border-light) text-(--app-text-muted) text-xs rounded"
									onClick={() => {
										setIpValue("")
										onUpdatePortConfig({ deviceId, portNumber, ipAddress: null })
										onClose()
									}}
								>
									Clear
								</button>
							</div>
						</div>
					</div>
				)}

				{/* MAC Address panel */}
				{activePanel === "mac" && (
					<div className="py-1">
						<button
							type="button"
							className="w-full px-3 py-1 text-left text-(--app-text-muted) hover:bg-(--app-surface-hover) text-xs"
							onClick={() => setActivePanel("main")}
						>
							← Back
						</button>
						<div className="border-t border-(--app-border-light) my-1" />
						<div className="px-3 py-2 space-y-2">
							<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block">
								MAC Address
							</label>
							<input
								type="text"
								placeholder="AA:BB:CC:DD:EE:FF"
								value={macValue}
								onChange={(e) => setMacValue(formatMacInput(e.target.value))}
								className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1.5 text-xs text-(--app-text) font-mono outline-none"
								onKeyDown={(e) => {
									if (e.key === "Enter") saveMac()
								}}
								autoFocus
							/>
							<div className="flex gap-1">
								<button
									type="button"
									className="flex-1 px-2 py-1 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded"
									onClick={saveMac}
								>
									Save
								</button>
								<button
									type="button"
									className="px-2 py-1 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 text-xs rounded font-mono"
									onClick={generateRandomMac}
								>
									Random
								</button>
								<button
									type="button"
									className="px-2 py-1 bg-(--app-surface-hover) hover:bg-(--app-border-light) text-(--app-text-muted) text-xs rounded"
									onClick={() => {
										setMacValue("")
										onUpdatePortConfig({ deviceId, portNumber, macAddress: null })
										onClose()
									}}
								>
									Clear
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

/* ── Tiny inline SVG icons for context menu ── */

function SpeedIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
		</svg>
	)
}

function VlanIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<rect x="3" y="3" width="7" height="7" rx="1" />
			<rect x="14" y="3" width="7" height="7" rx="1" />
			<rect x="3" y="14" width="7" height="7" rx="1" />
			<rect x="14" y="14" width="7" height="7" rx="1" />
		</svg>
	)
}

function AliasIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M4 7V4h16v3" />
			<path d="M9 20h6" />
			<path d="M12 4v16" />
		</svg>
	)
}

function ReserveIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<rect x="3" y="11" width="18" height="11" rx="2" />
			<path d="M7 11V7a5 5 0 0 1 10 0v4" />
		</svg>
	)
}

function DisconnectIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M18 6L6 18" />
			<path d="M6 6l12 12" />
		</svg>
	)
}

function IpIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<circle cx="12" cy="12" r="10" />
			<path d="M2 12h20" />
			<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
		</svg>
	)
}

function MacIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<rect x="2" y="6" width="20" height="12" rx="2" />
			<path d="M6 10h.01" />
			<path d="M10 10h.01" />
			<path d="M14 10h.01" />
			<path d="M18 10h.01" />
			<path d="M8 14h8" />
		</svg>
	)
}
