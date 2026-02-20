import DeviceIcon from "@/components/topology/DeviceIcon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	DEFAULT_COLORS,
	DEVICE_CAPABILITIES,
	DEVICE_TYPES,
	DEVICE_TYPE_DEFAULT_PORTS,
	DEVICE_TYPE_LABELS,
	bestTextColor,
	getPortDisplayColor,
	getPortPeer,
	getWifiConnections,
	isPortConnected,
	type ConnectionRow,
	type DeviceRow,
	type DeviceType,
	type PortConfigRow,
	type PortSelection
} from "@/lib/topology-types"
import {
	Cable,
	ChevronDown,
	ChevronRight,
	Globe,
	Palette,
	Plus,
	Search,
	Settings,
	Trash2,
	Wifi
} from "lucide-react"
import { useCallback, useState } from "react"

interface WorkspaceSidebarProps {
	devices: DeviceRow[]
	connections: ConnectionRow[]
	selectedDeviceId: string | null
	selectedPort: PortSelection | null
	onAddDevice: (name: string, portCount: number, color: string, deviceType: DeviceType) => void
	onUpdateDevice: (id: string, fields: {
		color?: string
		name?: string
		managementIp?: string | null
		natEnabled?: boolean
		gateway?: string | null
		dhcpEnabled?: boolean
		dhcpRangeStart?: string | null
		dhcpRangeEnd?: string | null
		ssid?: string | null
		wifiPassword?: string | null
	}) => void
	onDeleteDevice: (id: string) => void
	onDeviceSelect: (id: string | null) => void
	onPortClick: (deviceId: string, portNumber: number) => void
	onDeleteConnection: (id: string) => void
	onWifiConnect: (clientDeviceId: string, hostDeviceId: string) => void
	portConfigs: PortConfigRow[]
	searchQuery: string
	onSearchChange: (query: string) => void
}

