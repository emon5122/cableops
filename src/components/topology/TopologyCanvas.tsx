import DeviceContextMenu from "@/components/topology/DeviceContextMenu";
import DeviceIcon from "@/components/topology/DeviceIcon";
import PortContextMenu from "@/components/topology/PortContextMenu";
import {
	type AnnotationRow,
	type ConnectionRow,
	DEVICE_CAPABILITIES,
	DEVICE_NODE_WIDTH,
	type DeviceRow,
	type DeviceType,
	type DragState,
	getDeviceNodeHeight,
	getPortDisplayColor,
	getPortPosition,
	INFO_STRIP_HEIGHT,
	type InterfaceRow,
	isPortConnected,
	luminance,
	PORT_SIZE,
	type PortSelection,
} from "@/lib/topology-types";
import { useCallback, useMemo, useRef, useState } from "react";

interface ContextMenuState {
	deviceId: string;
	portNumber: number;
	x: number;
	y: number;
}

interface TopologyCanvasProps {
	devices: DeviceRow[];
	connections: ConnectionRow[];
	portConfigs: InterfaceRow[];
	annotations: AnnotationRow[];
	selectedPort: PortSelection | null;
	onPortClick: (deviceId: string, portNumber: number) => void;
	onDeviceMove: (deviceId: string, x: number, y: number) => void;
	onDeviceSelect: (deviceId: string | null) => void;
	selectedDeviceId: string | null;
	onUpdatePortConfig: (config: {
		deviceId: string;
		portNumber: number;
		alias?: string | null;
		speed?: string | null;
		vlan?: number | null;
		reserved?: boolean;
		reservedLabel?: string | null;
		portRole?: string | null;
		ipAddress?: string | null;
		macAddress?: string | null;
		portMode?: string | null;
		dhcpEnabled?: boolean;
		dhcpRangeStart?: string | null;
		dhcpRangeEnd?: string | null;
		ssid?: string | null;
		wifiPassword?: string | null;
		natEnabled?: boolean;
		gateway?: string | null;
	}) => void;
	onDisconnect: (connectionId: string) => void;
	onUpdateDevice: (
		id: string,
		fields: {
			ipForwarding?: boolean;
		},
	) => void;
	onDeleteDevice: (id: string) => void;
	onAddAnnotation: (ann: {
		x: number;
		y: number;
		kind: "rect" | "label";
		label?: string;
	}) => void;
	onUpdateAnnotation: (
		id: string,
		fields: {
			x?: number;
			y?: number;
			width?: number;
			height?: number;
			label?: string | null;
			color?: string;
		},
	) => void;
	onDeleteAnnotation: (id: string) => void;
}

