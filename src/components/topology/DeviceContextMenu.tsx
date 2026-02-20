import {
    DEVICE_CAPABILITIES,
    type DeviceRow,
    type DeviceType,
} from "@/lib/topology-types"
import { useCallback, useEffect, useRef, useState } from "react"

interface DeviceContextMenuProps {
	x: number
	y: number
	device: DeviceRow
	onClose: () => void
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
	onDeleteDevice: (id: string) => void
}

type PanelType = "main" | "network" | "wifi" | "dhcp"

export default function DeviceContextMenu({
	x,
	y,
	device,
	onClose,
	onUpdateDevice,
	onDeleteDevice,
}: DeviceContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null)
	const [activePanel, setActivePanel] = useState<PanelType>("main")
	const caps = DEVICE_CAPABILITIES[device.deviceType as DeviceType] ?? DEVICE_CAPABILITIES.pc

	/* ── Local state for editable fields ── */
	const [mgmtIp, setMgmtIp] = useState(device.managementIp ?? "")
	const [gateway, setGateway] = useState(device.gateway ?? "")
	const [dhcpStart, setDhcpStart] = useState(device.dhcpRangeStart ?? "")
	const [dhcpEnd, setDhcpEnd] = useState(device.dhcpRangeEnd ?? "")
	const [ssid, setSsid] = useState(device.ssid ?? "")
	const [wifiPass, setWifiPass] = useState(device.wifiPassword ?? "")

	/* ── Click-away & escape ── */
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
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

	/* ── Capability checks ── */
	const hasNetwork = caps.managementIp || caps.layer === "endpoint"
	const hasDhcp = caps.dhcpCapable
	const hasNat = caps.natCapable
	const hasWifi = caps.wifiHost

	const layerLabel =
		caps.layer === 1 ? "L1" :
		caps.layer === 2 ? "L2" :
		caps.layer === 3 ? "L3" :
		caps.layer === "cloud" ? "WAN" : "Endpoint"

	const saveMgmtIp = useCallback(() => {
		onUpdateDevice(device.id, { managementIp: mgmtIp.trim() || null })
		onClose()
	}, [device.id, mgmtIp, onUpdateDevice, onClose])

	const saveGateway = useCallback(() => {
		onUpdateDevice(device.id, { gateway: gateway.trim() || null })
		onClose()
	}, [device.id, gateway, onUpdateDevice, onClose])

	const saveDhcp = useCallback(() => {
		onUpdateDevice(device.id, {
			dhcpEnabled: device.dhcpEnabled ?? false,
			dhcpRangeStart: dhcpStart.trim() || null,
			dhcpRangeEnd: dhcpEnd.trim() || null,
		})
		onClose()
	}, [device.id, device.dhcpEnabled, dhcpStart, dhcpEnd, onUpdateDevice, onClose])

	const saveWifi = useCallback(() => {
		onUpdateDevice(device.id, {
			ssid: ssid.trim() || null,
			wifiPassword: wifiPass.trim() || null,
		})
		onClose()
	}, [device.id, ssid, wifiPass, onUpdateDevice, onClose])

	return (
		<div ref={menuRef} style={{ position: "fixed", left: x, top: y, zIndex: 9999 }}>
			<div className="bg-(--app-menu-bg) border border-(--app-border-light) rounded-lg shadow-2xl text-sm min-w-56 overflow-hidden">
				{/* Header */}
				<div className="px-3 py-2 border-b border-(--app-border-light) bg-(--app-surface)">
					<div className="flex items-center gap-2">
						<div className="w-3 h-3 rounded-sm" style={{ backgroundColor: device.color }} />
						<span className="text-(--app-text) font-semibold text-xs truncate flex-1">
							{device.name}
						</span>
						<span className="text-[9px] px-1.5 py-0.5 rounded bg-(--app-surface-alt) text-(--app-text-dim) font-mono">
							{layerLabel}
						</span>
					</div>
					{device.managementIp && (
						<div className="mt-0.5 text-[10px] text-emerald-400 font-mono">
							IP: {device.managementIp}
						</div>
					)}
					{device.ssid && (
						<div className="mt-0.5 text-[10px] text-sky-400">
							SSID: {device.ssid}
						</div>
					)}
					{device.dhcpEnabled && device.dhcpRangeStart && (
						<div className="mt-0.5 text-[10px] text-cyan-400 font-mono">
							DHCP: {device.dhcpRangeStart} – {device.dhcpRangeEnd}
						</div>
					)}
				</div>

				{/* ── Main panel ── */}
				{activePanel === "main" && (
					<div className="py-1">
						{/* Network Settings */}
						{hasNetwork && (
							<button
								type="button"
								className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
								onClick={() => setActivePanel("network")}
							>
								<span className="flex items-center gap-2">
									<NetIcon />
									Network Settings
								</span>
								<span className="text-[10px] text-(--app-text-muted)">
									{device.managementIp ?? "—"}
								</span>
							</button>
						)}

						{/* Per-port IP hint for L3 devices */}
						{caps.perPortIp && !hasNetwork && (
							<div className="px-3 py-1.5 text-[10px] text-(--app-text-dim) italic flex items-center gap-2">
								<NetIcon />
								<span>Right-click each port to set interface IPs &amp; roles</span>
							</div>
						)}

						{/* DHCP */}
						{hasDhcp && (
							<button
								type="button"
								className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
								onClick={() => setActivePanel("dhcp")}
							>
								<span className="flex items-center gap-2">
									<DhcpIcon />
									DHCP Server
								</span>
								<span className="text-[10px] text-(--app-text-muted)">
									{device.dhcpEnabled ? "On" : "Off"}
								</span>
							</button>
						)}

						{/* NAT toggle — inline with description */}
						{hasNat && (
							<div className="px-3 py-1.5">
								<button
									type="button"
									className="w-full text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between rounded px-1 py-1"
									onClick={() => onUpdateDevice(device.id, { natEnabled: !device.natEnabled })}
								>
									<span className="flex items-center gap-2">
										<NatIcon />
										NAT
									</span>
									<span className={`text-[10px] ${device.natEnabled ? "text-emerald-400" : "text-(--app-text-muted)"}`}>
										{device.natEnabled ? "Enabled" : "Disabled"}
									</span>
								</button>
								<p className="text-[9px] text-(--app-text-dim) mt-0.5 pl-6">
									Translates private LAN IPs to public IP for internet access.
									Enable when this router connects to an ISP / cloud.
								</p>
							</div>
						)}

						{/* WiFi */}
						{hasWifi && (
							<button
								type="button"
								className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
								onClick={() => setActivePanel("wifi")}
							>
								<span className="flex items-center gap-2">
									<WifiIcon />
									WiFi Settings
								</span>
								<span className="text-[10px] text-(--app-text-muted) truncate max-w-20">
									{device.ssid ?? "—"}
								</span>
							</button>
						)}

						{/* Delete */}
						<div className="border-t border-(--app-border-light) my-1" />
						<button
							type="button"
							className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-400/10 flex items-center gap-2"
							onClick={() => {
								onDeleteDevice(device.id)
								onClose()
							}}
						>
							<TrashIcon />
							Delete Device
						</button>
					</div>
				)}

				{/* ── Network panel ── */}
				{activePanel === "network" && (
					<div className="py-1">
						<BackButton onClick={() => setActivePanel("main")} />
						<div className="border-t border-(--app-border-light) my-1" />
						<div className="px-3 py-2 space-y-3">
							{/* Management / Public IP */}
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
											onKeyDown={(e) => { if (e.key === "Enter") saveMgmtIp() }}
											autoFocus
										/>
										<button
											type="button"
											className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded"
											onClick={saveMgmtIp}
										>
											Set
										</button>
									</div>
									<p className="text-[9px] text-(--app-text-dim) mt-0.5">
										{caps.layer === "cloud"
											? "ISP-assigned public IP"
											: "Single IP for management access (SSH, SNMP)"}
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
											onKeyDown={(e) => { if (e.key === "Enter") saveGateway() }}
										/>
										<button
											type="button"
											className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded"
											onClick={saveGateway}
										>
											Set
										</button>
									</div>
									<p className="text-[9px] text-(--app-text-dim) mt-0.5">
										Router IP this device uses as its default gateway
									</p>
								</div>
							)}
						</div>
					</div>
				)}

				{/* ── DHCP panel ── */}
				{activePanel === "dhcp" && (
					<div className="py-1">
						<BackButton onClick={() => setActivePanel("main")} />
						<div className="border-t border-(--app-border-light) my-1" />
						<div className="px-3 py-2 space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-[10px] text-(--app-text-dim) uppercase tracking-wider">DHCP Server</span>
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
								<>
									<div>
										<label className="text-[10px] text-(--app-text-dim) block mb-0.5">Pool Start</label>
										<input
											type="text"
											placeholder="192.168.1.100"
											value={dhcpStart}
											onChange={(e) => setDhcpStart(e.target.value)}
											className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1 text-xs text-(--app-text) font-mono outline-none"
										/>
									</div>
									<div>
										<label className="text-[10px] text-(--app-text-dim) block mb-0.5">Pool End</label>
										<input
											type="text"
											placeholder="192.168.1.200"
											value={dhcpEnd}
											onChange={(e) => setDhcpEnd(e.target.value)}
											className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1 text-xs text-(--app-text) font-mono outline-none"
										/>
									</div>
									<button
										type="button"
										className="w-full px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded"
										onClick={saveDhcp}
									>
										Save DHCP Range
									</button>
									<p className="text-[9px] text-(--app-text-dim)">
										Assigns IPs to devices on <span className="text-cyan-400">downlink</span> ports only.
										Uplink (WAN) ports get their IP from the upstream network.
									</p>
								</>
							)}
						</div>
					</div>
				)}

				{/* ── WiFi panel ── */}
				{activePanel === "wifi" && (
					<div className="py-1">
						<BackButton onClick={() => setActivePanel("main")} />
						<div className="border-t border-(--app-border-light) my-1" />
						<div className="px-3 py-2 space-y-2">
							<div>
								<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block mb-0.5">SSID</label>
								<input
									type="text"
									placeholder="Network name"
									value={ssid}
									onChange={(e) => setSsid(e.target.value)}
									className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1 text-xs text-(--app-text) outline-none"
									autoFocus
								/>
							</div>
							<div>
								<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block mb-0.5">Password</label>
								<input
									type="password"
									placeholder="WiFi password"
									value={wifiPass}
									onChange={(e) => setWifiPass(e.target.value)}
									className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1 text-xs text-(--app-text) outline-none"
								/>
							</div>
							<button
								type="button"
								className="w-full px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded"
								onClick={saveWifi}
							>
								Save WiFi
							</button>
							{device.ssid && (
								<p className="text-[9px] text-emerald-400">
									Broadcasting: <span className="font-mono">{device.ssid}</span>
								</p>
							)}
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

/* ── Inline SVG icons ── */

function NetIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<circle cx="12" cy="12" r="10" />
			<path d="M2 12h20" />
			<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
		</svg>
	)
}

function DhcpIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<rect x="2" y="3" width="20" height="18" rx="2" />
			<path d="M8 7v10" />
			<path d="M12 7v10" />
			<path d="M16 7v10" />
			<path d="M8 12h8" />
		</svg>
	)
}

function NatIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d="M4 12h16" />
			<path d="M16 6l6 6-6 6" />
			<path d="M8 18l-6-6 6-6" />
		</svg>
	)
}

function WifiIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d="M5 12.55a11 11 0 0 1 14.08 0" />
			<path d="M1.42 9a16 16 0 0 1 21.16 0" />
			<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
			<circle cx="12" cy="20" r="1" fill="currentColor" />
		</svg>
	)
}

function TrashIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d="M3 6h18" />
			<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
			<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
		</svg>
	)
}