export default function WorkspaceSidebar({
	devices,
	connections,
	selectedDeviceId,
	selectedPort,
	onAddDevice,
	onUpdateDevice,
	onDeleteDevice,
	onDeviceSelect,
	onPortClick,
	onDeleteConnection,
	onWifiConnect,
	portConfigs,
	searchQuery,
	onSearchChange,
}: WorkspaceSidebarProps) {
	const [newName, setNewName] = useState("")
	const [newPorts, setNewPorts] = useState("24")
	const [newColor, setNewColor] = useState<string>(DEFAULT_COLORS[0])
	const [newType, setNewType] = useState<DeviceType>("switch")
	const [showColorPicker, setShowColorPicker] = useState(false)
	const [showAddForm, setShowAddForm] = useState(false)
	const [expandedDevice, setExpandedDevice] = useState<string | null>(null)
	const [editingColorDevice, setEditingColorDevice] = useState<string | null>(null)
	const [editingNameDevice, setEditingNameDevice] = useState<string | null>(null)
	const [editNameValue, setEditNameValue] = useState("")
	const [showNetworkSettings, setShowNetworkSettings] = useState<string | null>(null)

	const handleSelectType = (t: DeviceType) => {
		setNewType(t)
		setNewPorts(String(DEVICE_TYPE_DEFAULT_PORTS[t]))
	}

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		if (!newName.trim()) return
		const def = DEVICE_TYPE_DEFAULT_PORTS[newType]
		const portNum = def === 0 ? 0 : Math.max(1, Math.min(9999, Number(newPorts) || def))
		onAddDevice(newName.trim(), portNum, newColor, newType)
		setNewName("")
		setNewPorts(String(DEVICE_TYPE_DEFAULT_PORTS[newType]))
		setNewColor(
			DEFAULT_COLORS[
				(DEFAULT_COLORS.indexOf(newColor as typeof DEFAULT_COLORS[number]) + 1) % DEFAULT_COLORS.length
			] as string,
		)
		setShowAddForm(false)
	}

	const selectedDevice = devices.find((d) => d.id === selectedDeviceId)

	return (
		<aside className="w-80 shrink-0 border-r border-(--app-border) bg-(--app-surface-alt) overflow-y-auto flex flex-col">
			{/* Add device — collapsible */}
			<div className="border-b border-(--app-border)">
				<button
					type="button"
					className="w-full px-4 py-2.5 flex items-center gap-2 text-sm font-semibold text-(--app-text) hover:bg-(--app-surface-hover) transition-colors"
					onClick={() => setShowAddForm(!showAddForm)}
				>
					<Plus size={14} className={`transition-transform ${showAddForm ? "rotate-45" : ""}`} />
					Add Device
					{showAddForm ? <ChevronDown size={12} className="ml-auto" /> : <ChevronRight size={12} className="ml-auto" />}
				</button>

				{showAddForm && (
					<form onSubmit={handleSubmit} className="px-4 pb-3 space-y-2">
						{/* Type selector: icon + dropdown */}
						<div className="flex items-center gap-2">
							<div
								className="w-9 h-9 rounded-lg border border-(--app-border) flex items-center justify-center shrink-0"
								style={{ backgroundColor: newColor + "22" }}
							>
								<DeviceIcon type={newType} color={newColor} size={20} />
							</div>
							<select
								value={newType}
								onChange={(e) => handleSelectType(e.target.value as DeviceType)}
								className="flex-1 bg-(--app-input-bg) border border-(--app-border) text-(--app-text) rounded-md h-9 text-sm px-2 outline-none"
							>
								{DEVICE_TYPES.map((t) => (
									<option key={t} value={t}>
										{DEVICE_TYPE_LABELS[t]}
									</option>
								))}
							</select>
						</div>

						{/* Name */}
						<Input
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							placeholder={`Name, e.g. Core ${DEVICE_TYPE_LABELS[newType]}`}
							className="bg-(--app-input-bg) border-(--app-border) text-(--app-text) h-8 text-sm"
						/>

						{/* Ports + Color + Submit */}
						<div className="flex items-center gap-2">
							{DEVICE_TYPE_DEFAULT_PORTS[newType] > 0 ? (
								<Input
									type="number"
									value={newPorts}
									onChange={(e) => setNewPorts(e.target.value)}
									min={1}
									max={9999}
									className="w-20 bg-(--app-input-bg) border-(--app-border) text-(--app-text) h-8 text-sm"
									title="Port count"
								/>
							) : (
								<span className="text-xs text-(--app-text-dim) flex items-center gap-1">
									<Wifi size={11} className="text-sky-400" /> WiFi only
								</span>
							)}

							{/* Color */}
							<div className="relative">
								<button
									type="button"
									className="w-8 h-8 rounded-md border border-(--app-border) flex items-center justify-center"
									style={{ backgroundColor: newColor }}
									onClick={() => setShowColorPicker(!showColorPicker)}
									title="Color"
								>
									<Palette size={12} color={bestTextColor(newColor)} />
								</button>
								{showColorPicker && (
									<div className="absolute left-0 bottom-full mb-2 z-60 p-2.5 bg-(--app-surface) border border-(--app-border) rounded-lg shadow-xl">
										<div className="grid grid-cols-4 gap-1.5">
											{DEFAULT_COLORS.map((c) => (
												<button
													key={c}
													type="button"
													className={`w-7 h-7 rounded-md border-2 transition-all ${
														newColor === c ? "border-white scale-110" : "border-transparent hover:border-(--app-text-dim)"
													}`}
													style={{ backgroundColor: c }}
													onClick={() => {
														setNewColor(c as string)
														setShowColorPicker(false)
													}}
												/>
											))}
										</div>
									</div>
								)}
							</div>

							<Button
								type="submit"
								size="sm"
								className="flex-1 h-8 bg-(--app-surface-hover) hover:bg-(--app-border-light) text-(--app-text) border border-(--app-border) text-xs"
							>
								<Plus size={12} /> Add
							</Button>
						</div>
					</form>
				)}
			</div>

			{/* Search */}
			<div className="px-4 py-2 border-b border-(--app-border)">
				<div className="relative">
					<Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--app-text-muted)" />
					<Input
						value={searchQuery}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="Search devices…"
						className="pl-8 bg-(--app-input-bg) border-(--app-border) text-(--app-text) h-7 text-xs"
					/>
				</div>
			</div>

			{/* Device list */}
			<div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
				<div className="flex items-center justify-between mb-1">
					<h3 className="text-xs font-bold text-(--app-text)">Devices ({devices.length})</h3>
					<span className="text-[10px] text-(--app-text-dim)">Click ports to connect · Right-click for settings</span>
				</div>
				{devices.length === 0 && <p className="text-xs text-(--app-text-muted)">No devices yet.</p>}
				{devices
					.filter((d) => !searchQuery || d.name.toLowerCase().includes(searchQuery.toLowerCase()))
					.map((device) => {
						const isExpanded = expandedDevice === device.id
						const deviceConns = connections.filter(
							(c) => c.deviceAId === device.id || c.deviceBId === device.id,
						)
						/* Wired-only connections (port > 0 on this device's side) for the physical port list */
						const wiredConns = deviceConns.filter((c) => {
							const myPort = c.deviceAId === device.id ? c.portA : c.portB
							return myPort > 0
						})
						const isActive = selectedDeviceId === device.id

						return (
							<div
								key={device.id}
								className={`rounded-lg border transition-colors ${
									isActive ? "border-white/30 bg-(--app-surface-hover)" : "border-(--app-border) bg-(--app-surface)"
								}`}
							>
								<div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => onDeviceSelect(device.id)}>
									<DeviceIcon type={device.deviceType} color={device.color} size={16} />
									{editingNameDevice === device.id ? (
										<input
											autoFocus
											className="text-sm font-semibold text-(--app-text) bg-(--app-input-bg) border border-(--app-border-light) rounded px-1 flex-1 outline-none"
											value={editNameValue}
											onChange={(e) => setEditNameValue(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													if (editNameValue.trim()) onUpdateDevice(device.id, { name: editNameValue.trim() })
													setEditingNameDevice(null)
												}
												if (e.key === "Escape") setEditingNameDevice(null)
											}}
											onBlur={() => {
												if (editNameValue.trim()) onUpdateDevice(device.id, { name: editNameValue.trim() })
												setEditingNameDevice(null)
											}}
											onClick={(e) => e.stopPropagation()}
										/>
									) : (
										<span
											className="text-sm font-semibold text-(--app-text) truncate flex-1"
											onDoubleClick={(e) => {
												e.stopPropagation()
												setEditingNameDevice(device.id)
												setEditNameValue(device.name)
											}}
											title="Double-click to rename"
										>
											{device.name}
										</span>
									)}
									<span className="text-xs text-(--app-text-muted)">
									{device.portCount > 0 ? `${device.portCount}p · ` : ""}{deviceConns.length}c
								</span>

								{/* Port utilization mini bar (only for devices with physical ports) */}
								{device.portCount > 0 && (
									<div className="w-10 h-1.5 rounded-full bg-(--app-surface-hover) overflow-hidden shrink-0" title={`${wiredConns.length} of ${device.portCount} ports used`}>
										<div
											className={`h-full rounded-full transition-all ${wiredConns.length / device.portCount > 0.8 ? "bg-amber-400" : "bg-emerald-500"}`}
											style={{ width: `${Math.min(100, (wiredConns.length / device.portCount) * 100)}%` }}
										/>
									</div>
								)}
									{/* Color change button */}
									<div className="relative">
										<button
											type="button"
											className="w-5 h-5 rounded-sm border border-(--app-border-light) hover:border-white/40 transition-colors"
											style={{ backgroundColor: device.color }}
											onClick={(e) => {
												e.stopPropagation()
												setEditingColorDevice(editingColorDevice === device.id ? null : device.id)
											}}
											title="Change color"
										/>
										{editingColorDevice === device.id && (
											<div className="absolute right-0 top-full mt-1 z-60 p-2 bg-(--app-surface) border border-(--app-border) rounded-lg shadow-xl min-w-39">
												<div className="grid grid-cols-4 gap-1.5">
													{DEFAULT_COLORS.map((c) => (
														<button
															key={c}
															type="button"
															className={`w-7 h-7 rounded-md border-2 transition-all ${
																device.color === c ? "border-white scale-110" : "border-transparent hover:border-(--app-text-dim)"
															}`}
															style={{ backgroundColor: c }}
															onClick={(e) => {
																e.stopPropagation()
																onUpdateDevice(device.id, { color: c as string })
																setEditingColorDevice(null)
															}}
														/>
													))}
												</div>
											</div>
										)}
									</div>

									<button
										type="button"
										className="text-(--app-text-muted) hover:text-white p-0.5"
										onClick={(e) => {
											e.stopPropagation()
											setExpandedDevice(isExpanded ? null : device.id)
										}}
									>
										{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
									</button>
									<button
										type="button"
										className="text-(--app-text-muted) hover:text-red-400 p-0.5"
										onClick={(e) => {
											e.stopPropagation()
											onDeleteDevice(device.id)
										}}
										title="Delete device"
									>
										<Trash2 size={14} />
									</button>
								</div>

								{/* Expanded: port detail */}
								{isExpanded && (
									<div className="px-3 pb-3 border-t border-(--app-border)">
										{device.portCount > 0 ? (
											<div className="mt-2 grid grid-cols-8 gap-1">
												{Array.from({ length: device.portCount }, (_, i) => {
													const pNum = i + 1
													const connected = isPortConnected(device.id, pNum, connections)
													const peer = connected
														? getPortPeer(device.id, pNum, connections, devices)
														: null
													const isSel =
														selectedPort?.deviceId === device.id && selectedPort?.portNumber === pNum

													/* Color exchange in sidebar too */
													const portColor = getPortDisplayColor(device.id, pNum, connections, devices)

													return (
														<button
															key={pNum}
															type="button"
															title={peer ? `→ ${peer.deviceName}:${peer.port}` : `Port ${pNum} (free)`}
															className={`h-7 rounded text-[9px] font-bold transition-all ${
																isSel ? "ring-2 ring-white" : ""
															}`}
															style={{
																backgroundColor: connected ? portColor : "#1a1f2e",
																color: connected ? bestTextColor(portColor) : "#555",
															}}
															onClick={(e) => {
																e.stopPropagation()
																onPortClick(device.id, pNum)
															}}
														>
															{pNum}
														</button>
													)
												})}
											</div>
										) : (
											<div className="mt-2 flex items-center gap-1.5 text-xs text-(--app-text-dim)">
												<Wifi size={12} className="text-sky-400" />
												<span>WiFi-only device (no physical ports)</span>
											</div>
										)}

										{/* WiFi client: join a WiFi network */}
										{(() => {
											const caps = DEVICE_CAPABILITIES[device.deviceType as DeviceType]
											if (!caps) return null
											const wifiConns = getWifiConnections(device.id, connections)

											if (caps.wifiClient) {
												const wifiHosts = devices.filter((d) => {
													const dCaps = DEVICE_CAPABILITIES[d.deviceType as DeviceType]
													/* Only show hosts that have wifiHost capability AND have an SSID configured */
													return dCaps?.wifiHost && d.id !== device.id && d.ssid
												})
												/* Already connected to a WiFi host? */
												const connectedHostIds = new Set(
													wifiConns.map((c) =>
														c.deviceAId === device.id ? c.deviceBId : c.deviceAId
													)
												)
												return (
													<div className="mt-2 border-t border-(--app-border) pt-2">
														<div className="flex items-center gap-1.5 text-xs text-(--app-text-muted) mb-1.5">
															<Wifi size={11} className="text-sky-400" />
															<span className="font-medium">WiFi</span>
														</div>
														{wifiConns.length > 0 && (
															<div className="space-y-1 mb-1.5">
																{wifiConns.map((wc) => {
																	const hostId = wc.deviceAId === device.id ? wc.deviceBId : wc.deviceAId
																	const hostDev = devices.find((d) => d.id === hostId)
																	const wifiIp = portConfigs.find((pc) => pc.deviceId === device.id && pc.portNumber === 0)?.ipAddress
																	return (
																		<div key={wc.id} className="flex items-center gap-1 text-xs text-sky-300 flex-wrap">
																			<Wifi size={9} />
																			<span>{hostDev?.name ?? "?"}</span>
																			{hostDev?.ssid && (
																				<span className="text-[10px] text-(--app-text-dim) ml-0.5">({hostDev.ssid})</span>
																			)}
																			{wifiIp && (
																				<span className="text-[10px] font-mono text-emerald-400 ml-0.5">{wifiIp}</span>
																			)}
																			<button
																				type="button"
																				className="ml-auto text-red-400/60 hover:text-red-400"
																				onClick={() => onDeleteConnection(wc.id)}
																				title="Disconnect WiFi"
																			>
																				<Trash2 size={10} />
																			</button>
																		</div>
																	)
																})}
															</div>
														)}
														{wifiHosts.length > 0 ? (
															<div className="space-y-1">
																{wifiHosts
																	.filter((h) => !connectedHostIds.has(h.id))
																	.map((host) => (
																		<button
																			key={host.id}
																			type="button"
																			className="w-full flex items-center gap-1.5 text-xs text-(--app-text-muted) hover:text-sky-300 hover:bg-(--app-surface-hover) rounded px-1.5 py-1 transition-colors"
																			onClick={(e) => {
																				e.stopPropagation()
																				onWifiConnect(device.id, host.id)
																			}}
																		>
																			<Wifi size={10} className="text-sky-500" />
																			<span>{host.name}</span>
																			{host.ssid && (
																				<span className="text-[10px] text-(--app-text-dim)">({host.ssid})</span>
																			)}
																			<span className="ml-auto text-[10px] text-sky-500">Join</span>
																		</button>
																	))}
															</div>
														) : (
															<p className="text-[10px] text-(--app-text-dim)">No WiFi networks available</p>
														)}
													</div>
												)
											}

											/* WiFi host: show connected clients */
											if (caps.wifiHost && wifiConns.length > 0) {
												return (
													<div className="mt-2 border-t border-(--app-border) pt-2">
														<div className="flex items-center gap-1.5 text-xs text-(--app-text-muted) mb-1.5">
															<Wifi size={11} className="text-sky-400" />
															<span className="font-medium">WiFi Clients ({wifiConns.length})</span>
														</div>
														<div className="space-y-1">
															{wifiConns.map((wc) => {
																const clientId = wc.deviceAId === device.id ? wc.deviceBId : wc.deviceAId
																const clientDev = devices.find((d) => d.id === clientId)
																const clientIp = portConfigs.find((pc) => pc.deviceId === clientId && pc.portNumber === 0)?.ipAddress
																return (
																	<div key={wc.id} className="flex items-center gap-1 text-xs text-sky-300">
																		<DeviceIcon type={clientDev?.deviceType ?? "pc"} size={10} color="currentColor" />
																		<span>{clientDev?.name ?? "?"}</span>
																		{clientIp && (
																			<span className="text-[10px] font-mono text-emerald-400">{clientIp}</span>
																		)}
																		<button
																			type="button"
																			className="ml-auto text-red-400/60 hover:text-red-400"
																			onClick={() => onDeleteConnection(wc.id)}
																			title="Disconnect WiFi client"
																		>
																			<Trash2 size={10} />
																		</button>
																	</div>
																)
															})}
														</div>
													</div>
												)
											}

											return null
										})()}

										{wiredConns.length > 0 && (
											<div className="mt-2 space-y-1">
												{wiredConns.map((conn) => {
													const isA = conn.deviceAId === device.id
													const peerId = isA ? conn.deviceBId : conn.deviceAId
													const peerPort = isA ? conn.portB : conn.portA
													const myPort = isA ? conn.portA : conn.portB
													const peerDev = devices.find((d) => d.id === peerId)
													return (
														<div key={conn.id} className="flex items-center gap-1 text-xs text-(--app-text-muted)">
															<Cable size={10} />
															<span>
																:{myPort} → {peerDev?.name ?? "?"}:{peerPort}
															</span>
															{conn.speed && (
																<span className="text-[10px] text-cyan-400 ml-1">{conn.speed}</span>
															)}
															<button
																type="button"
																className="ml-auto text-red-400/60 hover:text-red-400"
																onClick={() => onDeleteConnection(conn.id)}
																title="Disconnect"
															>
																<Trash2 size={10} />
															</button>
														</div>
													)
												})}
											</div>
										)}

										{/* Network settings toggle */}
										<DeviceNetworkSettings
											device={device}
											onUpdateDevice={onUpdateDevice}
											isOpen={showNetworkSettings === device.id}
											onToggle={() => setShowNetworkSettings(
												showNetworkSettings === device.id ? null : device.id
											)}
										/>
									</div>
								)}
							</div>
						)
					})}
			</div>

			{/* Selected device footer */}
			{selectedDevice && !expandedDevice && (
				<div className="p-4 border-t border-(--app-border) bg-(--app-surface)">
					<div className="flex items-center gap-2 mb-1">
						<DeviceIcon type={selectedDevice.deviceType} color={selectedDevice.color} size={14} />
						<span className="text-sm font-bold text-(--app-text)">{selectedDevice.name}</span>
					</div>
					<p className="text-xs text-(--app-text-muted)">
						{DEVICE_TYPE_LABELS[selectedDevice.deviceType as DeviceType] ?? selectedDevice.deviceType} ·{" "}
						{selectedDevice.portCount} ports ·{" "}
						{connections.filter((c) => c.deviceAId === selectedDevice.id || c.deviceBId === selectedDevice.id).length}{" "}
						connections
					</p>
				</div>
			)}
		</aside>
	)
}


