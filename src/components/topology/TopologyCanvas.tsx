import DeviceContextMenu from "@/components/topology/DeviceContextMenu";
import DeviceIcon from "@/components/topology/DeviceIcon";
import PortContextMenu from "@/components/topology/PortContextMenu";
import {
	type AnnotationRow,
	type ConnectionRow,
	DEVICE_CAPABILITIES,
	DEVICE_NODE_WIDTH,
	DEVICE_TYPE_LABELS,
	type DeviceRow,
	type DeviceType,
	discoverAllSegments,
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
	sameSubnet,
} from "@/lib/topology-types";
import { motion } from "framer-motion";
import { toPng } from "html-to-image";
import {
	Download,
	Maximize,
	Minimize,
	Minus,
	Plus,
	RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

	/* ── Multi-selection (rubber-band + shift-click) ── */
	const [multiSelectedDevices, setMultiSelectedDevices] = useState<Set<string>>(new Set());
	const [multiSelectedAnnotations, setMultiSelectedAnnotations] = useState<Set<string>>(new Set());
	const [selectionRect, setSelectionRect] = useState<{
		active: boolean;
		startX: number;
		startY: number;
		currentX: number;
		currentY: number;
	} | null>(null);

	/* ── Zoom & fullscreen ── */
	const [zoom, setZoom] = useState(1);
	const zoomRef = useRef(1);
	const canvasInnerRef = useRef<HTMLDivElement>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);

	// Keep ref in sync
	useEffect(() => {
		zoomRef.current = zoom;
	}, [zoom]);

	const clampZoom = (z: number) => Math.min(3, Math.max(0.25, Math.round(z * 100) / 100));

	// Fullscreen change detection
	useEffect(() => {
		const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
		document.addEventListener("fullscreenchange", onFsChange);
		return () => document.removeEventListener("fullscreenchange", onFsChange);
	}, []);

	// Ctrl+A to select all devices & annotations
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "a") {
				// Only handle when our container (or child) is focused / active
				if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
				e.preventDefault();
				setMultiSelectedDevices(new Set(devices.map((d) => d.id)));
				setMultiSelectedAnnotations(new Set(annotations.map((a) => a.id)));
			}
			if (e.key === "Escape") {
				setMultiSelectedDevices(new Set());
				setMultiSelectedAnnotations(new Set());
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [devices, annotations]);

	const toggleFullscreen = useCallback(() => {
		if (!containerRef.current) return;
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			containerRef.current.requestFullscreen();
		}
	}, []);

	const handleSavePng = useCallback(() => {
		if (!canvasInnerRef.current) return;
		toPng(canvasInnerRef.current, {
			backgroundColor: "var(--app-bg)",
			pixelRatio: 2,
		}).then((dataUrl) => {
			const a = document.createElement("a");
			a.download = "topology.png";
			a.href = dataUrl;
			a.click();
		}).catch(() => {
			// silently fail
		});
	}, []);

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

	/* ── Drag handlers ── */
	/* Store starting positions for group-move */
	const groupDragStart = useRef<{
		devices: Record<string, { x: number; y: number }>;
		annotations: Record<string, { x: number; y: number }>;
	} | null>(null);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent, device: DeviceRow) => {
			if (e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			const pos = getDevicePos(device);

			// Shift-click or Cmd-click (Mac) toggles multi-selection
			if (e.shiftKey || e.metaKey) {
				setMultiSelectedDevices((prev) => {
					const next = new Set(prev);
					if (next.has(device.id)) next.delete(device.id);
					else next.add(device.id);
					return next;
				});
				return;
			}

			// If this device is part of multi-selection, start group drag
			const isInMulti = multiSelectedDevices.has(device.id);
			if (isInMulti && multiSelectedDevices.size > 1) {
				// Store all starting positions for the group
				const devStarts: Record<string, { x: number; y: number }> = {};
				for (const id of multiSelectedDevices) {
					const d = devices.find((dd) => dd.id === id);
					if (d) devStarts[id] = getDevicePos(d);
				}
				const annStarts: Record<string, { x: number; y: number }> = {};
				for (const id of multiSelectedAnnotations) {
					const a = annotations.find((aa) => aa.id === id);
					if (a) annStarts[id] = getAnnPos(a);
				}
				groupDragStart.current = { devices: devStarts, annotations: annStarts };
			} else {
				groupDragStart.current = null;
				setMultiSelectedDevices(new Set());
				setMultiSelectedAnnotations(new Set());
			}

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
		[getDevicePos, onDeviceSelect, multiSelectedDevices, multiSelectedAnnotations, devices, annotations, getAnnPos],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			// Rubber-band selection
			if (selectionRect?.active) {
				const rect = containerRef.current?.getBoundingClientRect();
				if (rect) {
					setSelectionRect((prev) =>
						prev
							? {
									...prev,
									currentX: (e.clientX - rect.left + (containerRef.current?.scrollLeft ?? 0)) / zoomRef.current,
									currentY: (e.clientY - rect.top + (containerRef.current?.scrollTop ?? 0)) / zoomRef.current,
								}
							: prev,
					);
				}
				return;
			}
			if (drag.isDragging && drag.deviceId) {
				const dx = (e.clientX - drag.startMouseX) / zoomRef.current;
				const dy = (e.clientY - drag.startMouseY) / zoomRef.current;

				// Group drag: move all selected items
				if (groupDragStart.current) {
					setLivePositions((prev) => {
						const next = { ...prev };
						for (const [id, start] of Object.entries(groupDragStart.current!.devices)) {
							next[id] = { x: Math.max(0, start.x + dx), y: Math.max(0, start.y + dy) };
						}
						return next;
					});
					setLiveAnnPositions((prev) => {
						const next = { ...prev };
						for (const [id, start] of Object.entries(groupDragStart.current!.annotations)) {
							next[id] = { x: Math.max(0, start.x + dx), y: Math.max(0, start.y + dy) };
						}
						return next;
					});
				} else {
					setLivePositions((prev) => ({
						...prev,
						[drag.deviceId as string]: {
							x: Math.max(0, drag.startDeviceX + dx),
							y: Math.max(0, drag.startDeviceY + dy),
						},
					}));
				}
				return;
			}
			if (annDrag.isDragging && annDrag.annId) {
				const dx = (e.clientX - annDrag.startMouseX) / zoomRef.current;
				const dy = (e.clientY - annDrag.startMouseY) / zoomRef.current;
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
				const dx = (e.clientX - annResize.startMouseX) / zoomRef.current;
				const dy = (e.clientY - annResize.startMouseY) / zoomRef.current;
				setLiveAnnSizes((prev) => ({
					...prev,
					[annResize.annId as string]: {
						w: Math.max(40, annResize.startW + dx),
						h: Math.max(30, annResize.startH + dy),
					},
				}));
			}
		},
		[drag, annDrag, annResize, selectionRect],
	);

	const handleMouseUp = useCallback(() => {
		// Rubber-band selection: compute which items fall within the rect
		if (selectionRect?.active) {
			const x1 = Math.min(selectionRect.startX, selectionRect.currentX);
			const y1 = Math.min(selectionRect.startY, selectionRect.currentY);
			const x2 = Math.max(selectionRect.startX, selectionRect.currentX);
			const y2 = Math.max(selectionRect.startY, selectionRect.currentY);

			// Only select if the rect is larger than a few pixels (avoid accidental clicks)
			if (Math.abs(x2 - x1) > 5 || Math.abs(y2 - y1) > 5) {
				const selDevices = new Set<string>();
				for (const device of devices) {
					const pos = getDevicePos(device);
					const nodeW = DEVICE_NODE_WIDTH;
					const nodeH = getDeviceNodeHeight(device.portCount);
					// Check overlap
					if (pos.x + nodeW > x1 && pos.x < x2 && pos.y + nodeH > y1 && pos.y < y2) {
						selDevices.add(device.id);
					}
				}
				const selAnns = new Set<string>();
				for (const ann of annotations) {
					const pos = getAnnPos(ann);
					const sz = getAnnSize(ann);
					if (pos.x + sz.w > x1 && pos.x < x2 && pos.y + sz.h > y1 && pos.y < y2) {
						selAnns.add(ann.id);
					}
				}
				setMultiSelectedDevices(selDevices);
				setMultiSelectedAnnotations(selAnns);
			}
			setSelectionRect(null);
			return;
		}

		if (drag.isDragging && drag.deviceId) {
			if (groupDragStart.current) {
				// Commit all group positions
				for (const id of Object.keys(groupDragStart.current.devices)) {
					const pos = livePositions[id];
					if (pos) onDeviceMove(id, Math.round(pos.x), Math.round(pos.y));
				}
				for (const id of Object.keys(groupDragStart.current.annotations)) {
					const pos = liveAnnPositions[id];
					if (pos) onUpdateAnnotation(id, { x: Math.round(pos.x), y: Math.round(pos.y) });
				}
				groupDragStart.current = null;
			} else {
				const pos = livePositions[drag.deviceId];
				if (pos) {
					onDeviceMove(drag.deviceId, Math.round(pos.x), Math.round(pos.y));
				}
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
		selectionRect,
		devices,
		getDevicePos,
		annotations,
		getAnnPos,
		getAnnSize,
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
			// Clear selection when clicking canvas background (container, inner div, or SVG overlay)
			const target = e.target as HTMLElement;
			if (
				target === containerRef.current ||
				target === canvasInnerRef.current ||
				target === e.currentTarget ||
				target.tagName === "svg"
			) {
				onDeviceSelect(null);
				setContextMenu(null);
				setDeviceMenu(null);
				setSelectedAnnotation(null);
				setCanvasMenu(null);
				setSelectedWire(null);
				setMultiSelectedDevices(new Set());
				setMultiSelectedAnnotations(new Set());
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
			canvasX: (e.clientX - rect.left + (containerRef.current?.scrollLeft ?? 0)) / zoomRef.current,
			canvasY: (e.clientY - rect.top + (containerRef.current?.scrollTop ?? 0)) / zoomRef.current,
		});
	}, []);

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

	const connectionLookup = useMemo(() => {
		const byPair = new Map<string, string[]>();
		for (const conn of connections) {
			const pair = [conn.deviceAId, conn.deviceBId].sort().join("|");
			const ids = byPair.get(pair) ?? [];
			ids.push(conn.id);
			byPair.set(pair, ids);
		}
		return byPair;
	}, [connections]);

	const { activeConnectionIds, connectionIssueById } = useMemo(() => {
		if (connections.length === 0) {
			return {
				activeConnectionIds: new Set<string>(),
				connectionIssueById: new Map<string, string>(),
			};
		}

		const segments = discoverAllSegments(devices, connections, portConfigs);
		const segmentPortSets = new Map<string, Set<string>>();
		const portToSegmentId = new Map<string, string>();
		for (const seg of segments) {
			const keySet = new Set<string>();
			for (const sp of seg.ports) {
				const key = `${sp.deviceId}:${sp.portNumber}`;
				keySet.add(key);
				portToSegmentId.set(key, seg.id);
			}
			segmentPortSets.set(seg.id, keySet);
		}

		const viableSegmentIds = new Set<string>();
		const segmentIssueById = new Map<string, string>();
		for (const seg of segments) {
			const ips = seg.ports
				.map((sp) =>
					portConfigs.find(
						(pc) => pc.deviceId === sp.deviceId && pc.portNumber === sp.portNumber,
					)?.ipAddress,
				)
				.filter((ip): ip is string => Boolean(ip));

			let hasSameSubnetPeers = false;
			for (let i = 0; i < ips.length && !hasSameSubnetPeers; i++) {
				for (let j = i + 1; j < ips.length; j++) {
					if (sameSubnet(ips[i]!, ips[j]!)) {
						hasSameSubnetPeers = true;
						break;
					}
				}
			}

			const hasDhcpServer = seg.ports.some((sp) => {
				const iface = portConfigs.find(
					(pc) => pc.deviceId === sp.deviceId && pc.portNumber === sp.portNumber,
				);
				return !!(
					iface?.dhcpEnabled &&
					iface.dhcpRangeStart &&
					iface.dhcpRangeEnd
				);
			});
			const hasIps = ips.length > 0;

			const isViable =
				!!(seg.gateway || hasSameSubnetPeers || (hasDhcpServer && seg.ports.length > 1));
			if (isViable) {
				viableSegmentIds.add(seg.id);
			} else if (hasIps && !hasSameSubnetPeers) {
				segmentIssueById.set(seg.id, "Subnet");
			} else if (!hasDhcpServer) {
				segmentIssueById.set(seg.id, "No DHCP");
			} else {
				segmentIssueById.set(seg.id, "No GW");
			}
		}

		const connectionToSegmentId = new Map<string, string>();
		const connectionIssueById = new Map<string, string>();
		for (const conn of connections) {
			const aKey = `${conn.deviceAId}:${conn.portA}`;
			const bKey = `${conn.deviceBId}:${conn.portB}`;
			let assigned = false;
			for (const [segId, keySet] of segmentPortSets) {
				if (keySet.has(aKey) && keySet.has(bKey)) {
					connectionToSegmentId.set(conn.id, segId);
					assigned = true;
					break;
				}
			}
			if (!assigned) {
				connectionIssueById.set(conn.id, "VLAN");
			}
		}

		for (const conn of connections) {
			if (connectionIssueById.has(conn.id)) continue;
			const segId = connectionToSegmentId.get(conn.id);
			if (!segId) continue;
			if (!viableSegmentIds.has(segId)) {
				connectionIssueById.set(conn.id, segmentIssueById.get(segId) ?? "No GW");
			}
		}

		const deviceNeighbors = new Map<string, Set<string>>();
		for (const conn of connections) {
			const segId = connectionToSegmentId.get(conn.id);
			if (!segId || !viableSegmentIds.has(segId)) continue;
			if (!deviceNeighbors.has(conn.deviceAId)) {
				deviceNeighbors.set(conn.deviceAId, new Set<string>());
			}
			if (!deviceNeighbors.has(conn.deviceBId)) {
				deviceNeighbors.set(conn.deviceBId, new Set<string>());
			}
			deviceNeighbors.get(conn.deviceAId)?.add(conn.deviceBId);
			deviceNeighbors.get(conn.deviceBId)?.add(conn.deviceAId);
		}

		const trafficEndpoints = new Set<string>();
		for (const d of devices) {
			if (d.deviceType === "cloud") trafficEndpoints.add(d.id);
		}
		for (const pc of portConfigs) {
			const segId = portToSegmentId.get(`${pc.deviceId}:${pc.portNumber}`);
			if (!segId || !viableSegmentIds.has(segId)) continue;
			if (pc.ipAddress || pc.gateway || pc.dhcpEnabled || pc.natEnabled) {
				trafficEndpoints.add(pc.deviceId);
			}
		}

		const endpointIds = Array.from(trafficEndpoints);
		if (endpointIds.length < 2) {
			const fallback = new Set<string>();
			for (const conn of connections) {
				const segId = connectionToSegmentId.get(conn.id);
				if (!segId || !viableSegmentIds.has(segId)) continue;
				const aHasIp = portConfigs.some(
					(pc) =>
						pc.deviceId === conn.deviceAId &&
						!!pc.ipAddress &&
						viableSegmentIds.has(
							portToSegmentId.get(`${pc.deviceId}:${pc.portNumber}`) ?? "",
						),
				);
				const bHasIp = portConfigs.some(
					(pc) =>
						pc.deviceId === conn.deviceBId &&
						!!pc.ipAddress &&
						viableSegmentIds.has(
							portToSegmentId.get(`${pc.deviceId}:${pc.portNumber}`) ?? "",
						),
				);
				if (aHasIp && bHasIp) fallback.add(conn.id);
			}
			return {
				activeConnectionIds: fallback,
				connectionIssueById,
			};
		}

		const getPath = (fromId: string, toId: string): string[] | null => {
			if (fromId === toId) return [fromId];
			const queue = [fromId];
			const visited = new Set<string>([fromId]);
			const parent = new Map<string, string>();

			while (queue.length > 0) {
				const current = queue.shift()!;
				for (const neighbor of deviceNeighbors.get(current) ?? []) {
					if (visited.has(neighbor)) continue;
					visited.add(neighbor);
					parent.set(neighbor, current);
					if (neighbor === toId) {
						const path = [toId];
						let node = toId;
						while (parent.has(node)) {
							node = parent.get(node)!;
							path.unshift(node);
						}
						return path;
					}
					queue.push(neighbor);
				}
			}

			return null;
		};

		const active = new Set<string>();
		for (let i = 0; i < endpointIds.length; i++) {
			for (let j = i + 1; j < endpointIds.length; j++) {
				const path = getPath(endpointIds[i]!, endpointIds[j]!);
				if (!path || path.length < 2) continue;
				for (let k = 0; k < path.length - 1; k++) {
					const pair = [path[k]!, path[k + 1]!].sort().join("|");
					const connIds = connectionLookup.get(pair);
					if (connIds?.length) {
						for (const connId of connIds) {
							const segId = connectionToSegmentId.get(connId);
							if (segId && viableSegmentIds.has(segId)) active.add(connId);
						}
					}
				}
			}
		}

		return {
			activeConnectionIds: active,
			connectionIssueById,
		};
	}, [connections, devices, portConfigs, connectionLookup]);

	const getPathAnchor = useCallback((path: string) => {
		if (typeof document === "undefined") return null;
		try {
			const svgPath = document.createElementNS(
				"http://www.w3.org/2000/svg",
				"path",
			);
			svgPath.setAttribute("d", path);
			const total = svgPath.getTotalLength();
			if (!Number.isFinite(total) || total <= 0) return null;

			const midLen = total * 0.5;
			const p = svgPath.getPointAtLength(midLen);
			const pBefore = svgPath.getPointAtLength(Math.max(0, midLen - 1));
			const pAfter = svgPath.getPointAtLength(Math.min(total, midLen + 1));
			const tx = pAfter.x - pBefore.x;
			const ty = pAfter.y - pBefore.y;
			const tLen = Math.hypot(tx, ty) || 1;

			return {
				x: p.x,
				y: p.y,
				normalX: -ty / tLen,
				normalY: tx / tLen,
			};
		} catch {
			return null;
		}
	}, []);

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
				backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
			}}
			onMouseDown={(e) => {
				// Start rubber-band selection when clicking on the canvas background
				if (e.button !== 0) return;
				if (e.target !== containerRef.current && e.target !== canvasInnerRef.current) return;
				const rect = containerRef.current?.getBoundingClientRect();
				if (!rect) return;
				const x = (e.clientX - rect.left + (containerRef.current?.scrollLeft ?? 0)) / zoomRef.current;
				const y = (e.clientY - rect.top + (containerRef.current?.scrollTop ?? 0)) / zoomRef.current;
				setSelectionRect({ active: true, startX: x, startY: y, currentX: x, currentY: y });
			}}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseUp}
			onClick={handleCanvasClick}
			onContextMenu={handleCanvasContextMenu}
			onWheel={(e) => {
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					setZoom((prev) => clampZoom(prev - e.deltaY * 0.002));
				}
			}}
		>
			{/* ── Canvas toolbar (above everything) ── */}
			<div
				className="sticky top-2 left-0 z-100 flex justify-end px-2 pointer-events-none"
			>
				<div className="flex items-center gap-1 bg-(--app-surface)/90 backdrop-blur-sm border border-(--app-border) rounded-lg p-1 shadow-lg pointer-events-auto">
					<button
						type="button"
						className="w-7 h-7 flex items-center justify-center rounded-md text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover) transition-colors"
						onClick={() => setZoom((prev) => clampZoom(prev - 0.15))}
						title="Zoom out"
					>
						<Minus size={14} />
					</button>
					<button
						type="button"
						className="min-w-12 h-7 flex items-center justify-center rounded-md text-[11px] font-mono font-medium text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover) transition-colors"
						onClick={() => setZoom(1)}
						title="Reset zoom"
					>
						{Math.round(zoom * 100)}%
					</button>
					<button
						type="button"
						className="w-7 h-7 flex items-center justify-center rounded-md text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover) transition-colors"
						onClick={() => setZoom((prev) => clampZoom(prev + 0.15))}
						title="Zoom in"
					>
						<Plus size={14} />
					</button>
					<div className="w-px h-5 bg-(--app-border) mx-0.5" />
					<button
						type="button"
						className="w-7 h-7 flex items-center justify-center rounded-md text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover) transition-colors"
						onClick={() => {
							setZoom(1);
							if (containerRef.current) {
								containerRef.current.scrollTo({ top: 0, left: 0, behavior: "smooth" });
							}
						}}
						title="Reset view"
					>
						<RotateCcw size={13} />
					</button>
					<div className="w-px h-5 bg-(--app-border) mx-0.5" />
					<button
						type="button"
						className="w-7 h-7 flex items-center justify-center rounded-md text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover) transition-colors"
						onClick={handleSavePng}
						title="Save as PNG"
					>
						<Download size={13} />
					</button>
					<button
						type="button"
						className="w-7 h-7 flex items-center justify-center rounded-md text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover) transition-colors"
						onClick={toggleFullscreen}
						title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
					>
						{isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
					</button>
				</div>
			</div>

			{/* ── Scaled canvas content ── */}
			<div
				ref={canvasInnerRef}
				className="relative"
				style={{
					transformOrigin: "0 0",
					transform: `scale(${zoom})`,
					width: canvasExtent.width,
					height: canvasExtent.height,
					minWidth: `${100 / zoom}%`,
					minHeight: `${100 / zoom}%`,
				}}
			>
			{/* Annotation shapes — z-index 5 (BELOW devices) */}
			{annotations.map((ann) => {
				const pos = getAnnPos(ann);
				const sz = getAnnSize(ann);
				const isSel = selectedAnnotation === ann.id;
				const isMultiSel = multiSelectedAnnotations.has(ann.id);
				const isEditing = editingAnnLabel === ann.id;

				return (
					<div
						key={ann.id}
						className={`absolute group ${isMultiSel ? "ring-2 ring-cyan-400/50" : isSel ? "ring-2 ring-blue-400" : ""}`}
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
							if (e.shiftKey || e.metaKey) {
								setMultiSelectedAnnotations((prev) => {
									const next = new Set(prev);
									if (next.has(ann.id)) next.delete(ann.id);
									else next.add(ann.id);
									return next;
								});
								return;
							}
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
				const isMultiSelected = multiSelectedDevices.has(device.id);
				const textColor = luminance(device.color) > 0.5 ? "#000" : "#fff";
				const caps = DEVICE_CAPABILITIES[device.deviceType as DeviceType];
				const typeLabel =
					DEVICE_TYPE_LABELS[device.deviceType as DeviceType] ?? device.deviceType;
				const layerLabel =
					caps.layer === "endpoint" ? "ENDPOINT" : String(caps.layer).toUpperCase();
				const layerTone =
					caps.layer === 3
						? "#60a5fa"
						: caps.layer === 2
							? "#22d3ee"
							: caps.layer === 1
								? "#f59e0b"
								: caps.layer === "cloud"
									? "#c084fc"
									: "#34d399";
					const chassisClass =
						caps.layer === 1
							? "border-dashed"
							: caps.layer === "cloud"
								? "border-double"
								: "";

				return (
					<motion.div
						key={device.id}
						className="absolute select-none"
						style={{
							left: pos.x,
							top: pos.y,
							width: DEVICE_NODE_WIDTH,
							height: nodeHeight,
							zIndex: drag.deviceId === device.id ? 30 : 10,
						}}
						initial={{ opacity: 0, scale: 0.98 }}
						animate={{ opacity: 1, scale: 1 }}
						whileHover={{ y: -1 }}
						transition={{ duration: 0.15 }}
					>
						<div
							className={`rounded-xl border-2 shadow-lg transition-shadow ${chassisClass} ${
								isMultiSelected
									? "border-cyan-400 shadow-cyan-400/20 ring-2 ring-cyan-400/30"
									: isSelected
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
								<span
									className="text-[9px] px-1.5 py-px rounded-full font-semibold tracking-wide"
									style={{
										backgroundColor: `${textColor === "#000" ? "#111111" : "#ffffff"}1f`,
										color: textColor,
									}}
								>
									{layerLabel}
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
										<span
											className="text-[8px] font-semibold px-1 py-px rounded shrink-0 uppercase tracking-wide"
											style={{
												backgroundColor: `${layerTone}1f`,
												color: layerTone,
											}}
										>
											{typeLabel}
										</span>
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
											<span className="text-[10px] opacity-40 italic">
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
								(() => {
									const pNum = 0;
									const wifiConnected = connections.some(
										(c) =>
											(c.deviceAId === device.id && c.portA === 0) ||
											(c.deviceBId === device.id && c.portB === 0),
									);
									const isSel =
										selectedPort?.deviceId === device.id &&
										selectedPort.portNumber === pNum;
									const pc = getPortConfig(device.id, pNum);
									const hasConfig = !!(
										pc &&
										(pc.ipAddress ||
											pc.alias ||
											pc.ssid ||
											pc.gateway ||
											pc.speed)
									);

									return (
										<div className="p-2.5 flex items-center justify-center">
											<button
												type="button"
												className={`h-8 px-3 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 relative ${
													isSel
														? "ring-2 ring-white ring-offset-1 ring-offset-(--app-surface)"
														: ""
												}`}
												style={{
													backgroundColor: wifiConnected
														? "#0ea5e9"
														: "var(--app-port-empty)",
													color: wifiConnected ? "#03131f" : "var(--app-text-dim)",
													border: wifiConnected
														? "1px solid #0284c7"
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
												title={`WiFi interface${pc?.ipAddress ? ` ${pc.ipAddress}` : ""}${pc?.ssid ? ` SSID ${pc.ssid}` : ""}`}
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
												<span>WiFi P0</span>
												{hasConfig && (
													<div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-cyan-400" />
												)}
											</button>
										</div>
									);
								})()
							)}
						</div>
					</motion.div>
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
					const anchor = getPathAnchor(path);
					const midX = anchor?.x ?? (from.x + to.x) / 2;
					const midY = anchor?.y ?? (from.y + to.y) / 2;
					const normalX = anchor?.normalX ?? 0;
					const normalY = anchor?.normalY ?? -1;
					const portAConfig = getPortConfig(conn.deviceAId, conn.portA);
					const portBConfig = getPortConfig(conn.deviceBId, conn.portB);
					const wireMeta: string[] = [];
					if (portAConfig?.ipAddress || portBConfig?.ipAddress) {
						wireMeta.push(
							`${portAConfig?.ipAddress ?? "∅"} ⇄ ${portBConfig?.ipAddress ?? "∅"}`,
						);
					}
					if (portAConfig?.vlan || portBConfig?.vlan) {
						wireMeta.push(`VLAN ${portAConfig?.vlan ?? portBConfig?.vlan}`);
					}
					if (portAConfig?.speed || portBConfig?.speed) {
						wireMeta.push(portAConfig?.speed ?? portBConfig?.speed ?? "");
					}
					const showWireMeta = wireMeta.length > 0;

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
					const isFlowActive = activeConnectionIds.has(conn.id);
					const issueTag = connectionIssueById.get(conn.id) ?? null;
					const isInvalid = !!issueTag;

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
								opacity={isWireSel ? 0.35 : isInvalid ? 0.07 : 0.15}
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
								opacity={isInvalid ? 0.35 : 0.85}
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
									x={midX + normalX * 10}
									y={midY + normalY * 10}
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
							{isFlowActive && !isWifi && (
								<>
									<circle r="2.1" fill="#22d3ee" opacity="0.9">
										<animateMotion
											dur="2.2s"
											repeatCount="indefinite"
											path={path}
										/>
									</circle>
									<circle r="1.8" fill="#a78bfa" opacity="0.75">
										<animateMotion
											dur="2.6s"
											repeatCount="indefinite"
											path={path}
											keyPoints="1;0"
											keyTimes="0;1"
											calcMode="linear"
										/>
									</circle>
								</>
							)}
							{isFlowActive && isWifi && (
								<>
									<circle r="2.3" fill="#38bdf8" opacity="0.95">
										<animateMotion
											dur="1.9s"
											repeatCount="indefinite"
											path={path}
										/>
									</circle>
									<circle r="2.0" fill="#22d3ee" opacity="0.82">
										<animateMotion
											dur="2.3s"
											repeatCount="indefinite"
											path={path}
											keyPoints="1;0"
											keyTimes="0;1"
											calcMode="linear"
										/>
									</circle>
								</>
							)}
							{showWireMeta && (
								<g
									transform={`translate(${midX + normalX * (isWifi ? 26 : 14)},${midY + normalY * (isWifi ? 26 : 14)})`}
								>
									<rect
										x={-58}
										y={-8}
										rx={5}
										width={116}
										height={16}
										fill="rgba(15, 23, 42, 0.72)"
										stroke="rgba(148, 163, 184, 0.25)"
										strokeWidth={1}
									/>
									<text
										textAnchor="middle"
										y={3}
										fill="#e2e8f0"
										fontSize={8.8}
										fontWeight={600}
										style={{ pointerEvents: "none", userSelect: "none" }}
									>
										{wireMeta.join("  •  ").slice(0, 46)}
									</text>
								</g>
							)}
							{isInvalid && (
								<g
									transform={`translate(${midX + normalX * (isWifi ? 46 : 34)},${midY + normalY * (isWifi ? 46 : 34)})`}
								>
									<rect
										x={-24}
										y={-8}
										rx={5}
										width={48}
										height={16}
										fill="rgba(127, 29, 29, 0.85)"
										stroke="rgba(248, 113, 113, 0.6)"
										strokeWidth={1}
									/>
									<text
										textAnchor="middle"
										y={3}
										fill="#fecaca"
										fontSize={8.4}
										fontWeight={700}
										style={{ pointerEvents: "none", userSelect: "none" }}
									>
										{issueTag}
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

			{/* Empty state */}
			{devices.length === 0 && (
				<motion.div
					className="absolute inset-0 flex items-center justify-center"
					style={{ zIndex: 5 }}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.2 }}
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
				</motion.div>
			)}
			{/* Rubber-band selection rectangle */}
			{selectionRect?.active && (
				<div
					className="absolute border-2 border-cyan-400 bg-cyan-400/10 pointer-events-none"
					style={{
						left: Math.min(selectionRect.startX, selectionRect.currentX) * zoom,
						top: Math.min(selectionRect.startY, selectionRect.currentY) * zoom,
						width: Math.abs(selectionRect.currentX - selectionRect.startX) * zoom,
						height: Math.abs(selectionRect.currentY - selectionRect.startY) * zoom,
						zIndex: 9998,
					}}
				/>
			)}

			</div>{/* end canvasInnerRef */}

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
								kind: "label",
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
		</div>
	);
}
