import {
	DEVICE_CAPABILITIES,
	type DeviceRow,
	type DeviceType,
	type InterfaceRow,
} from "@/lib/topology-types";
import { useCallback, useEffect, useRef, useState } from "react";

interface DeviceContextMenuProps {
	x: number;
	y: number;
	device: DeviceRow;
	portConfigs: InterfaceRow[];
	onClose: () => void;
	onUpdateDevice: (
		id: string,
		fields: {
			ipForwarding?: boolean;
		},
	) => void;
	onUpdatePortConfig: (config: {
		deviceId: string;
		portNumber: number;
		ipAddress?: string | null;
		gateway?: string | null;
	}) => void;
	onDeleteDevice: (id: string) => void;
}

export default function DeviceContextMenu({
	x,
	y,
	device,
	portConfigs,
	onClose,
	onUpdateDevice,
	onUpdatePortConfig,
	onDeleteDevice,
}: DeviceContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const caps =
		DEVICE_CAPABILITIES[device.deviceType as DeviceType] ??
		DEVICE_CAPABILITIES.pc;

	/* ── Management IP state (port 0 interface) ── */
	const mgmtIface = portConfigs.find(
		(pc) => pc.deviceId === device.id && pc.portNumber === 0,
	);
	const [mgmtIpValue, setMgmtIpValue] = useState(mgmtIface?.ipAddress ?? "");
	const [mgmtGwValue, setMgmtGwValue] = useState(mgmtIface?.gateway ?? "");
	const [showMgmtPanel, setShowMgmtPanel] = useState(false);

	// Sync state when portConfigs updates (e.g. from collaborator changes)
	useEffect(() => {
		setMgmtIpValue(mgmtIface?.ipAddress ?? "");
		setMgmtGwValue(mgmtIface?.gateway ?? "");
	}, [mgmtIface?.ipAddress, mgmtIface?.gateway]);

	const saveMgmtIp = useCallback(() => {
		onUpdatePortConfig({
			deviceId: device.id,
			portNumber: 0,
			ipAddress: mgmtIpValue.trim() || null,
			gateway: mgmtGwValue.trim() || null,
		});
		setShowMgmtPanel(false);
	}, [device.id, mgmtIpValue, mgmtGwValue, onUpdatePortConfig]);

	/* ── Click-away & escape ── */
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node))
				onClose();
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [onClose]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [onClose]);

	const layerLabel =
		caps.layer === 1
			? "L1"
			: caps.layer === 2
				? "L2"
				: caps.layer === 3
					? "L3"
					: caps.layer === "cloud"
						? "WAN"
						: "Endpoint";

	/* Show IP forwarding toggle for L3 devices and multi-homed endpoints */
	const showIpForwarding = caps.layer === 3 || caps.layer === "endpoint";

	return (
		<div
			ref={menuRef}
			style={{ position: "fixed", left: x, top: y, zIndex: 9999 }}
		>
			<div className="bg-(--app-menu-bg) border border-(--app-border-light) rounded-lg shadow-2xl text-sm min-w-56 overflow-hidden">
				{/* Header */}
				<div className="px-3 py-2 border-b border-(--app-border-light) bg-(--app-surface)">
					<div className="flex items-center gap-2">
						<div
							className="w-3 h-3 rounded-sm"
							style={{ backgroundColor: device.color }}
						/>
						<span className="text-(--app-text) font-semibold text-xs truncate flex-1">
							{device.name}
						</span>
						<span className="text-[9px] px-1.5 py-0.5 rounded bg-(--app-surface-alt) text-(--app-text-dim) font-mono">
							{layerLabel}
						</span>
					</div>
					<p className="text-[9px] text-(--app-text-dim) mt-0.5">
						Right-click a port to configure IP, DHCP, WiFi, NAT
					</p>
				</div>

				{/* Menu items */}
				<div className="py-1">
					{/* IP Forwarding toggle */}
					{showIpForwarding && (
						<div className="px-3 py-1.5">
							<button
								type="button"
								className="w-full text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between rounded px-1 py-1"
								onClick={() =>
									onUpdateDevice(device.id, {
										ipForwarding: !device.ipForwarding,
									})
								}
							>
								<span className="flex items-center gap-2">
									<ForwardIcon />
									IP Forwarding
								</span>
								<span
									className={`text-[10px] ${device.ipForwarding ? "text-emerald-400" : "text-(--app-text-muted)"}`}
								>
									{device.ipForwarding ? "Enabled" : "Disabled"}
								</span>
							</button>
							<p className="text-[9px] text-(--app-text-dim) mt-0.5 pl-6">
								Forwards packets between interfaces (required for routing).
							</p>
						</div>
					)}

					{/* Per-port config hint */}
					{caps.perPortIp && (
						<div className="px-3 py-1.5 text-[10px] text-(--app-text-dim) italic flex items-center gap-2">
							<NetIcon />
							<span>
								Right-click each port to set IPs, DHCP, WiFi &amp; NAT
							</span>
						</div>
					)}

					{/* Management IP — for L2 devices (switches, APs, modems) */}
					{caps.managementIp && !showMgmtPanel && (
						<>
							<div className="border-t border-(--app-border-light) my-1" />
							<button
								type="button"
								className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
								onClick={() => setShowMgmtPanel(true)}
							>
								<span className="flex items-center gap-2">
									<MgmtIpIcon />
									Management IP
								</span>
								<span className="text-[10px] text-(--app-text-muted) font-mono truncate max-w-24">
									{mgmtIface?.ipAddress ?? "—"}
								</span>
							</button>
							{mgmtIface?.ipAddress && (
								<div className="px-3 py-0.5 text-[9px] text-emerald-400 font-mono pl-9">
									{mgmtIface.ipAddress}
									{mgmtIface.gateway ? ` → GW ${mgmtIface.gateway}` : ""}
								</div>
							)}
						</>
					)}

					{/* Management IP edit panel */}
					{caps.managementIp && showMgmtPanel && (
						<>
							<div className="border-t border-(--app-border-light) my-1" />
							<div className="px-3 py-2 space-y-2">
								<div className="text-[10px] text-cyan-400 bg-cyan-400/10 rounded px-2 py-1">
									Management IP for remote access to this {device.deviceType === "switch" ? "switch" : device.deviceType === "access-point" ? "AP" : "device"}. Not a routed interface.
								</div>
								<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block">
									Management IP (CIDR)
								</label>
								<input
									type="text"
									placeholder="e.g. 192.168.1.2/24"
									value={mgmtIpValue}
									onChange={(e) => setMgmtIpValue(e.target.value)}
									className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1.5 text-xs text-(--app-text) font-mono outline-none"
									onKeyDown={(e) => {
										if (e.key === "Enter") saveMgmtIp();
									}}
								/>
								<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block">
									Default Gateway
								</label>
								<input
									type="text"
									placeholder="e.g. 192.168.1.1"
									value={mgmtGwValue}
									onChange={(e) => setMgmtGwValue(e.target.value)}
									className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1.5 text-xs text-(--app-text) font-mono outline-none"
									onKeyDown={(e) => {
										if (e.key === "Enter") saveMgmtIp();
									}}
								/>
								<div className="flex gap-1">
									<button
										type="button"
										className="flex-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded"
										onClick={saveMgmtIp}
									>
										Save
									</button>
									<button
										type="button"
										className="px-2 py-1 bg-(--app-surface-hover) hover:bg-(--app-border-light) text-(--app-text-muted) text-xs rounded"
										onClick={() => {
											setMgmtIpValue("");
											setMgmtGwValue("");
											onUpdatePortConfig({
												deviceId: device.id,
												portNumber: 0,
												ipAddress: null,
												gateway: null,
											});
											setShowMgmtPanel(false);
										}}
									>
										Clear
									</button>
									<button
										type="button"
										className="px-2 py-1 bg-(--app-surface-hover) hover:bg-(--app-border-light) text-(--app-text-muted) text-xs rounded"
										onClick={() => setShowMgmtPanel(false)}
									>
										Cancel
									</button>
								</div>
							</div>
						</>
					)}

					{/* Delete */}
					<div className="border-t border-(--app-border-light) my-1" />
					<button
						type="button"
						className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-400/10 flex items-center gap-2"
						onClick={() => {
							onDeleteDevice(device.id);
							onClose();
						}}
					>
						<TrashIcon />
						Delete Device
					</button>
				</div>
			</div>
		</div>
	);
}

/* ── Inline SVG icons ── */

function NetIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<circle cx="12" cy="12" r="10" />
			<path d="M2 12h20" />
			<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
		</svg>
	);
}

function ForwardIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M4 12h16" />
			<path d="M16 6l6 6-6 6" />
			<path d="M8 18l-6-6 6-6" />
		</svg>
	);
}

function TrashIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M3 6h18" />
			<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
			<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
		</svg>
	);
}

function MgmtIpIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<rect x="2" y="3" width="20" height="14" rx="2" />
			<path d="M8 21h8" />
			<path d="M12 17v4" />
			<circle cx="12" cy="10" r="3" />
			<path d="M12 7v-1" />
			<path d="M12 14v-1" />
		</svg>
	);
}
