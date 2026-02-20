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
    type InterfaceRow,
    type PortSelection
} from "@/lib/topology-types"
import {
    Cable,
    ChevronDown,
    ChevronRight,
    Palette,
    Plus,
    Search,
    Trash2,
    Wifi
} from "lucide-react"
import { useState } from "react"

interface WorkspaceSidebarProps {
	devices: DeviceRow[]
	connections: ConnectionRow[]
	selectedDeviceId: string | null
	selectedPort: PortSelection | null
	onAddDevice: (name: string, portCount: number, color: string, deviceType: DeviceType) => void
	onUpdateDevice: (id: string, fields: {
		color?: string
		name?: string
		ipForwarding?: boolean
	}) => void
	onDeleteDevice: (id: string) => void
	onDeviceSelect: (id: string | null) => void
	onPortClick: (deviceId: string, portNumber: number) => void
	onDeleteConnection: (id: string) => void
	onWifiConnect: (clientDeviceId: string, hostDeviceId: string) => void
	portConfigs: InterfaceRow[]
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
													/* Only show hosts that have wifiHost capability AND have an SSID configured on an interface */
													const dSsid = portConfigs.find((pc) => pc.deviceId === d.id && pc.ssid)?.ssid
													return dCaps?.wifiHost && d.id !== device.id && dSsid
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
																			{(() => {
																			const hostSsid = portConfigs.find((pc) => pc.deviceId === hostId && pc.ssid)?.ssid
																			return hostSsid ? (
																				<span className="text-[10px] text-(--app-text-dim) ml-0.5">({hostSsid})</span>
																			) : null
																		})()}
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
																			{(() => {
																				const hSsid = portConfigs.find((pc) => pc.deviceId === host.id && pc.ssid)?.ssid
																				return hSsid ? (
																					<span className="text-[10px] text-(--app-text-dim)">({hSsid})</span>
																				) : null
																			})()}
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

										{/* Hint: configure networking per-interface */}
										<div className="mt-2 text-[10px] text-(--app-text-dim) italic">
											Right-click a port for IP, DHCP, WiFi, NAT settings
										</div>
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