export default function TopologyCanvas({
	devices,
	connections,
	portConfigs,
	annotations,
	selectedPort,
	onPortClick,
	onDeviceMove,
	onDeviceSelect,
	selectedDeviceId,
	onUpdatePortConfig,
	onDisconnect,
	onUpdateDevice,
	onDeleteDevice,
	onAddAnnotation,
	onUpdateAnnotation,
	onDeleteAnnotation,
}: TopologyCanvasProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [drag, setDrag] = useState<DragState>({
		isDragging: false,
		deviceId: null,
		startMouseX: 0,
		startMouseY: 0,
		startDeviceX: 0,
		startDeviceY: 0,
	});
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
	const [deviceMenu, setDeviceMenu] = useState<{
		deviceId: string;
		x: number;
		y: number;
	} | null>(null);

	/* ── Annotation drag / resize ── */
	const [annDrag, setAnnDrag] = useState<{
		isDragging: boolean;
		annId: string | null;
		startMouseX: number;
		startMouseY: number;
		startX: number;
		startY: number;
	}>({
		isDragging: false,
		annId: null,
		startMouseX: 0,
		startMouseY: 0,
		startX: 0,
		startY: 0,
	});

	const [annResize, setAnnResize] = useState<{
		isResizing: boolean;
		annId: string | null;
		startMouseX: number;
		startMouseY: number;
		startW: number;
		startH: number;
	}>({
		isResizing: false,
		annId: null,
		startMouseX: 0,
		startMouseY: 0,
		startW: 0,
		startH: 0,
	});

	const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(
		null,
	);
	const [editingAnnLabel, setEditingAnnLabel] = useState<string | null>(null);
	const [annLabelValue, setAnnLabelValue] = useState("");
	const [selectedWire, setSelectedWire] = useState<string | null>(null);

	/* ── Live position (optimistic while dragging) ── */
	const [livePositions, setLivePositions] = useState<
		Record<string, { x: number; y: number }>
	>({});

	/* live annotation positions while dragging */
	const [liveAnnPositions, setLiveAnnPositions] = useState<
		Record<string, { x: number; y: number }>
	>({});
	const [liveAnnSizes, setLiveAnnSizes] = useState<
		Record<string, { w: number; h: number }>
	>({});

	const getDevicePos = useCallback(
		(device: DeviceRow) => {
			const live = livePositions[device.id];
			return live ?? { x: device.positionX, y: device.positionY };
		},
		[livePositions],
	);

	/* ── Drag handlers ── */
	const handleMouseDown = useCallback(
		(e: React.MouseEvent, device: DeviceRow) => {
			if (e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			const pos = getDevicePos(device);
			setDrag({
				isDragging: true,
				deviceId: device.id,
				startMouseX: e.clientX,
				startMouseY: e.clientY,
				startDeviceX: pos.x,
				startDeviceY: pos.y,
			});
			onDeviceSelect(device.id);
		},
		[getDevicePos, onDeviceSelect],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (drag.isDragging && drag.deviceId) {
				const dx = e.clientX - drag.startMouseX;
				const dy = e.clientY - drag.startMouseY;
				setLivePositions((prev) => ({
					...prev,
					[drag.deviceId as string]: {
						x: Math.max(0, drag.startDeviceX + dx),
						y: Math.max(0, drag.startDeviceY + dy),
					},
				}));
				return;
			}
			if (annDrag.isDragging && annDrag.annId) {
				const dx = e.clientX - annDrag.startMouseX;
				const dy = e.clientY - annDrag.startMouseY;
				setLiveAnnPositions((prev) => ({
					...prev,
					[annDrag.annId as string]: {
						x: Math.max(0, annDrag.startX + dx),
						y: Math.max(0, annDrag.startY + dy),
					},
				}));
				return;
			}
			if (annResize.isResizing && annResize.annId) {
				const dx = e.clientX - annResize.startMouseX;
				const dy = e.clientY - annResize.startMouseY;
				setLiveAnnSizes((prev) => ({
					...prev,
					[annResize.annId as string]: {
						w: Math.max(40, annResize.startW + dx),
						h: Math.max(30, annResize.startH + dy),
					},
				}));
			}
		},
		[drag, annDrag, annResize],
	);

	const handleMouseUp = useCallback(() => {
		if (drag.isDragging && drag.deviceId) {
			const pos = livePositions[drag.deviceId];
			if (pos) {
				onDeviceMove(drag.deviceId, Math.round(pos.x), Math.round(pos.y));
			}
		}
		if (annDrag.isDragging && annDrag.annId) {
			const pos = liveAnnPositions[annDrag.annId];
			if (pos) {
				onUpdateAnnotation(annDrag.annId, {
					x: Math.round(pos.x),
					y: Math.round(pos.y),
				});
			}
		}
		if (annResize.isResizing && annResize.annId) {
			const sz = liveAnnSizes[annResize.annId];
			if (sz) {
				onUpdateAnnotation(annResize.annId, {
					width: Math.round(sz.w),
					height: Math.round(sz.h),
				});
			}
		}
		setDrag({
			isDragging: false,
			deviceId: null,
			startMouseX: 0,
			startMouseY: 0,
			startDeviceX: 0,
			startDeviceY: 0,
		});
		setAnnDrag({
			isDragging: false,
			annId: null,
			startMouseX: 0,
			startMouseY: 0,
			startX: 0,
			startY: 0,
		});
		setAnnResize({
			isResizing: false,
			annId: null,
			startMouseX: 0,
			startMouseY: 0,
			startW: 0,
			startH: 0,
		});
	}, [
		drag,
		livePositions,
		onDeviceMove,
		annDrag,
		liveAnnPositions,
		annResize,
		liveAnnSizes,
		onUpdateAnnotation,
	]);

	const handleCanvasClick = useCallback(
		(e: React.MouseEvent) => {
			if (e.target === containerRef.current || e.target === e.currentTarget) {
				onDeviceSelect(null);
				setContextMenu(null);
				setDeviceMenu(null);
				setSelectedAnnotation(null);
				setCanvasMenu(null);
				setSelectedWire(null);
			}
		},
		[onDeviceSelect],
	);

	/* ── Canvas context menu (right-click to add annotation) ── */
	const [canvasMenu, setCanvasMenu] = useState<{
		x: number;
		y: number;
		canvasX: number;
		canvasY: number;
	} | null>(null);

	const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
		/* Only show when right-clicking the canvas background */
		if (e.target !== containerRef.current && e.target !== e.currentTarget)
			return;
		e.preventDefault();
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return;
		setCanvasMenu({
			x: e.clientX,
			y: e.clientY,
			canvasX: e.clientX - rect.left + (containerRef.current?.scrollLeft ?? 0),
			canvasY: e.clientY - rect.top + (containerRef.current?.scrollTop ?? 0),
		});
	}, []);

	/* Helpers for annotation positions */
	const getAnnPos = useCallback(
		(ann: AnnotationRow) => {
			const live = liveAnnPositions[ann.id];
			return live ?? { x: ann.x, y: ann.y };
		},
		[liveAnnPositions],
	);
	const getAnnSize = useCallback(
		(ann: AnnotationRow) => {
			const live = liveAnnSizes[ann.id];
			return live ?? { w: ann.width, h: ann.height };
		},
		[liveAnnSizes],
	);

	/* ── Port absolute position ── */
	const getAbsolutePortPos = useCallback(
		(deviceId: string, portNumber: number): { x: number; y: number } | null => {
			const device = devices.find((d) => d.id === deviceId);
			if (!device) return null;
			const pos = getDevicePos(device);
			/* Port 0 = virtual WiFi interface → center of device node */
			if (portNumber === 0) {
				const nodeH = getDeviceNodeHeight(device.portCount);
				return { x: pos.x + DEVICE_NODE_WIDTH / 2, y: pos.y + nodeH / 2 };
			}
			const portPos = getPortPosition(
				portNumber - 1,
				device.portCount,
				DEVICE_NODE_WIDTH,
			);
			return { x: pos.x + portPos.x, y: pos.y + portPos.y };
		},
		[devices, getDevicePos],
	);

	/**
	 * Smart bezier wire routing.
	 *
	 * Strategy: use cubic bezier curves that naturally separate wires.
	 * - Control points push the curve AWAY from the midline between devices
	 * - Each wire gets a unique offset (idx) so parallel wires spread out
	 * - Short connections use tighter curves, long ones use broader arcs
	 * - Wires between side-by-side devices curve downward
	 * - Wires between stacked devices curve sideways
	 */
	const buildWirePath = useCallback(
		(
			from: { x: number; y: number },
			to: { x: number; y: number },
			idx: number,
			_total: number,
		): string => {
			const dx = to.x - from.x;
			const dy = to.y - from.y;
			const dist = Math.sqrt(dx * dx + dy * dy);

			/* Spread multiplier per wire index to prevent overlap */
			const spread = (idx - _total / 2) * 18;

			if (dist < 10) {
				/* Extremely close ports — simple vertical drop + loop */
				return `M ${from.x} ${from.y} C ${from.x} ${from.y + 40 + Math.abs(spread)}, ${to.x} ${to.y + 40 + Math.abs(spread)}, ${to.x} ${to.y}`;
			}

			/* Base curvature proportional to distance */
			const curvature = Math.max(50, Math.min(dist * 0.35, 200));

			/* Determine predominant direction */
			const absDx = Math.abs(dx);
			const absDy = Math.abs(dy);

			if (absDx > absDy * 1.5) {
				/* Predominantly horizontal — curve downward */
				const bowY = curvature + Math.abs(spread);
				return [
					`M ${from.x} ${from.y}`,
					`C ${from.x} ${from.y + bowY},`,
					`${to.x} ${to.y + bowY},`,
					`${to.x} ${to.y}`,
				].join(" ");
			}

			if (absDy > absDx * 1.5) {
				/* Predominantly vertical — curve sideways */
				const bowX = (curvature + Math.abs(spread)) * (dx >= 0 ? 1 : -1);
				return [
					`M ${from.x} ${from.y}`,
					`C ${from.x + bowX} ${from.y},`,
					`${to.x + bowX} ${to.y},`,
					`${to.x} ${to.y}`,
				].join(" ");
			}

			/* Diagonal — S-curve routing */
			const midX = (from.x + to.x) / 2;
			const midY = (from.y + to.y) / 2;
			/* Perpendicular offset */
			const perpX = (-dy / dist) * (curvature * 0.4 + spread);
			const perpY = (dx / dist) * (curvature * 0.4 + spread);

			return [
				`M ${from.x} ${from.y}`,
				`C ${from.x} ${from.y + curvature * 0.5},`,
				`${midX + perpX} ${midY + perpY},`,
				`${to.x} ${to.y}`,
			].join(" ");
		},
		[],
	);

	/* ── Port config lookup ── */
	const getPortConfig = useCallback(
		(deviceId: string, portNumber: number): InterfaceRow | null => {
			return (
				portConfigs.find(
					(pc) => pc.deviceId === deviceId && pc.portNumber === portNumber,
				) ?? null
			);
		},
		[portConfigs],
	);

	const contextMenuDevice = contextMenu
		? (devices.find((d) => d.id === contextMenu.deviceId) ?? null)
		: null;

	/* ── Per-device info for canvas display ── */
	const deviceInfoMap = useMemo(() => {
		const map = new Map<
			string,
			{ ip: string | null; badges: { label: string; color: string }[] }
		>();
		for (const device of devices) {
			/* badges aggregated from all interfaces */
			const badges: { label: string; color: string }[] = [];

			/* Find first IP from any interface of this device */
			const deviceIfaces = portConfigs.filter(
				(pc) => pc.deviceId === device.id,
			);
			const firstIp =
				deviceIfaces.find((pc) => pc.ipAddress)?.ipAddress ?? null;

			/* Aggregate badges from all interfaces */
			const hasDhcp = deviceIfaces.some((pc) => pc.dhcpEnabled);
			const hasNat = deviceIfaces.some((pc) => pc.natEnabled);
			const ssid = deviceIfaces.find((pc) => pc.ssid)?.ssid;
			const gw = deviceIfaces.find((pc) => pc.gateway)?.gateway;

			if (hasDhcp) badges.push({ label: "DHCP", color: "#06b6d4" });
			if (hasNat) badges.push({ label: "NAT", color: "#f59e0b" });
			if (ssid) badges.push({ label: ssid, color: "#38bdf8" });
			if (gw) badges.push({ label: `GW ${gw}`, color: "#a78bfa" });

			map.set(device.id, { ip: firstIp, badges });
		}
		return map;
	}, [devices, portConfigs]);

	/* Canvas extent */
	const canvasExtent = useMemo(() => {
		let maxX = 800;
		let maxY = 600;
		for (const device of devices) {
			const pos = getDevicePos(device);
			const h = getDeviceNodeHeight(device.portCount);
			maxX = Math.max(maxX, pos.x + DEVICE_NODE_WIDTH + 200);
			maxY = Math.max(maxY, pos.y + h + 200);
		}
		for (const ann of annotations) {
			const pos = getAnnPos(ann);
			const sz = getAnnSize(ann);
			maxX = Math.max(maxX, pos.x + sz.w + 200);
			maxY = Math.max(maxY, pos.y + sz.h + 200);
		}
		return { width: maxX, height: maxY };
	}, [devices, getDevicePos, annotations, getAnnPos, getAnnSize]);

	return (
		<div
			ref={containerRef}
			className="relative w-full h-full min-h-150 overflow-auto"
			style={{
				background: "var(--app-bg)",
				backgroundImage:
					"radial-gradient(circle, var(--app-canvas-dot) 1px, transparent 1px)",
				backgroundSize: "24px 24px",
			}}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseUp}
			onClick={handleCanvasClick}
			onContextMenu={handleCanvasContextMenu}
		>
			{/* Annotation shapes — z-index 5 (BELOW devices) */}
			{annotations.map((ann) => {
				const pos = getAnnPos(ann);
				const sz = getAnnSize(ann);
				const isSel = selectedAnnotation === ann.id;
				const isEditing = editingAnnLabel === ann.id;

				return (
					<div
						key={ann.id}
						className={`absolute group ${isSel ? "ring-2 ring-blue-400" : ""}`}
						style={{
							left: pos.x,
							top: pos.y,
							width: sz.w,
							height: sz.h,
							zIndex: 5,
							border: `2px dashed ${ann.color}88`,
							borderRadius: 6,
							backgroundColor: `${ann.color}15`,
						}}
						onMouseDown={(e) => {
							if (e.button !== 0) return;
							e.preventDefault();
							e.stopPropagation();
							setSelectedAnnotation(ann.id);
							setAnnDrag({
								isDragging: true,
								annId: ann.id,
								startMouseX: e.clientX,
								startMouseY: e.clientY,
								startX: pos.x,
								startY: pos.y,
							});
						}}
						onDoubleClick={(e) => {
							e.stopPropagation();
							setEditingAnnLabel(ann.id);
							setAnnLabelValue(ann.label ?? "");
						}}
					>
						{/* Label */}
						{isEditing ? (
							<input
								className="absolute top-1 left-1 bg-black/80 text-white text-[11px] px-1.5 py-0.5 rounded border border-white/20 outline-none"
								value={annLabelValue}
								onChange={(e) => setAnnLabelValue(e.target.value)}
								onBlur={() => {
									onUpdateAnnotation(ann.id, { label: annLabelValue || null });
									setEditingAnnLabel(null);
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										onUpdateAnnotation(ann.id, {
											label: annLabelValue || null,
										});
										setEditingAnnLabel(null);
									}
									if (e.key === "Escape") setEditingAnnLabel(null);
								}}
								onClick={(e) => e.stopPropagation()}
							/>
						) : (
							ann.label && (
								<span
									className="absolute top-1 left-2 text-[11px] font-semibold select-none pointer-events-none"
									style={{ color: ann.color }}
								>
									{ann.label}
								</span>
							)
						)}

						{/* Delete button (visible on select or hover) */}
						<button
							type="button"
							className={`absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center hover:bg-red-500 transition-opacity ${
								isSel ? "opacity-100" : "opacity-0 group-hover:opacity-60"
							}`}
							style={{ zIndex: 6 }}
							onMouseDown={(e) => e.stopPropagation()}
							onClick={(e) => {
								e.stopPropagation();
								onDeleteAnnotation(ann.id);
								setSelectedAnnotation(null);
							}}
						>
							✕
						</button>

						{/* Resize handle (bottom-right) */}
						<div
							className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-se-resize"
							style={{ zIndex: 6 }}
							onMouseDown={(e) => {
								if (e.button !== 0) return;
								e.preventDefault();
								e.stopPropagation();
								setSelectedAnnotation(ann.id);
								setAnnResize({
									isResizing: true,
									annId: ann.id,
									startMouseX: e.clientX,
									startMouseY: e.clientY,
									startW: sz.w,
									startH: sz.h,
								});
							}}
						>
							<svg
								viewBox="0 0 10 10"
								width="14"
								height="14"
								className="text-white/30 group-hover:text-white/60"
							>
								<path
									d="M 8 2 L 2 8 M 8 5 L 5 8 M 8 8 L 8 8"
									stroke="currentColor"
									strokeWidth="1"
									fill="none"
								/>
							</svg>
						</div>
					</div>
				);
			})}

			{/* Device nodes — z-index 10 */}
			{devices.map((device) => {
				const pos = getDevicePos(device);
				const nodeHeight = getDeviceNodeHeight(device.portCount);
				const isSelected = selectedDeviceId === device.id;
				const textColor = luminance(device.color) > 0.5 ? "#000" : "#fff";

				return (
					<div
						key={device.id}
						className="absolute select-none"
						style={{
							left: pos.x,
							top: pos.y,
							width: DEVICE_NODE_WIDTH,
							height: nodeHeight,
							zIndex: drag.deviceId === device.id ? 30 : 10,
						}}
					>
						<div
							className={`rounded-xl border-2 shadow-lg transition-shadow ${
								isSelected
									? "border-white/50 shadow-white/10"
									: "border-(--app-border) shadow-black/30"
							}`}
							style={{ background: "var(--app-surface)", height: "100%" }}
						>
							{/* Header — right-click opens device-level context menu */}
							<div
								className="px-3 py-2.5 rounded-t-[10px] cursor-grab active:cursor-grabbing flex items-center gap-2"
								style={{ backgroundColor: device.color }}
								onMouseDown={(e) => handleMouseDown(e, device)}
								onContextMenu={(e) => {
									e.preventDefault();
									e.stopPropagation();
									setDeviceMenu({
										deviceId: device.id,
										x: e.clientX,
										y: e.clientY,
									});
								}}
							>
								<DeviceIcon
									type={device.deviceType}
									color={textColor}
									size={18}
								/>
								<span
									className="font-bold text-sm truncate flex-1"
									style={{ color: textColor }}
								>
									{device.name}
								</span>
								{device.portCount > 0 ? (
									<span
										className="text-xs opacity-80 font-mono"
										style={{ color: textColor }}
									>
										{device.portCount}p
									</span>
								) : (
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke={textColor}
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										className="opacity-80"
									>
										<path d="M5 12.55a11 11 0 0 1 14.08 0" />
										<path d="M1.42 9a16 16 0 0 1 21.16 0" />
										<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
										<circle cx="12" cy="20" r="1" fill={textColor} />
									</svg>
								)}
							</div>

							{/* Info strip — IP, badges */}
							{(() => {
								const info = deviceInfoMap.get(device.id);
								const hasContent = info && (info.ip || info.badges.length > 0);
								return (
									<div
										className="px-2.5 flex items-center gap-1.5 overflow-hidden"
										style={{
											height: INFO_STRIP_HEIGHT,
											color: "var(--app-text-dim)",
											borderBottom: "1px solid var(--app-border)",
										}}
									>
										{hasContent ? (
											<>
												{info.ip && (
													<span
														className="text-[10px] font-mono truncate shrink-0"
														style={{ color: "var(--app-text-secondary)" }}
													>
														{info.ip}
													</span>
												)}
												<span className="flex-1" />
												{info.badges.map((b) => (
													<span
														key={b.label}
														className="text-[8px] font-semibold px-1 py-px rounded shrink-0 uppercase tracking-wide"
														style={{
															backgroundColor: `${b.color}18`,
															color: b.color,
														}}
													>
														{b.label}
													</span>
												))}
											</>
										) : (
											<span className="text-[10px] opacity-30 italic">
												No config
											</span>
										)}
									</div>
								);
							})()}

							{/* Port grid */}
							{device.portCount > 0 ? (
								<div className="p-2 flex flex-wrap gap-1 justify-center">
									{Array.from({ length: device.portCount }, (_, i) => {
										const pNum = i + 1;
										const connected = isPortConnected(
											device.id,
											pNum,
											connections,
										);
										const isSel =
											selectedPort?.deviceId === device.id &&
											selectedPort.portNumber === pNum;
										const portColor = getPortDisplayColor(
											device.id,
											pNum,
											connections,
											devices,
										);
										const portTextColor = connected
											? luminance(portColor) > 0.5
												? "#000"
												: "#fff"
											: "var(--app-port-empty)";
										const pc = getPortConfig(device.id, pNum);
										const hasConfig = !!(
											pc &&
											(pc.vlan || pc.speed || pc.alias)
										);
										const roleColor =
											pc?.portRole === "uplink"
												? "#fbbf24"
												: pc?.portRole === "downlink"
													? "#22d3ee"
													: null;

										return (
											<button
												key={pNum}
												type="button"
												className={`flex items-center justify-center rounded-md text-[10px] font-bold transition-all relative ${
													isSel
														? "ring-2 ring-white ring-offset-1 ring-offset-(--app-surface)"
														: ""
												} ${pc?.reserved ? "opacity-50" : ""}`}
												style={{
													width: PORT_SIZE,
													height: PORT_SIZE,
													backgroundColor: portColor,
													color: portTextColor,
													border: connected
														? `1px solid ${portColor}88`
														: "1px solid var(--app-port-border)",
												}}
												onClick={(e) => {
													e.stopPropagation();
													onPortClick(device.id, pNum);
												}}
												onContextMenu={(e) => {
													e.preventDefault();
													e.stopPropagation();
													setContextMenu({
														deviceId: device.id,
														portNumber: pNum,
														x: e.clientX,
														y: e.clientY,
													});
												}}
												title={`Port ${pNum}${pc?.alias ? ` (${pc.alias})` : ""}${pc?.vlan ? ` VLAN ${pc.vlan}` : ""}${pc?.speed ? ` ${pc.speed}` : ""}`}
											>
												{pNum}
												{hasConfig && (
													<div
														className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
														style={{
															backgroundColor: pc?.vlan ? "#06b6d4" : "#f59e0b",
														}}
													/>
												)}
												{roleColor && (
													<div
														className="absolute top-0 left-0 right-0 h-0.5 rounded-t-md"
														style={{ backgroundColor: roleColor }}
													/>
												)}
											</button>
										);
									})}
								</div>
							) : (
								<div
									className="p-3 flex items-center justify-center gap-1.5 text-xs"
									style={{ color: "var(--app-text-dim)" }}
								>
									<svg
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<path d="M5 12.55a11 11 0 0 1 14.08 0" />
										<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
										<circle cx="12" cy="20" r="1" fill="currentColor" />
									</svg>
									<span>WiFi</span>
								</div>
							)}
						</div>
					</div>
				);
			})}

			{/* SVG wires — z-index 20 */}
			<svg
				className="absolute inset-0"
				style={{
					width: canvasExtent.width,
					height: canvasExtent.height,
					minWidth: "100%",
					minHeight: "100%",
					zIndex: 20,
					pointerEvents: "none",
				}}
			>
				<defs>
					{connections.map((conn) => {
						const deviceA = devices.find((d) => d.id === conn.deviceAId);
						const deviceB = devices.find((d) => d.id === conn.deviceBId);
						if (!deviceA || !deviceB) return null;
						const posA = getAbsolutePortPos(conn.deviceAId, conn.portA);
						const posB = getAbsolutePortPos(conn.deviceBId, conn.portB);
						if (!posA || !posB) return null;
						/*
						 * Wire color exchange: at device A's port the wire
						 * shows device B's color and vice-versa, so the
						 * gradient goes B-color → A-color along the path.
						 */
						const isLTR = posA.x <= posB.x;
						return (
							<linearGradient
								key={`grad-${conn.id}`}
								id={`wire-grad-${conn.id}`}
								x1={isLTR ? "0%" : "100%"}
								y1="0%"
								x2={isLTR ? "100%" : "0%"}
								y2="0%"
							>
								<stop offset="0%" stopColor={deviceB.color} />
								<stop offset="100%" stopColor={deviceA.color} />
							</linearGradient>
						);
					})}
				</defs>

				{connections.map((conn, idx) => {
					const from = getAbsolutePortPos(conn.deviceAId, conn.portA);
					const to = getAbsolutePortPos(conn.deviceBId, conn.portB);
					if (!from || !to) return null;

					const path = buildWirePath(from, to, idx, connections.length);
					const isWireSel = selectedWire === conn.id;
					const midX = (from.x + to.x) / 2;
					const midY = (from.y + to.y) / 2;

					/* Determine if this is a WiFi connection */
					const devA = devices.find((d) => d.id === conn.deviceAId);
					const devB = devices.find((d) => d.id === conn.deviceBId);
					const capsA = devA
						? DEVICE_CAPABILITIES[devA.deviceType as DeviceType]
						: null;
					const capsB = devB
						? DEVICE_CAPABILITIES[devB.deviceType as DeviceType]
						: null;
					const isWifi =
						conn.connectionType === "wifi" ||
						(!conn.connectionType &&
							((capsA?.wifiHost && capsB?.wifiClient) ||
								(capsB?.wifiHost && capsA?.wifiClient)));

					return (
						<g key={conn.id}>
							{/* Invisible fat hit area for clicking */}
							<path
								d={path}
								stroke="transparent"
								strokeWidth={14}
								fill="none"
								style={{ pointerEvents: "stroke", cursor: "pointer" }}
								onClick={(e) => {
									e.stopPropagation();
									setSelectedWire(isWireSel ? null : conn.id);
								}}
							/>
							{/* Glow behind */}
							<path
								d={path}
								stroke={`url(#wire-grad-${conn.id})`}
								strokeWidth={isWireSel ? 8 : 5}
								fill="none"
								opacity={isWireSel ? 0.35 : 0.15}
								strokeLinecap="round"
								strokeDasharray={isWifi ? "8 6" : undefined}
								style={{ pointerEvents: "none" }}
							/>
							{/* Main wire */}
							<path
								d={path}
								stroke={isWireSel ? "#fff" : `url(#wire-grad-${conn.id})`}
								strokeWidth={isWireSel ? 3 : 2.5}
								fill="none"
								opacity={0.85}
								strokeLinecap="round"
								strokeDasharray={isWifi ? "8 6" : undefined}
								style={{ pointerEvents: "none" }}
							/>
							{/* WiFi indicator at midpoint */}
							{isWifi && !isWireSel && (
								<g
									transform={`translate(${midX},${midY})`}
									style={{ pointerEvents: "none" }}
								>
									<circle
										r={9}
										fill="var(--app-surface, #1e293b)"
										stroke="var(--app-border, #334155)"
										strokeWidth={1}
									/>
									<path
										d="M-4,-1a6 6 0 0 1 8 0"
										stroke="#38bdf8"
										strokeWidth={1.3}
										fill="none"
									/>
									<path
										d="M-2.5,1a3.5 3.5 0 0 1 5 0"
										stroke="#38bdf8"
										strokeWidth={1.3}
										fill="none"
									/>
									<circle cx={0} cy={3} r={1} fill="#38bdf8" />
								</g>
							)}
							{/* Speed label at midpoint */}
							{conn.speed && (
								<text
									x={midX}
									y={midY - 6}
									textAnchor="middle"
									fill="var(--app-text-muted)"
									fontSize="9"
									fontFamily="monospace"
									style={{ pointerEvents: "none" }}
								>
									{conn.speed}
								</text>
							)}
							{/* Delete button when selected */}
							{isWireSel && (
								<g
									style={{ cursor: "pointer", pointerEvents: "auto" }}
									onClick={(e) => {
										e.stopPropagation();
										onDisconnect(conn.id);
										setSelectedWire(null);
									}}
								>
									<circle
										cx={midX}
										cy={midY}
										r={12}
										fill="#dc2626"
										opacity={0.9}
									/>
									<text
										x={midX}
										y={midY + 1}
										textAnchor="middle"
										dominantBaseline="middle"
										fill="#fff"
										fontSize="13"
										fontWeight="bold"
										style={{ pointerEvents: "none" }}
									>
										✕
									</text>
								</g>
							)}
						</g>
					);
				})}

				{/* Pending port selection pulse */}
				{selectedPort &&
					(() => {
						const pos = getAbsolutePortPos(
							selectedPort.deviceId,
							selectedPort.portNumber,
						);
						if (!pos) return null;
						const r = PORT_SIZE / 2 + 4;
						return (
							<circle
								cx={pos.x}
								cy={pos.y}
								r={r}
								fill="none"
								stroke="#ffffff"
								strokeWidth={2}
								opacity={0.8}
							>
								<animate
									attributeName="r"
									values={`${r - 2};${r + 2};${r - 2}`}
									dur="1.5s"
									repeatCount="indefinite"
								/>
								<animate
									attributeName="opacity"
									values="0.8;0.3;0.8"
									dur="1.5s"
									repeatCount="indefinite"
								/>
							</circle>
						);
					})()}
			</svg>

			{/* Port context menu — z-index 100 */}
			{contextMenu && contextMenuDevice && (
				<PortContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					deviceId={contextMenu.deviceId}
					portNumber={contextMenu.portNumber}
					device={contextMenuDevice}
					connections={connections}
					devices={devices}
					portConfigs={portConfigs}
					portConfig={getPortConfig(
						contextMenu.deviceId,
						contextMenu.portNumber,
					)}
					onClose={() => setContextMenu(null)}
					onUpdatePortConfig={onUpdatePortConfig}
					onDisconnect={onDisconnect}
				/>
			)}

			{/* Device context menu — z-index 100 */}
			{deviceMenu &&
				(() => {
					const dev = devices.find((d) => d.id === deviceMenu.deviceId);
					if (!dev) return null;
					return (
						<DeviceContextMenu
							x={deviceMenu.x}
							y={deviceMenu.y}
							device={dev}
							onClose={() => setDeviceMenu(null)}
							onUpdateDevice={onUpdateDevice}
							onDeleteDevice={onDeleteDevice}
						/>
					);
				})()}

			{/* Canvas context menu (add annotation) — z-index 100 */}
			{canvasMenu && (
				<div
					className="fixed bg-(--app-menu-bg) border border-(--app-border-light) rounded-lg shadow-xl py-1 text-sm"
					style={{
						left: canvasMenu.x,
						top: canvasMenu.y,
						zIndex: 100,
						minWidth: 160,
					}}
				>
					<button
						type="button"
						className="w-full text-left px-3 py-1.5 text-(--app-text-muted) hover:bg-(--app-border) hover:text-white flex items-center gap-2"
						onClick={() => {
							onAddAnnotation({
								x: canvasMenu.canvasX,
								y: canvasMenu.canvasY,
								kind: "rect",
								label: "Room",
							});
							setCanvasMenu(null);
						}}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<rect x="3" y="3" width="18" height="18" rx="2" />
						</svg>
						Add Room / Area
					</button>
					<button
						type="button"
						className="w-full text-left px-3 py-1.5 text-(--app-text-muted) hover:bg-(--app-border) hover:text-white flex items-center gap-2"
						onClick={() => {
							onAddAnnotation({
								x: canvasMenu.canvasX,
								y: canvasMenu.canvasY,
								kind: "rect",
								label: "Wall",
							});
							setCanvasMenu(null);
						}}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<line x1="3" y1="12" x2="21" y2="12" />
							<line x1="3" y1="8" x2="21" y2="8" />
						</svg>
						Add Wall / Barrier
					</button>
					<button
						type="button"
						className="w-full text-left px-3 py-1.5 text-(--app-text-muted) hover:bg-(--app-border) hover:text-white flex items-center gap-2"
						onClick={() => {
							onAddAnnotation({
								x: canvasMenu.canvasX,
								y: canvasMenu.canvasY,
								kind: "rect",
							});
							setCanvasMenu(null);
						}}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<rect
								x="3"
								y="3"
								width="18"
								height="18"
								rx="2"
								strokeDasharray="4 2"
							/>
						</svg>
						Add Label
					</button>
					<div className="border-t border-(--app-border-light) my-1" />
					<button
						type="button"
						className="w-full text-left px-3 py-1.5 text-(--app-text-dim) hover:text-(--app-text-muted)"
						onClick={() => setCanvasMenu(null)}
					>
						Cancel
					</button>
				</div>
			)}

			{/* Empty state */}
			{devices.length === 0 && (
				<div
					className="absolute inset-0 flex items-center justify-center"
					style={{ zIndex: 5 }}
				>
					<div className="text-center text-(--app-text-muted)">
						<svg
							className="mx-auto mb-4 opacity-30"
							width="64"
							height="64"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
						>
							<rect x="2" y="6" width="20" height="12" rx="2" />
							<path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01" />
							<path d="M6 14h.01M10 14h.01M14 14h.01M18 14h.01" />
						</svg>
						<p className="text-lg font-semibold">No devices yet</p>
						<p className="text-sm mt-1">
							Add a device from the sidebar to get started
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
