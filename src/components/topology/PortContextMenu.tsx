import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type ConnectionRow,
	DEVICE_CAPABILITIES,
	type DeviceRow,
	type DeviceType,
	type InterfaceRow,
	PORT_MODES,
	PORT_ROLES,
	type PortMode,
	type PortRole,
	SPEED_OPTIONS,
	VLAN_PRESETS,
	validatePortIp,
} from "@/lib/topology-types";

interface PortContextMenuProps {
	x: number;
	y: number;
	deviceId: string;
	portNumber: number;
	device: DeviceRow;
	connections: ConnectionRow[];
	devices: DeviceRow[];
	portConfigs: InterfaceRow[];
	portConfig: InterfaceRow | null;
	onClose: () => void;
	onUpdatePortConfig: (config: {
		deviceId: string;
		portNumber: number;
		alias?: string | null;
		speed?: string | null;
		vlan?: number | null;
		reserved?: boolean;
		reservedLabel?: string | null;
		ipAddress?: string | null;
		macAddress?: string | null;
		portMode?: string | null;
		portRole?: string | null;
		dhcpEnabled?: boolean;
		dhcpRangeStart?: string | null;
		dhcpRangeEnd?: string | null;
		ssid?: string | null;
		wifiPassword?: string | null;
		natEnabled?: boolean;
		gateway?: string | null;
	}) => void;
	onDisconnect: (connectionId: string) => void;
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
	| "dhcp"
	| "wifi"
	| "nat"
	| "gateway";

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
	const menuRef = useRef<HTMLDivElement>(null);
	const [activePanel, setActivePanel] = useState<PanelType>("main");
	const [aliasValue, setAliasValue] = useState(portConfig?.alias ?? "");
	const [customVlan, setCustomVlan] = useState("");
	const [ipValue, setIpValue] = useState(portConfig?.ipAddress ?? "");
	const [macValue, setMacValue] = useState(portConfig?.macAddress ?? "");
	const [dhcpStart, setDhcpStart] = useState(portConfig?.dhcpRangeStart ?? "");
	const [dhcpEnd, setDhcpEnd] = useState(portConfig?.dhcpRangeEnd ?? "");
	const [ssidValue, setSsidValue] = useState(portConfig?.ssid ?? "");
	const [wifiPassValue, setWifiPassValue] = useState(
		portConfig?.wifiPassword ?? "",
	);
	const [gatewayValue, setGatewayValue] = useState(portConfig?.gateway ?? "");

	/* ── Device capabilities ── */
	const caps =
		DEVICE_CAPABILITIES[device.deviceType as DeviceType] ??
		DEVICE_CAPABILITIES.pc;

	/* ── Connection info for this port ── */
	const connection = connections.find(
		(c) =>
			(c.deviceAId === deviceId && c.portA === portNumber) ||
			(c.deviceBId === deviceId && c.portB === portNumber),
	);
	const isConnected = !!connection;

	let peerInfo: { name: string; port: number; color: string } | null = null;
	if (connection) {
		const isA =
			connection.deviceAId === deviceId && connection.portA === portNumber;
		const peerId = isA ? connection.deviceBId : connection.deviceAId;
		const peerPort = isA ? connection.portB : connection.portA;
		const peerDev = devices.find((d) => d.id === peerId);
		if (peerDev) {
			peerInfo = {
				name: peerDev.name,
				port: peerPort,
				color: peerDev.color,
			};
		}
	}

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

	const setSpeed = useCallback(
		(speed: string | null) => {
			onUpdatePortConfig({ deviceId, portNumber, speed });
			onClose();
		},
		[deviceId, portNumber, onUpdatePortConfig, onClose],
	);

	const setVlan = useCallback(
		(vlan: number | null) => {
			onUpdatePortConfig({ deviceId, portNumber, vlan });
			onClose();
		},
		[deviceId, portNumber, onUpdatePortConfig, onClose],
	);

	const setAlias = useCallback(() => {
		onUpdatePortConfig({
			deviceId,
			portNumber,
			alias: aliasValue.trim() || null,
		});
		onClose();
	}, [deviceId, portNumber, aliasValue, onUpdatePortConfig, onClose]);

