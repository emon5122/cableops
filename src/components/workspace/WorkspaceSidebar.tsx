import DeviceIcon from "@/components/topology/DeviceIcon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	DEFAULT_COLORS,
	DEVICE_TYPES,
	DEVICE_TYPE_DEFAULT_PORTS,
	DEVICE_TYPE_LABELS,
	bestTextColor,
	getPortDisplayColor,
	getPortPeer,
	isPortConnected,
	type ConnectionRow,
	type DeviceRow,
	type DeviceType,
	type PortSelection,
} from "@/lib/topology-types"
import {
	Cable,
	ChevronDown,
	ChevronRight,
	Palette,
	Plus,
	Search,
	Trash2,
} from "lucide-react"
import { useState } from "react"

interface WorkspaceSidebarProps {
	devices: DeviceRow[]
	connections: ConnectionRow[]
	selectedDeviceId: string | null
	selectedPort: PortSelection | null
	onAddDevice: (name: string, portCount: number, color: string, deviceType: DeviceType) => void
	onUpdateDevice: (id: string, fields: { color?: string; name?: string }) => void
	onDeleteDevice: (id: string) => void
	onDeviceSelect: (id: string | null) => void
	onPortClick: (deviceId: string, portNumber: number) => void
	onDeleteConnection: (id: string) => void
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
	searchQuery,
	onSearchChange,
}: WorkspaceSidebarProps) {
	const [newName, setNewName] = useState("")
	const [newPorts, setNewPorts] = useState("24")
	const [newColor, setNewColor] = useState<string>(DEFAULT_COLORS[0])
	const [newType, setNewType] = useState<DeviceType>("switch")
	const [showColorPicker, setShowColorPicker] = useState(false)
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
		const portNum = Math.max(1, Math.min(9999, Number(newPorts) || DEVICE_TYPE_DEFAULT_PORTS[newType]))
		onAddDevice(newName.trim(), portNum, newColor, newType)
		setNewName("")
		setNewPorts(String(DEVICE_TYPE_DEFAULT_PORTS[newType]))
		setNewColor(
			DEFAULT_COLORS[
				(DEFAULT_COLORS.indexOf(newColor as typeof DEFAULT_COLORS[number]) + 1) % DEFAULT_COLORS.length
			] as string,
		)
	}

	const selectedDevice = devices.find((d) => d.id === selectedDeviceId)

	return (
		<aside className="w-90 shrink-0 border-r border-(--app-border) bg-(--app-surface-alt) overflow-y-auto flex flex-col">
			{/* Add device */}
			<div className="p-4 border-b border-(--app-border)">
				<h3 className="text-sm font-bold text-(--app-text) mb-3 flex items-center gap-2">
					<Plus size={14} />
					Add Device
				</h3>
				<form onSubmit={handleSubmit} className="space-y-3">
					{/* Device type selector */}
					<div>
						<Label className="text-xs text-(--app-text-muted) mb-1.5 block">Type</Label>
						<div className="grid grid-cols-3 gap-1.5">
							{DEVICE_TYPES.map((t) => (
								<button
									key={t}
									type="button"
									className={`flex flex-col items-center gap-1 py-2 px-1 rounded-md border text-[9px] font-semibold transition-all ${
										newType === t
											? "border-white/40 bg-(--app-surface-hover) text-white"
											: "border-(--app-border) bg-(--app-input-bg) text-(--app-text-muted) hover:border-(--app-border-light)"
									}`}
									onClick={() => handleSelectType(t)}
								>
									<DeviceIcon type={t} color={newType === t ? "#fff" : "var(--app-text-muted)"} size={20} />
									{DEVICE_TYPE_LABELS[t]}
								</button>
							))}
						</div>
					</div>

					<div>
						<Label className="text-xs text-(--app-text-muted)">Name</Label>
						<Input
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							placeholder={`e.g. Core ${DEVICE_TYPE_LABELS[newType]} A`}
							className="mt-1 bg-(--app-input-bg) border-(--app-border) text-(--app-text) h-8 text-sm"
						/>
					</div>
					<div className="flex gap-2">
						<div className="flex-1">
							<Label className="text-xs text-(--app-text-muted)">Ports</Label>
							<Input
								type="number"
								value={newPorts}
								onChange={(e) => setNewPorts(e.target.value)}
								min={1}
								max={9999}
								className="mt-1 bg-(--app-input-bg) border-(--app-border) text-(--app-text) h-8 text-sm"
							/>
						</div>
						<div className="relative">
							<Label className="text-xs text-(--app-text-muted)">Color</Label>
							<button
								type="button"
								className="mt-1 w-8 h-8 rounded-md border border-(--app-border) flex items-center justify-center"
								style={{ backgroundColor: newColor }}
								onClick={() => setShowColorPicker(!showColorPicker)}
								title="Select color"
							>
								<Palette size={14} color={bestTextColor(newColor)} />
							</button>
							{showColorPicker && (
								<div className="absolute left-0 bottom-full mb-2 z-60 p-3 bg-(--app-surface) border border-(--app-border) rounded-lg shadow-xl min-w-42.5">
									<div className="grid grid-cols-4 gap-2">
										{DEFAULT_COLORS.map((c) => (
											<button
												key={c}
												type="button"
												className={`w-8 h-8 rounded-md border-2 transition-all ${
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
					</div>
					<Button
						type="submit"
						size="sm"
						className="w-full bg-(--app-surface-hover) hover:bg-(--app-border-light) text-(--app-text) border border-(--app-border)"
					>
						<Plus size={14} /> Add {DEVICE_TYPE_LABELS[newType]}
					</Button>
				</form>
				<p className="text-xs text-(--app-text-muted) mt-2 leading-relaxed">
					Click two free ports to connect. Right-click a port for VLAN, speed, alias settings.
				</p>
			</div>

			{/* Search */}
			<div className="p-4 border-b border-(--app-border)">
				<div className="relative">
					<Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--app-text-muted)" />
					<Input
						value={searchQuery}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="Search devices, ports…"
						className="pl-8 bg-(--app-input-bg) border-(--app-border) text-(--app-text) h-8 text-sm"
					/>
				</div>
			</div>

			{/* Device list */}
			<div className="flex-1 overflow-y-auto p-4 space-y-2">
				<h3 className="text-sm font-bold text-(--app-text) mb-2">Devices ({devices.length})</h3>
				{devices.length === 0 && <p className="text-xs text-(--app-text-muted)">No devices yet. Add one above.</p>}
				{devices
					.filter((d) => !searchQuery || d.name.toLowerCase().includes(searchQuery.toLowerCase()))
					.map((device) => {
						const isExpanded = expandedDevice === device.id
						const deviceConns = connections.filter(
							(c) => c.deviceAId === device.id || c.deviceBId === device.id,
						)
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
										{device.portCount}p · {deviceConns.length}c
									</span>

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
										{deviceConns.length > 0 && (
											<div className="mt-2 space-y-1">
												{deviceConns.map((conn) => {
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
