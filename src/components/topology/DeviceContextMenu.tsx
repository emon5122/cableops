import {
	DEVICE_CAPABILITIES,
	type DeviceRow,
	type DeviceType,
	type InterfaceRow,
	type RouteRow,
	SPEED_OPTIONS,
} from "@/lib/topology-types";
import { useCallback, useEffect, useRef, useState } from "react";

interface DeviceContextMenuProps {
	x: number;
	y: number;
	device: DeviceRow;
	portConfigs: InterfaceRow[];
	routes?: RouteRow[];
	onClose: () => void;
	onUpdateDevice: (
		id: string,
		fields: {
			ipForwarding?: boolean;
			maxSpeed?: string | null;
		},
	) => void;
	onUpdatePortConfig: (config: {
		deviceId: string;
		portNumber: number;
		ipAddress?: string | null;
		gateway?: string | null;
	}) => void;
	onDeleteDevice: (id: string) => void;
	onUpsertRoute?: (params: {
		id?: string;
		deviceId: string;
		destination: string;
		nextHop: string;
		interfacePort?: number | null;
		metric?: number;
	}) => void;
	onDeleteRoute?: (id: string) => void;
	onSimulateReachability?: (deviceId: string) => void;
}

export default function DeviceContextMenu({
	x,
	y,
	device,
	portConfigs,
	routes = [],
	onClose,
	onUpdateDevice,
	onUpdatePortConfig,
	onDeleteDevice,
	onUpsertRoute,
	onDeleteRoute,
	onSimulateReachability,
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

	// Only sync when the management interface record changes identity, not on every refetch
	const mgmtIfaceId = mgmtIface?.id ?? null;
	useEffect(() => {
		setMgmtIpValue(mgmtIface?.ipAddress ?? "");
		setMgmtGwValue(mgmtIface?.gateway ?? "");
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mgmtIfaceId]);

	const saveMgmtIp = useCallback(() => {
		onUpdatePortConfig({
			deviceId: device.id,
			portNumber: 0,
			ipAddress: mgmtIpValue.trim() || null,
			gateway: mgmtGwValue.trim() || null,
		});
		setShowMgmtPanel(false);
	}, [device.id, mgmtIpValue, mgmtGwValue, onUpdatePortConfig]);

	/* ── Routing table state ── */
	const [showRoutingPanel, setShowRoutingPanel] = useState(false);
	const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
	const [routeDest, setRouteDest] = useState("");
	const [routeNextHop, setRouteNextHop] = useState("");
	const [routeIfacePort, setRouteIfacePort] = useState("");
	const [routeMetric, setRouteMetric] = useState("100");

	const editRoute = useCallback(
		(route: RouteRow) => {
			setEditingRouteId(route.id);
			setRouteDest(route.destination);
			setRouteNextHop(route.nextHop);
			setRouteIfacePort(
				route.interfacePort != null ? String(route.interfacePort) : "",
			);
			setRouteMetric(String(route.metric ?? 100));
		},
		[],
	);

	const clearRouteForm = useCallback(() => {
		setEditingRouteId(null);
		setRouteDest("");
		setRouteNextHop("");
		setRouteIfacePort("");
		setRouteMetric("100");
	}, []);

	const saveRoute = useCallback(() => {
		if (!onUpsertRoute) return;
		if (!routeDest.trim() || !routeNextHop.trim()) return;
		onUpsertRoute({
			...(editingRouteId ? { id: editingRouteId } : {}),
			deviceId: device.id,
			destination: routeDest.trim(),
			nextHop: routeNextHop.trim(),
			interfacePort: routeIfacePort.trim()
				? Number(routeIfacePort.trim())
				: null,
			metric: Number(routeMetric) || 100,
		});
		clearRouteForm();
	}, [
		onUpsertRoute,
		editingRouteId,
		device.id,
		routeDest,
		routeNextHop,
		routeIfacePort,
		routeMetric,
		clearRouteForm,
	]);

	/* ── Max speed panel state ── */
	const [showSpeedPanel, setShowSpeedPanel] = useState(false);

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

					{/* ── Max Speed selector ── */}
					<div className="border-t border-(--app-border-light) my-1" />
					{!showSpeedPanel ? (
						<button
							type="button"
							className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
							onClick={() => setShowSpeedPanel(true)}
						>
							<span className="flex items-center gap-2">
								<SpeedIcon />
								Max Speed
							</span>
							<span className="text-[10px] text-(--app-text-muted) font-mono">
								{device.maxSpeed ?? "—"}
							</span>
						</button>
					) : (
						<div className="px-3 py-2 space-y-1">
							<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block">
								Max Link Speed
							</label>
							<div className="grid grid-cols-3 gap-1">
								{SPEED_OPTIONS.map((opt) => (
									<button
										key={opt}
										type="button"
										className={`px-1.5 py-1 text-[10px] rounded border ${
											device.maxSpeed === opt
												? "border-blue-500 bg-blue-500/20 text-blue-300"
												: "border-(--app-border-light) text-(--app-text-muted) hover:bg-(--app-surface-hover)"
										}`}
										onClick={() => {
											onUpdateDevice(device.id, { maxSpeed: opt });
											setShowSpeedPanel(false);
										}}
									>
										{opt}
									</button>
								))}
							</div>
							<div className="flex gap-1 mt-1">
								<button
									type="button"
									className="flex-1 px-2 py-1 bg-(--app-surface-hover) hover:bg-(--app-border-light) text-(--app-text-muted) text-xs rounded"
									onClick={() => {
										onUpdateDevice(device.id, { maxSpeed: null });
										setShowSpeedPanel(false);
									}}
								>
									Clear
								</button>
								<button
									type="button"
									className="px-2 py-1 bg-(--app-surface-hover) hover:bg-(--app-border-light) text-(--app-text-muted) text-xs rounded"
									onClick={() => setShowSpeedPanel(false)}
								>
									Cancel
								</button>
							</div>
						</div>
					)}

					{/* ── Routing Table ── */}
					{showIpForwarding && onUpsertRoute && onDeleteRoute && (
						<>
							<div className="border-t border-(--app-border-light) my-1" />
							{!showRoutingPanel ? (
								<button
									type="button"
									className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
									onClick={() => setShowRoutingPanel(true)}
								>
									<span className="flex items-center gap-2">
										<RouteIcon />
										Routing Table
									</span>
									<span className="text-[10px] text-(--app-text-muted)">
										{routes.length} route{routes.length !== 1 ? "s" : ""}
									</span>
								</button>
							) : (
								<div className="px-3 py-2 space-y-2 max-h-80 overflow-y-auto">
									<div className="flex items-center justify-between">
										<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider">
											Static Routes
										</label>
										<button
											type="button"
											className="text-[9px] text-(--app-text-muted) hover:text-(--app-text)"
											onClick={() => setShowRoutingPanel(false)}
										>
											Collapse
										</button>
									</div>

									{!device.ipForwarding && (
										<div className="text-[10px] text-amber-400 bg-amber-400/10 rounded px-2 py-1">
											IP forwarding is disabled — routes won't be used until forwarding is enabled.
										</div>
									)}

									{/* Existing routes */}
									{routes.length > 0 ? (
										<div className="space-y-1">
											{routes.map((r) => (
												<div
													key={r.id}
													className="flex items-center gap-1 bg-(--app-surface) rounded px-2 py-1 text-[10px] font-mono"
												>
													<div className="flex-1 min-w-0 truncate text-(--app-text)">
														<span className="text-(--app-text-dim)">dst:</span>{" "}
														{r.destination}
													</div>
													<div className="flex-1 min-w-0 truncate text-(--app-text)">
														<span className="text-(--app-text-dim)">via:</span>{" "}
														{r.nextHop}
													</div>
													{r.interfacePort != null && (
														<span className="text-(--app-text-muted)">
															P{r.interfacePort}
														</span>
													)}
													<span className="text-(--app-text-muted)">
														m:{r.metric}
													</span>
													<button
														type="button"
														className="text-blue-400 hover:text-blue-300 px-1"
														onClick={() => editRoute(r)}
														title="Edit"
													>
														✎
													</button>
													<button
														type="button"
														className="text-red-400 hover:text-red-300 px-1"
														onClick={() => onDeleteRoute(r.id)}
														title="Delete"
													>
														×
													</button>
												</div>
											))}
										</div>
									) : (
										<p className="text-[10px] text-(--app-text-dim) italic">
											No static routes configured. Add one below.
										</p>
									)}

									{/* Add / edit route form */}
									<div className="space-y-1 pt-1 border-t border-(--app-border-light)">
										<p className="text-[9px] text-(--app-text-dim)">
											{editingRouteId ? "Edit route" : "Add route"}
										</p>
										<input
											type="text"
											placeholder="Destination (CIDR) e.g. 0.0.0.0/0"
											value={routeDest}
											onChange={(e) => setRouteDest(e.target.value)}
											className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1 text-[11px] text-(--app-text) font-mono outline-none"
										/>
										<input
											type="text"
											placeholder="Next Hop e.g. 192.168.1.1"
											value={routeNextHop}
											onChange={(e) => setRouteNextHop(e.target.value)}
											className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1 text-[11px] text-(--app-text) font-mono outline-none"
										/>
										<div className="flex gap-1">
											<input
												type="text"
												placeholder="Port (opt)"
												value={routeIfacePort}
												onChange={(e) => setRouteIfacePort(e.target.value)}
												className="w-16 bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1 text-[11px] text-(--app-text) font-mono outline-none"
											/>
											<input
												type="text"
												placeholder="Metric"
												value={routeMetric}
												onChange={(e) => setRouteMetric(e.target.value)}
												className="w-16 bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1 text-[11px] text-(--app-text) font-mono outline-none"
											/>
										</div>
										<div className="flex gap-1">
											<button
												type="button"
												className="flex-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded disabled:opacity-40"
												disabled={!routeDest.trim() || !routeNextHop.trim()}
												onClick={saveRoute}
											>
												{editingRouteId ? "Update" : "Add"}
											</button>
											{editingRouteId && (
												<button
													type="button"
													className="px-2 py-1 bg-(--app-surface-hover) hover:bg-(--app-border-light) text-(--app-text-muted) text-xs rounded"
													onClick={clearRouteForm}
												>
													Cancel
												</button>
											)}
										</div>
									</div>
								</div>
							)}
						</>
					)}

					{/* Simulate Reachability */}
					{onSimulateReachability && (
						<>
							<div className="border-t border-(--app-border-light) my-1" />
							<button
								type="button"
								className="w-full px-3 py-1.5 text-left text-cyan-400 hover:bg-cyan-400/10 flex items-center gap-2"
								onClick={() => {
									onSimulateReachability(device.id);
									onClose();
								}}
							>
								<ReachabilityIcon />
								Simulate Reachability
							</button>
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

function ReachabilityIcon() {
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
			<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
			<path d="M2 12h20" />
			<path d="M12 2v20" />
		</svg>
	);
}

function SpeedIcon() {
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
			<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
		</svg>
	);
}

function RouteIcon() {
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
			<path d="M3 17h2l3-6 4 8 3-10 2 8h4" />
		</svg>
	);
}
