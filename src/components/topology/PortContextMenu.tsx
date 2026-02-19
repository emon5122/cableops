import {
	DEVICE_CAPABILITIES,
	PORT_MODES,
	PORT_ROLES,
	SPEED_OPTIONS,
	VLAN_PRESETS,
	validatePortIp,
	type ConnectionRow,
	type DeviceRow,
	type DeviceType,
	type PortConfigRow,
	type PortMode,
	type PortRole,
} from "@/lib/topology-types"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

interface PortContextMenuProps {
	x: number
	y: number
	deviceId: string
	portNumber: number
	device: DeviceRow
	connections: ConnectionRow[]
	devices: DeviceRow[]
	portConfigs: PortConfigRow[]
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
		portMode?: string | null
		portRole?: string | null
	}) => void
	onDisconnect: (connectionId: string) => void
}

type PanelType =
	| "main"
	| "speed"
	| "vlan"
	| "alias"
	| "ip"
	| "mac"
	| "portMode"
	| "portRole"

export default function PortContextMenu({
	x,
	y,
	deviceId,
	portNumber,
	device,
	connections,
	devices,
	portConfigs,
	portConfig,
	onClose,
	onUpdatePortConfig,
	onDisconnect,
}: PortContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null)
	const [activePanel, setActivePanel] = useState<PanelType>("main")
	const [aliasValue, setAliasValue] = useState(portConfig?.alias ?? "")
	const [customVlan, setCustomVlan] = useState("")
	const [ipValue, setIpValue] = useState(portConfig?.ipAddress ?? "")
	const [macValue, setMacValue] = useState(portConfig?.macAddress ?? "")

	/* ── Device capabilities ── */
	const caps =
		DEVICE_CAPABILITIES[device.deviceType as DeviceType] ??
		DEVICE_CAPABILITIES.pc

	/* ── Connection info for this port ── */
	const connection = connections.find(
		(c) =>
			(c.deviceAId === deviceId && c.portA === portNumber) ||
			(c.deviceBId === deviceId && c.portB === portNumber),
	)
	const isConnected = !!connection

	let peerInfo: { name: string; port: number; color: string } | null = null
	if (connection) {
		const isA =
			connection.deviceAId === deviceId &&
			connection.portA === portNumber
		const peerId = isA ? connection.deviceBId : connection.deviceAId
		const peerPort = isA ? connection.portB : connection.portA
		const peerDev = devices.find((d) => d.id === peerId)
		if (peerDev) {
			peerInfo = {
				name: peerDev.name,
				port: peerPort,
				color: peerDev.color,
			}
		}
	}

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (
				menuRef.current &&
				!menuRef.current.contains(e.target as Node)
			)
				onClose()
		}
		document.addEventListener("mousedown", handler)
		return () => document.removeEventListener("mousedown", handler)
	}, [onClose])

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

	const setPortMode = useCallback(
		(mode: PortMode | null) => {
			onUpdatePortConfig({ deviceId, portNumber, portMode: mode })
			onClose()
		},
		[deviceId, portNumber, onUpdatePortConfig, onClose],
	)

	const setPortRole = useCallback(
		(role: PortRole | null) => {
			onUpdatePortConfig({ deviceId, portNumber, portRole: role })
			onClose()
		},
		[deviceId, portNumber, onUpdatePortConfig, onClose],
	)

	const generateRandomMac = useCallback(() => {
		const hex = () =>
			Math.floor(Math.random() * 256)
				.toString(16)
				.padStart(2, "0")
				.toUpperCase()
		const first = (Math.floor(Math.random() * 256) | 0x02) & 0xfe
		const mac = [
			first.toString(16).padStart(2, "0").toUpperCase(),
			hex(),
			hex(),
			hex(),
			hex(),
			hex(),
		].join(":")
		setMacValue(mac)
	}, [])

	const formatMacInput = useCallback((val: string) => {
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

	/* ── Subnet validation for the current IP value ── */
	const ipValidation = useMemo(() => {
		if (!ipValue.trim() || caps.canBeGateway || caps.layer === "cloud") return null
		return validatePortIp(ipValue.trim(), deviceId, portNumber, devices, connections, portConfigs)
	}, [ipValue, caps, deviceId, portNumber, devices, connections, portConfigs])

	/* ── Capability label for header ── */
	const layerLabel =
		caps.layer === 1
			? "L1 Hub"
			: caps.layer === 2
				? "L2 Port"
				: caps.layer === 3
					? "L3 Interface"
					: caps.layer === "cloud"
						? "WAN"
						: "NIC"

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
						<span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-(--app-surface-alt) text-(--app-text-dim) font-mono">
							{layerLabel}
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
					{portConfig?.ipAddress && caps.perPortIp && (
						<div className="mt-0.5 text-[10px] text-emerald-400 font-mono">
							IP: {portConfig.ipAddress}
						</div>
					)}
					{portConfig?.macAddress && caps.macPerPort && (
						<div className="mt-0.5 text-[10px] text-violet-400 font-mono">
							MAC: {portConfig.macAddress}
						</div>
					)}
					{portConfig?.portMode && caps.portModeSupport && (
						<div className="mt-0.5 text-[10px] text-amber-400">
							Mode: {portConfig.portMode}
						</div>
					)}
					{portConfig?.portRole && (
						<div className={`mt-0.5 text-[10px] ${portConfig.portRole === "uplink" ? "text-amber-400" : "text-cyan-400"}`}>
							Role: {portConfig.portRole === "uplink" ? "↑ Uplink (WAN)" : "↓ Downlink (LAN)"}
						</div>
					)}
					{/* Show why IP is disabled for L2 */}
					{!caps.perPortIp && caps.managementIp && (
						<div className="mt-0.5 text-[10px] text-(--app-text-dim) italic">
							L2 device — use Management IP on device settings
						</div>
					)}
				</div>

				{/* Main panel */}
				{activePanel === "main" && (
					<div className="py-1">
						{/* Speed — always available */}
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
								{portConfig?.speed ??
									connection?.speed ??
									"Auto"}
							</span>
						</button>

						{/* VLAN — only for L2 devices (switch, AP) */}
						{caps.vlanSupport && (
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
						)}

						{/* Port Mode — only for L2 devices */}
						{caps.portModeSupport && (
							<button
								type="button"
								className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
								onClick={() => setActivePanel("portMode")}
							>
								<span className="flex items-center gap-2">
									<PortModeIcon />
									Port Mode
								</span>
								<span className="text-[10px] text-(--app-text-muted)">
									{portConfig?.portMode ?? "access"}
								</span>
							</button>
						)}

						{/* Port Role — uplink (WAN) / downlink (LAN) — for L3, L2 with portModeSupport */}
						{(caps.layer === 3 || caps.portModeSupport) && (
							<button
								type="button"
								className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
								onClick={() => setActivePanel("portRole")}
							>
								<span className="flex items-center gap-2">
									<PortRoleIcon />
									Port Role
								</span>
								<span className={`text-[10px] ${
									portConfig?.portRole === "uplink" ? "text-amber-400" :
									portConfig?.portRole === "downlink" ? "text-cyan-400" :
									"text-(--app-text-muted)"
								}`}>
									{portConfig?.portRole ?? "auto"}
								</span>
							</button>
						)}

						{/* Alias — always available */}
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

						{/* IP Address — only for devices with per-port IP */}
						{caps.perPortIp && (
							<button
								type="button"
								className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
								onClick={() => setActivePanel("ip")}
							>
								<span className="flex items-center gap-2">
									<IpIcon />
									{caps.canBeGateway
										? "Interface IP"
										: "IP Address"}
								</span>
								<span className="text-[10px] text-(--app-text-muted) truncate max-w-24 font-mono">
									{portConfig?.ipAddress ?? "—"}
								</span>
							</button>
						)}

						{/* MAC Address — only for devices that have per-port MAC */}
						{caps.macPerPort && (
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
						)}

						{/* Disabled IP notice for L2/L1 */}
						{!caps.perPortIp && (
							<div className="px-3 py-1.5 text-[10px] text-(--app-text-dim) italic flex items-center gap-2">
								<IpIcon />
								<span>
									{caps.layer === 1
										? "Hub ports have no IP"
										: "Per-port IP not available (L2)"}
								</span>
							</div>
						)}

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
								<span className="text-[10px] text-amber-400">
									●
								</span>
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
						<BackButton onClick={() => setActivePanel("main")} />
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
									<span className="text-cyan-400 text-xs">
										✓
									</span>
								)}
							</button>
						))}
					</div>
				)}

				{/* VLAN panel */}
				{activePanel === "vlan" && (
					<div className="py-1">
						<BackButton onClick={() => setActivePanel("main")} />
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
									<span className="text-cyan-400 text-xs">
										✓
									</span>
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
										if (num >= 1 && num <= 4094)
											setVlan(num)
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

				{/* Port Mode panel — access / trunk / hybrid */}
				{activePanel === "portMode" && (
					<div className="py-1">
						<BackButton onClick={() => setActivePanel("main")} />
						<div className="border-t border-(--app-border-light) my-1" />
						<div className="px-3 py-1 text-[10px] text-(--app-text-dim)">
							Access: single VLAN untagged. Trunk: multiple
							VLANs tagged (802.1Q)
						</div>
						<div className="border-t border-(--app-border-light) my-1" />
						{PORT_MODES.map((m) => (
							<button
								key={m}
								type="button"
								className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between capitalize"
								onClick={() => setPortMode(m)}
							>
								{m}
								{(portConfig?.portMode ?? "access") === m && (
									<span className="text-cyan-400 text-xs">
										✓
									</span>
								)}
							</button>
						))}
					</div>
				)}

				{/* Port Role panel — uplink / downlink */}
				{activePanel === "portRole" && (
					<div className="py-1">
						<BackButton onClick={() => setActivePanel("main")} />
						<div className="border-t border-(--app-border-light) my-1" />
						<div className="px-3 py-1 text-[10px] text-(--app-text-dim)">
							<span className="text-amber-400">Uplink</span>: WAN-facing port (connects to ISP / upstream router).{" "}
							<span className="text-cyan-400">Downlink</span>: LAN-facing port (serves local devices, DHCP, VLAN).
						</div>
						<div className="border-t border-(--app-border-light) my-1" />
						<button
							type="button"
							className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
							onClick={() => setPortRole(null)}
						>
							Auto
							{!portConfig?.portRole && (
								<span className="text-cyan-400 text-xs">✓</span>
							)}
						</button>
						{PORT_ROLES.map((r) => (
							<button
								key={r}
								type="button"
								className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between capitalize"
								onClick={() => setPortRole(r)}
							>
								<span className="flex items-center gap-2">
									{r === "uplink" ? "↑ Uplink (WAN)" : "↓ Downlink (LAN)"}
								</span>
								{portConfig?.portRole === r && (
									<span className="text-cyan-400 text-xs">✓</span>
								)}
							</button>
						))}
					</div>
				)}

				{/* Alias panel */}
				{activePanel === "alias" && (
					<div className="py-1">
						<BackButton onClick={() => setActivePanel("main")} />
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

				{/* IP Address panel — contextual */}
				{activePanel === "ip" && (
					<div className="py-1">
						<BackButton onClick={() => setActivePanel("main")} />
						<div className="border-t border-(--app-border-light) my-1" />
						<div className="px-3 py-2 space-y-2">
							{caps.canBeGateway && (
								<div className="text-[10px] text-amber-400 bg-amber-400/10 rounded px-2 py-1">
									This interface defines a subnet. Connected
									devices should use IPs within this range.
								</div>
							)}
							{caps.layer === "endpoint" && (
								<div className="text-[10px] text-cyan-400 bg-cyan-400/10 rounded px-2 py-1">
									Assign an IP from the connected router's
									subnet.
								</div>
							)}
							<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block">
								{caps.canBeGateway
									? "Interface IP (CIDR)"
									: "IP Address (CIDR notation)"}
							</label>
							<input
								type="text"
								placeholder={
									caps.canBeGateway
										? "e.g. 192.168.1.1/24"
										: "e.g. 192.168.1.100/24"
								}
								value={ipValue}
								onChange={(e) => setIpValue(e.target.value)}
								className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1.5 text-xs text-(--app-text) font-mono outline-none"
								onKeyDown={(e) => {
									if (e.key === "Enter") saveIp()
								}}
								autoFocus
							/>
							{ipValue &&
								/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(
									ipValue.trim(),
								) &&
								(() => {
									const parts = ipValue.trim().split("/")
									const ip = parts[0] ?? ""
									const cidrStr = parts[1] ?? "0"
									const cidr = Number(cidrStr)
									const mask =
										cidr > 0
											? (~0 << (32 - cidr)) >>> 0
											: 0
									const octets = ip
										.split(".")
										.map(Number)
									const ipNum =
										(((octets[0] ?? 0) << 24) |
											((octets[1] ?? 0) << 16) |
											((octets[2] ?? 0) << 8) |
											(octets[3] ?? 0)) >>>
										0
									const network = (ipNum & mask) >>> 0
									const broadcast =
										(network | ~mask) >>> 0
									const hosts =
										cidr <= 30
											? 2 ** (32 - cidr) - 2
											: cidr === 31
												? 2
												: 1
									const toIp = (n: number) =>
										`${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`
									return (
										<div className="text-[10px] text-(--app-text-dim) space-y-0.5 bg-(--app-surface-alt) rounded p-2">
											<div>
												Network:{" "}
												<span className="font-mono text-emerald-400">
													{toIp(network)}/{cidr}
												</span>
											</div>
											<div>
												Mask:{" "}
												<span className="font-mono">
													{toIp(mask)}
												</span>
											</div>
											<div>
												Broadcast:{" "}
												<span className="font-mono">
													{toIp(broadcast)}
												</span>
											</div>
											<div>
												Usable hosts:{" "}
												<span className="font-mono text-cyan-400">
													{hosts}
												</span>
											</div>
											{caps.canBeGateway && (
												<div className="text-amber-400">
													Gateway:{" "}
													<span className="font-mono">
														{toIp(ipNum)}
													</span>
												</div>
											)}
										</div>
									)
								})()}
							{/* Subnet validation warning */}
							{ipValidation && ipValidation.warning && (
								<div className="text-[10px] bg-red-500/10 border border-red-500/30 text-red-400 rounded px-2 py-1.5">
									<div className="font-semibold">⚠ Subnet Mismatch</div>
									<div className="mt-0.5">{ipValidation.warning}</div>
								</div>
							)}
							{ipValidation && !ipValidation.warning && ipValidation.gatewaySubnet && (
								<div className="text-[10px] bg-emerald-500/10 text-emerald-400 rounded px-2 py-1">
									✓ Matches gateway subnet {ipValidation.gatewaySubnet}
								</div>
							)}
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
										onUpdatePortConfig({
											deviceId,
											portNumber,
											ipAddress: null,
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

				{/* MAC Address panel */}
				{activePanel === "mac" && (
					<div className="py-1">
						<BackButton onClick={() => setActivePanel("main")} />
						<div className="border-t border-(--app-border-light) my-1" />
						<div className="px-3 py-2 space-y-2">
							<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block">
								MAC Address
							</label>
							<input
								type="text"
								placeholder="AA:BB:CC:DD:EE:FF"
								value={macValue}
								onChange={(e) =>
									setMacValue(
										formatMacInput(e.target.value),
									)
								}
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
										onUpdatePortConfig({
											deviceId,
											portNumber,
											macAddress: null,
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
			</div>
		</div>
	)
}

/* ── Shared sub-components ── */

function BackButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			className="w-full px-3 py-1 text-left text-(--app-text-muted) hover:bg-(--app-surface-hover) text-xs"
			onClick={onClick}
		>
			← Back
		</button>
	)
}

/* ── Tiny inline SVG icons ── */

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

function PortModeIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M4 6h16M4 12h16M4 18h16" />
			<circle cx="8" cy="6" r="2" fill="currentColor" />
			<circle cx="16" cy="12" r="2" fill="currentColor" />
			<circle cx="8" cy="18" r="2" fill="currentColor" />
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

function PortRoleIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d="M12 5v14" />
			<path d="M19 12l-7-7-7 7" />
		</svg>
	)
}