/* ── Device-level Network Settings ── */

interface DeviceNetworkSettingsProps {
	device: DeviceRow
	onUpdateDevice: (id: string, fields: {
		managementIp?: string | null
		natEnabled?: boolean
		gateway?: string | null
		dhcpEnabled?: boolean
		dhcpRangeStart?: string | null
		dhcpRangeEnd?: string | null
		ssid?: string | null
		wifiPassword?: string | null
	}) => void
	isOpen: boolean
	onToggle: () => void
}

function DeviceNetworkSettings({
	device,
	onUpdateDevice,
	isOpen,
	onToggle,
}: DeviceNetworkSettingsProps) {
	const caps = DEVICE_CAPABILITIES[device.deviceType as DeviceType] ?? DEVICE_CAPABILITIES.pc

	/* Determine what settings are relevant */
	const hasAnySettings =
		caps.managementIp || caps.natCapable || caps.dhcpCapable ||
		caps.layer === "endpoint" || caps.wifiHost

	const [mgmtIp, setMgmtIp] = useState(device.managementIp ?? "")
	const [gateway, setGateway] = useState(device.gateway ?? "")
	const [dhcpStart, setDhcpStart] = useState(device.dhcpRangeStart ?? "")
	const [dhcpEnd, setDhcpEnd] = useState(device.dhcpRangeEnd ?? "")
	const [ssid, setSsid] = useState(device.ssid ?? "")
	const [wifiPass, setWifiPass] = useState(device.wifiPassword ?? "")

	const handleSave = useCallback(() => {
		const fields: Record<string, string | boolean | null> = {}
		if (caps.managementIp) {
			fields.managementIp = mgmtIp.trim() || null
		}
		if (caps.layer === "endpoint") {
			fields.gateway = gateway.trim() || null
		}
		if (caps.natCapable) {
			fields.natEnabled = device.natEnabled ?? false
		}
		if (caps.dhcpCapable) {
			fields.dhcpEnabled = device.dhcpEnabled ?? false
			fields.dhcpRangeStart = dhcpStart.trim() || null
			fields.dhcpRangeEnd = dhcpEnd.trim() || null
		}
		onUpdateDevice(device.id, fields)
	}, [caps, device, mgmtIp, gateway, dhcpStart, dhcpEnd, onUpdateDevice])

	if (!hasAnySettings) return null

	return (
		<div className="mt-2">
			<button
				type="button"
				className="flex items-center gap-1.5 text-xs text-(--app-text-muted) hover:text-(--app-text) transition-colors w-full"
				onClick={(e) => { e.stopPropagation(); onToggle() }}
			>
				<Settings size={11} />
				<span>Network Settings</span>
				{isOpen ? <ChevronDown size={11} className="ml-auto" /> : <ChevronRight size={11} className="ml-auto" />}
			</button>

			{isOpen && (
				<div className="mt-2 space-y-2 bg-(--app-surface-alt) rounded-md p-2 border border-(--app-border)" onClick={(e) => e.stopPropagation()}>

					{/* Management IP for L2 devices / Public IP for Internet */}
					{caps.managementIp && (
						<div>
							<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block mb-0.5">
								{caps.layer === "cloud" ? "Public (Outbound) IP" : "Management IP"}
							</label>
							<div className="flex gap-1">
								<input
									type="text"
									placeholder={caps.layer === "cloud" ? "e.g. 203.0.113.1" : "e.g. 192.168.1.2"}
									value={mgmtIp}
									onChange={(e) => setMgmtIp(e.target.value)}
									className="flex-1 bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1 text-xs text-(--app-text) font-mono outline-none"
								/>
								<button
									type="button"
									className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded"
									onClick={() => onUpdateDevice(device.id, { managementIp: mgmtIp.trim() || null })}
								>
									Set
								</button>
							</div>
							<p className="text-[9px] text-(--app-text-dim) mt-0.5">
								{caps.layer === "cloud"
									? "ISP-assigned public IP (WAN outbound address)"
									: "Single IP for this L2 device (SNMP, SSH, web management)"}
							</p>
						</div>
					)}

					{/* Gateway for endpoints */}
					{caps.layer === "endpoint" && (
						<div>
							<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block mb-0.5">
								Default Gateway
							</label>
							<div className="flex gap-1">
								<input
									type="text"
									placeholder="e.g. 192.168.1.1"
									value={gateway}
									onChange={(e) => setGateway(e.target.value)}
									className="flex-1 bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1 text-xs text-(--app-text) font-mono outline-none"
								/>
								<button
									type="button"
									className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded"
									onClick={() => onUpdateDevice(device.id, { gateway: gateway.trim() || null })}
								>
									Set
								</button>
							</div>
							<p className="text-[9px] text-(--app-text-dim) mt-0.5">
								Router IP this device uses as its default gateway
							</p>
						</div>
					)}

					{/* NAT toggle for L3 */}
					{caps.natCapable && (
						<div className="flex items-center justify-between">
							<div>
								<div className="text-[10px] text-(--app-text-dim) uppercase tracking-wider">NAT</div>
								<p className="text-[9px] text-(--app-text-dim)">
									Network Address Translation
								</p>
							</div>
							<button
								type="button"
								className={`w-9 h-5 rounded-full transition-colors relative ${
									device.natEnabled ? "bg-emerald-500" : "bg-(--app-surface-hover)"
								}`}
								onClick={() => onUpdateDevice(device.id, { natEnabled: !device.natEnabled })}
							>
								<div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
									device.natEnabled ? "translate-x-4" : "translate-x-0.5"
								}`} />
							</button>
						</div>
					)}

					{/* DHCP for routers/servers */}
					{caps.dhcpCapable && (
						<div className="space-y-1.5">
							<div className="flex items-center justify-between">
								<div>
									<div className="text-[10px] text-(--app-text-dim) uppercase tracking-wider">DHCP Server</div>
								</div>
								<button
									type="button"
									className={`w-9 h-5 rounded-full transition-colors relative ${
										device.dhcpEnabled ? "bg-emerald-500" : "bg-(--app-surface-hover)"
									}`}
									onClick={() => onUpdateDevice(device.id, { dhcpEnabled: !device.dhcpEnabled })}
								>
									<div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
										device.dhcpEnabled ? "translate-x-4" : "translate-x-0.5"
									}`} />
								</button>
							</div>
							{device.dhcpEnabled && (
								<div className="space-y-1">
									<div className="flex gap-1">
										<input
											type="text"
											placeholder="Start: 192.168.1.100"
											value={dhcpStart}
											onChange={(e) => setDhcpStart(e.target.value)}
											className="flex-1 bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1 text-xs text-(--app-text) font-mono outline-none"
										/>
									</div>
									<div className="flex gap-1">
										<input
											type="text"
											placeholder="End: 192.168.1.200"
											value={dhcpEnd}
											onChange={(e) => setDhcpEnd(e.target.value)}
											className="flex-1 bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1 text-xs text-(--app-text) font-mono outline-none"
										/>
									</div>
									<button
										type="button"
										className="w-full px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded"
										onClick={handleSave}
									>
										Save DHCP Range
									</button>
								</div>
							)}
						</div>
					)}

					{/* WiFi SSID & Password for AP / Router */}
					{caps.wifiHost && (
						<div className="space-y-1.5">
							<div className="text-[10px] text-(--app-text-dim) uppercase tracking-wider">WiFi Network</div>
							<input
								type="text"
								placeholder="SSID (network name)"
								value={ssid}
								onChange={(e) => setSsid(e.target.value)}
								className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1 text-xs text-(--app-text) outline-none"
							/>
							<input
								type="password"
								placeholder="WiFi Password"
								value={wifiPass}
								onChange={(e) => setWifiPass(e.target.value)}
								className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1 text-xs text-(--app-text) outline-none"
							/>
							<button
								type="button"
								className="w-full px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded"
								onClick={() => onUpdateDevice(device.id, {
									ssid: ssid.trim() || null,
									wifiPassword: wifiPass.trim() || null,
								})}
							>
								Save WiFi
							</button>
							{device.ssid && (
								<p className="text-[9px] text-emerald-400">
									Broadcasting: <span className="font-mono">{device.ssid}</span>
								</p>
							)}
						</div>
					)}

					{/* Info badges */}
					<div className="flex flex-wrap gap-1 pt-1 border-t border-(--app-border)">
						<span className="text-[9px] px-1.5 py-0.5 rounded bg-(--app-surface) text-(--app-text-dim)">
							{caps.layer === 1 ? "L1" : caps.layer === 2 ? "L2" : caps.layer === 3 ? "L3" : caps.layer === "cloud" ? "WAN" : "Endpoint"}
						</span>
						{caps.perPortIp && (
							<span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400">
								<Globe size={8} className="inline mr-0.5" />Per-port IP
							</span>
						)}
						{caps.natCapable && (
							<span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-400">NAT</span>
						)}
						{caps.vlanSupport && (
							<span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-400/10 text-violet-400">VLAN</span>
						)}
						{caps.dhcpCapable && (
							<span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400">DHCP</span>
						)}
						{caps.wifiHost && device.ssid && (
							<span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-400/10 text-sky-400">WiFi Host</span>
						)}
						{caps.wifiHost && !device.ssid && (
							<span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-400/10 text-sky-400/40">WiFi Capable</span>
						)}
						{caps.wifiClient && (
							<span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-400/10 text-sky-300">WiFi</span>
						)}
					</div>
				</div>
			)}
		</div>
	)
}