	const saveIp = useCallback(() => {
		onUpdatePortConfig({
			deviceId,
			portNumber,
			ipAddress: ipValue.trim() || null,
		});
		onClose();
	}, [deviceId, portNumber, ipValue, onUpdatePortConfig, onClose]);

	const saveMac = useCallback(() => {
		onUpdatePortConfig({
			deviceId,
			portNumber,
			macAddress: macValue.trim().toUpperCase() || null,
		});
		onClose();
	}, [deviceId, portNumber, macValue, onUpdatePortConfig, onClose]);

	const setPortMode = useCallback(
		(mode: PortMode | null) => {
			onUpdatePortConfig({ deviceId, portNumber, portMode: mode });
			onClose();
		},
		[deviceId, portNumber, onUpdatePortConfig, onClose],
	);

	const setPortRole = useCallback(
		(role: PortRole | null) => {
			onUpdatePortConfig({ deviceId, portNumber, portRole: role });
			onClose();
		},
		[deviceId, portNumber, onUpdatePortConfig, onClose],
	);

	const generateRandomMac = useCallback(() => {
		const hex = () =>
			Math.floor(Math.random() * 256)
				.toString(16)
				.padStart(2, "0")
				.toUpperCase();
		const first = (Math.floor(Math.random() * 256) | 0x02) & 0xfe;
		const mac = [
			first.toString(16).padStart(2, "0").toUpperCase(),
			hex(),
			hex(),
			hex(),
			hex(),
			hex(),
		].join(":");
		setMacValue(mac);
	}, []);

	const formatMacInput = useCallback((val: string) => {
		const clean = val.replace(/[^0-9a-fA-F]/g, "").slice(0, 12);
		const parts = clean.match(/.{1,2}/g) ?? [];
		return parts.join(":");
	}, []);

	const toggleReserved = useCallback(() => {
		onUpdatePortConfig({
			deviceId,
			portNumber,
			reserved: !portConfig?.reserved,
			reservedLabel: !portConfig?.reserved ? "Reserved" : null,
		});
		onClose();
	}, [deviceId, portNumber, portConfig, onUpdatePortConfig, onClose]);

	const toggleDhcp = useCallback(() => {
		onUpdatePortConfig({
			deviceId,
			portNumber,
			dhcpEnabled: !portConfig?.dhcpEnabled,
		});
		if (portConfig?.dhcpEnabled) onClose();
	}, [deviceId, portNumber, portConfig, onUpdatePortConfig, onClose]);

	const saveDhcpRange = useCallback(() => {
		onUpdatePortConfig({
			deviceId,
			portNumber,
			dhcpEnabled: true,
			dhcpRangeStart: dhcpStart.trim() || null,
			dhcpRangeEnd: dhcpEnd.trim() || null,
		});
		onClose();
	}, [deviceId, portNumber, dhcpStart, dhcpEnd, onUpdatePortConfig, onClose]);

	const saveWifi = useCallback(() => {
		onUpdatePortConfig({
			deviceId,
			portNumber,
			ssid: ssidValue.trim() || null,
			wifiPassword: wifiPassValue.trim() || null,
		});
		onClose();
	}, [
		deviceId,
		portNumber,
		ssidValue,
		wifiPassValue,
		onUpdatePortConfig,
		onClose,
	]);

	const toggleNat = useCallback(() => {
		onUpdatePortConfig({
			deviceId,
			portNumber,
			natEnabled: !portConfig?.natEnabled,
		});
		onClose();
	}, [deviceId, portNumber, portConfig, onUpdatePortConfig, onClose]);

	const saveGateway = useCallback(() => {
		onUpdatePortConfig({
			deviceId,
			portNumber,
			gateway: gatewayValue.trim() || null,
		});
		onClose();
	}, [deviceId, portNumber, gatewayValue, onUpdatePortConfig, onClose]);

	/* ── Subnet validation for the current IP value ── */
	const ipValidation = useMemo(() => {
		if (!ipValue.trim() || caps.canBeGateway || caps.layer === "cloud")
			return null;
		return validatePortIp(
			ipValue.trim(),
			deviceId,
			portNumber,
			devices,
			connections,
			portConfigs,
		);
	}, [ipValue, caps, deviceId, portNumber, devices, connections, portConfigs]);

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
						: "NIC";

