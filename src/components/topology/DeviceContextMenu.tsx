import { useEffect, useRef } from "react";
import {
	DEVICE_CAPABILITIES,
	type DeviceRow,
	type DeviceType,
} from "@/lib/topology-types";

interface DeviceContextMenuProps {
	x: number;
	y: number;
	device: DeviceRow;
	onClose: () => void;
	onUpdateDevice: (
		id: string,
		fields: {
			ipForwarding?: boolean;
		},
	) => void;
	onDeleteDevice: (id: string) => void;
}

export default function DeviceContextMenu({
	x,
	y,
	device,
	onClose,
	onUpdateDevice,
	onDeleteDevice,
}: DeviceContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const caps =
		DEVICE_CAPABILITIES[device.deviceType as DeviceType] ??
		DEVICE_CAPABILITIES.pc;

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