	const menuStyle: React.CSSProperties = {
		position: "fixed",
		left: x,
		top: y,
		zIndex: 9999,
	};

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
						<div
							className={`mt-0.5 text-[10px] ${portConfig.portRole === "uplink" ? "text-amber-400" : "text-cyan-400"}`}
						>
							Role:{" "}
							{portConfig.portRole === "uplink"
								? "↑ Uplink (WAN)"
								: "↓ Downlink (LAN)"}
						</div>
					)}
					{portConfig?.dhcpEnabled && (
						<div className="mt-0.5 text-[10px] text-orange-400">
							DHCP: {portConfig.dhcpRangeStart ?? "?"} –{" "}
							{portConfig.dhcpRangeEnd ?? "?"}
						</div>
					)}
					{portConfig?.ssid && (
						<div className="mt-0.5 text-[10px] text-purple-400">
							WiFi: {portConfig.ssid}
						</div>
					)}
					{portConfig?.natEnabled && (
						<div className="mt-0.5 text-[10px] text-rose-400">NAT: Enabled</div>
					)}
					{portConfig?.gateway && (
						<div className="mt-0.5 text-[10px] text-teal-400 font-mono">
							GW: {portConfig.gateway}
						</div>
					)}
					{/* Show why IP is disabled for L2 */}
					{!caps.perPortIp && caps.managementIp && (
						<div className="mt-0.5 text-[10px] text-(--app-text-dim) italic">
							L2 device — configure Management IP via port 0
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
								{portConfig?.speed ?? connection?.speed ?? "Auto"}
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
								<span
									className={`text-[10px] ${
										portConfig?.portRole === "uplink"
											? "text-amber-400"
											: portConfig?.portRole === "downlink"
												? "text-cyan-400"
												: "text-(--app-text-muted)"
									}`}
								>
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
									{caps.canBeGateway ? "Interface IP" : "IP Address"}
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

						{/* ── Networking config (per-interface) ── */}
						{(caps.dhcpCapable ||
							caps.natCapable ||
							caps.wifiHost ||
							caps.perPortIp) && (
							<div className="border-t border-(--app-border-light) my-1" />
						)}

						{/* DHCP Server — for canBeGateway + dhcpCapable (routers, firewalls) */}
						{caps.dhcpCapable && caps.canBeGateway && (
							<button
								type="button"
								className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
								onClick={() => setActivePanel("dhcp")}
							>
								<span className="flex items-center gap-2">
									<DhcpIcon />
									DHCP Server
								</span>
								<span
									className={`text-[10px] ${portConfig?.dhcpEnabled ? "text-orange-400" : "text-(--app-text-muted)"}`}
								>
									{portConfig?.dhcpEnabled ? "On" : "Off"}
								</span>
							</button>
						)}

						{/* WiFi — for wifiHost devices (AP, router) */}
						{caps.wifiHost && (
							<button
								type="button"
								className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
								onClick={() => setActivePanel("wifi")}
							>
								<span className="flex items-center gap-2">
									<WifiIcon />
									WiFi Config
								</span>
								<span className="text-[10px] text-(--app-text-muted) truncate max-w-24">
									{portConfig?.ssid ?? "—"}
								</span>
							</button>
						)}

						{/* NAT — for natCapable devices */}
						{caps.natCapable && (
							<button
								type="button"
								className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
								onClick={toggleNat}
							>
								<span className="flex items-center gap-2">
									<NatIcon />
									NAT
								</span>
								<span
									className={`text-[10px] ${portConfig?.natEnabled ? "text-rose-400" : "text-(--app-text-muted)"}`}
								>
									{portConfig?.natEnabled ? "Enabled" : "Off"}
								</span>
							</button>
						)}

						{/* Gateway — for endpoints/NIC that need a default gateway */}
						{caps.perPortIp && !caps.canBeGateway && (
							<button
								type="button"
								className="w-full px-3 py-1.5 text-left text-(--app-text) hover:bg-(--app-surface-hover) flex items-center justify-between"
								onClick={() => setActivePanel("gateway")}
							>
								<span className="flex items-center gap-2">
									<GatewayIcon />
									Default Gateway
								</span>
								<span className="text-[10px] text-(--app-text-muted) truncate max-w-24 font-mono">
									{portConfig?.gateway ?? "—"}
								</span>
							</button>
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
								<span className="text-[10px] text-amber-400">●</span>
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
										onDisconnect(connection.id);
										onClose();
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
									<span className="text-cyan-400 text-xs">✓</span>
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
									<span className="text-cyan-400 text-xs">✓</span>
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
										const num = Number(customVlan);
										if (num >= 1 && num <= 4094) setVlan(num);
									}
								}}
							/>
							<button
								type="button"
								className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded"
								onClick={() => {
									const num = Number(customVlan);
									if (num >= 1 && num <= 4094) setVlan(num);
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
							Access: single VLAN untagged. Trunk: multiple VLANs tagged
							(802.1Q)
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
									<span className="text-cyan-400 text-xs">✓</span>
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
							<span className="text-amber-400">Uplink</span>: WAN-facing port
							(connects to ISP / upstream router).{" "}
							<span className="text-cyan-400">Downlink</span>: LAN-facing port
							(serves local devices, DHCP, VLAN).
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
									if (e.key === "Enter") setAlias();
								}}
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
										setAliasValue("");
										onUpdatePortConfig({
											deviceId,
											portNumber,
											alias: null,
										});
										onClose();
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
									This interface defines a subnet. Connected devices should use
									IPs within this range.
								</div>
							)}
							{caps.layer === "endpoint" && (
								<div className="text-[10px] text-cyan-400 bg-cyan-400/10 rounded px-2 py-1">
									Assign an IP from the connected router's subnet.
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
									if (e.key === "Enter") saveIp();
								}}
							/>
							{ipValue &&
								/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(ipValue.trim()) &&
								(() => {
									const parts = ipValue.trim().split("/");
									const ip = parts[0] ?? "";
									const cidrStr = parts[1] ?? "0";
									const cidr = Number(cidrStr);
									const mask = cidr > 0 ? (~0 << (32 - cidr)) >>> 0 : 0;
									const octets = ip.split(".").map(Number);
									const ipNum =
										(((octets[0] ?? 0) << 24) |
											((octets[1] ?? 0) << 16) |
											((octets[2] ?? 0) << 8) |
											(octets[3] ?? 0)) >>>
										0;
									const network = (ipNum & mask) >>> 0;
									const broadcast = (network | ~mask) >>> 0;
									const hosts =
										cidr <= 30 ? 2 ** (32 - cidr) - 2 : cidr === 31 ? 2 : 1;
									const toIp = (n: number) =>
										`${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
									return (
										<div className="text-[10px] text-(--app-text-dim) space-y-0.5 bg-(--app-surface-alt) rounded p-2">
											<div>
												Network:{" "}
												<span className="font-mono text-emerald-400">
													{toIp(network)}/{cidr}
												</span>
											</div>
											<div>
												Mask: <span className="font-mono">{toIp(mask)}</span>
											</div>
											<div>
												Broadcast:{" "}
												<span className="font-mono">{toIp(broadcast)}</span>
											</div>
											<div>
												Usable hosts:{" "}
												<span className="font-mono text-cyan-400">{hosts}</span>
											</div>
											{caps.canBeGateway && (
												<div className="text-amber-400">
													Gateway:{" "}
													<span className="font-mono">{toIp(ipNum)}</span>
												</div>
											)}
										</div>
									);
								})()}
							{/* Subnet validation warning */}
							{ipValidation?.warning && (
								<div className="text-[10px] bg-red-500/10 border border-red-500/30 text-red-400 rounded px-2 py-1.5">
									<div className="font-semibold">⚠ Subnet Mismatch</div>
									<div className="mt-0.5">{ipValidation.warning}</div>
								</div>
							)}
							{ipValidation &&
								!ipValidation.warning &&
								ipValidation.gatewaySubnet && (
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
										setIpValue("");
										onUpdatePortConfig({
											deviceId,
											portNumber,
											ipAddress: null,
										});
										onClose();
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
								onChange={(e) => setMacValue(formatMacInput(e.target.value))}
								className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1.5 text-xs text-(--app-text) font-mono outline-none"
								onKeyDown={(e) => {
									if (e.key === "Enter") saveMac();
								}}
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
										setMacValue("");
										onUpdatePortConfig({
											deviceId,
											portNumber,
											macAddress: null,
										});
										onClose();
									}}
								>
									Clear
								</button>
							</div>
						</div>
					</div>
				)}

				{/* DHCP Server panel */}
				{activePanel === "dhcp" && (
					<div className="py-1">
						<BackButton onClick={() => setActivePanel("main")} />
						<div className="border-t border-(--app-border-light) my-1" />
						<div className="px-3 py-2 space-y-2">
							<div className="flex items-center justify-between">
								<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider">
									DHCP Server
								</label>
								<button
									type="button"
									className={`w-8 h-4 rounded-full transition-colors ${portConfig?.dhcpEnabled ? "bg-orange-500" : "bg-(--app-border-light)"}`}
									onClick={toggleDhcp}
								>
									<div
										className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${portConfig?.dhcpEnabled ? "translate-x-4" : "translate-x-0.5"}`}
									/>
								</button>
							</div>
							{portConfig?.dhcpEnabled && (
								<>
									<div className="text-[10px] text-orange-400 bg-orange-400/10 rounded px-2 py-1">
										This interface will serve DHCP leases to its segment.
									</div>
									<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block">
										Range Start
									</label>
									<input
										type="text"
										placeholder="e.g. 192.168.1.100"
										value={dhcpStart}
										onChange={(e) => setDhcpStart(e.target.value)}
										className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1.5 text-xs text-(--app-text) font-mono outline-none"
									/>
									<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block">
										Range End
									</label>
									<input
										type="text"
										placeholder="e.g. 192.168.1.200"
										value={dhcpEnd}
										onChange={(e) => setDhcpEnd(e.target.value)}
										className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1.5 text-xs text-(--app-text) font-mono outline-none"
										onKeyDown={(e) => {
											if (e.key === "Enter") saveDhcpRange();
										}}
									/>
									<div className="flex gap-1">
										<button
											type="button"
											className="flex-1 px-2 py-1 bg-orange-600 hover:bg-orange-500 text-white text-xs rounded"
											onClick={saveDhcpRange}
										>
											Save Range
										</button>
										<button
											type="button"
											className="px-2 py-1 bg-(--app-surface-hover) hover:bg-(--app-border-light) text-(--app-text-muted) text-xs rounded"
											onClick={() => {
												setDhcpStart("");
												setDhcpEnd("");
												onUpdatePortConfig({
													deviceId,
													portNumber,
													dhcpEnabled: false,
													dhcpRangeStart: null,
													dhcpRangeEnd: null,
												});
												onClose();
											}}
										>
											Clear
										</button>
									</div>
								</>
							)}
						</div>
					</div>
				)}

				{/* WiFi Config panel */}
				{activePanel === "wifi" && (
					<div className="py-1">
						<BackButton onClick={() => setActivePanel("main")} />
						<div className="border-t border-(--app-border-light) my-1" />
						<div className="px-3 py-2 space-y-2">
							<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block">
								SSID (Network Name)
							</label>
							<input
								type="text"
								placeholder="e.g. MyNetwork"
								value={ssidValue}
								onChange={(e) => setSsidValue(e.target.value)}
								className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1.5 text-xs text-(--app-text) outline-none"
							/>
							<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block">
								Password
							</label>
							<input
								type="text"
								placeholder="WiFi password"
								value={wifiPassValue}
								onChange={(e) => setWifiPassValue(e.target.value)}
								className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1.5 text-xs text-(--app-text) font-mono outline-none"
								onKeyDown={(e) => {
									if (e.key === "Enter") saveWifi();
								}}
							/>
							<div className="flex gap-1">
								<button
									type="button"
									className="flex-1 px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded"
									onClick={saveWifi}
								>
									Save
								</button>
								<button
									type="button"
									className="px-2 py-1 bg-(--app-surface-hover) hover:bg-(--app-border-light) text-(--app-text-muted) text-xs rounded"
									onClick={() => {
										setSsidValue("");
										setWifiPassValue("");
										onUpdatePortConfig({
											deviceId,
											portNumber,
											ssid: null,
											wifiPassword: null,
										});
										onClose();
									}}
								>
									Clear
								</button>
							</div>
						</div>
					</div>
				)}

				{/* Gateway panel */}
				{activePanel === "gateway" && (
					<div className="py-1">
						<BackButton onClick={() => setActivePanel("main")} />
						<div className="border-t border-(--app-border-light) my-1" />
						<div className="px-3 py-2 space-y-2">
							<div className="text-[10px] text-teal-400 bg-teal-400/10 rounded px-2 py-1">
								The router IP this interface sends traffic to for destinations
								outside its subnet.
							</div>
							<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block">
								Default Gateway IP
							</label>
							<input
								type="text"
								placeholder="e.g. 192.168.1.1"
								value={gatewayValue}
								onChange={(e) => setGatewayValue(e.target.value)}
								className="w-full bg-(--app-input-bg) border border-(--app-border-light) rounded px-2 py-1.5 text-xs text-(--app-text) font-mono outline-none"
								onKeyDown={(e) => {
									if (e.key === "Enter") saveGateway();
								}}
							/>
							<div className="flex gap-1">
								<button
									type="button"
									className="flex-1 px-2 py-1 bg-teal-600 hover:bg-teal-500 text-white text-xs rounded"
									onClick={saveGateway}
								>
									Save
								</button>
								<button
									type="button"
									className="px-2 py-1 bg-(--app-surface-hover) hover:bg-(--app-border-light) text-(--app-text-muted) text-xs rounded"
									onClick={() => {
										setGatewayValue("");
										onUpdatePortConfig({
											deviceId,
											portNumber,
											gateway: null,
										});
										onClose();
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
	);
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
	);
}

/* ── Tiny inline SVG icons ── */

function SpeedIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
		</svg>
	);
}

function VlanIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<rect x="3" y="3" width="7" height="7" rx="1" />
			<rect x="14" y="3" width="7" height="7" rx="1" />
			<rect x="3" y="14" width="7" height="7" rx="1" />
			<rect x="14" y="14" width="7" height="7" rx="1" />
		</svg>
	);
}

function PortModeIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M4 6h16M4 12h16M4 18h16" />
			<circle cx="8" cy="6" r="2" fill="currentColor" />
			<circle cx="16" cy="12" r="2" fill="currentColor" />
			<circle cx="8" cy="18" r="2" fill="currentColor" />
		</svg>
	);
}

function AliasIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M4 7V4h16v3" />
			<path d="M9 20h6" />
			<path d="M12 4v16" />
		</svg>
	);
}

function ReserveIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<rect x="3" y="11" width="18" height="11" rx="2" />
			<path d="M7 11V7a5 5 0 0 1 10 0v4" />
		</svg>
	);
}

function DisconnectIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M18 6L6 18" />
			<path d="M6 6l12 12" />
		</svg>
	);
}

function IpIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<circle cx="12" cy="12" r="10" />
			<path d="M2 12h20" />
			<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
		</svg>
	);
}

function MacIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<rect x="2" y="6" width="20" height="12" rx="2" />
			<path d="M6 10h.01" />
			<path d="M10 10h.01" />
			<path d="M14 10h.01" />
			<path d="M18 10h.01" />
			<path d="M8 14h8" />
		</svg>
	);
}

function PortRoleIcon() {
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
			<path d="M12 5v14" />
			<path d="M19 12l-7-7-7 7" />
		</svg>
	);
}

function DhcpIcon() {
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
			<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
			<path d="M12 6v6l4 2" />
		</svg>
	);
}

function WifiIcon() {
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
			<path d="M5 12.55a11 11 0 0 1 14.08 0" />
			<path d="M1.42 9a16 16 0 0 1 21.16 0" />
			<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
			<circle cx="12" cy="20" r="1" fill="currentColor" />
		</svg>
	);
}

function NatIcon() {
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
			<path d="M16 3h5v5" />
			<path d="M8 3H3v5" />
			<path d="M12 22v-6" />
			<path d="M21 3l-9 9" />
			<path d="M3 3l9 9" />
		</svg>
	);
}

function GatewayIcon() {
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
			<rect x="2" y="2" width="20" height="8" rx="2" />
			<rect x="2" y="14" width="20" height="8" rx="2" />
			<path d="M6 6h.01" />
			<path d="M6 18h.01" />
			<path d="M12 10v4" />
		</svg>
	);
}
