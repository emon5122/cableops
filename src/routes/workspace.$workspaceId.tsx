import {
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Cable,
	Check,
	Lightbulb,
	Network,
	Pencil,
	Table2,
	X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import TopologyCanvas from "@/components/topology/TopologyCanvas";
import ConnectionsTable from "@/components/workspace/ConnectionsTable";
import NetworkInsights from "@/components/workspace/NetworkInsights";
import WorkspaceSidebar from "@/components/workspace/WorkspaceSidebar";
import { useTRPC } from "@/integrations/trpc/react";
import { authClient } from "@/lib/auth-client";
import type { DeviceType, InterfaceRow } from "@/lib/topology-types";
import {
	DEVICE_CAPABILITIES,
	getNextDhcpIp,
	isPortConnected,
} from "@/lib/topology-types";

export const Route = createFileRoute("/workspace/$workspaceId")({
	component: WorkspacePage,
});

type ViewTab = "topology" | "connections" | "insights";

function WorkspacePage() {
	const { workspaceId } = Route.useParams();
	const { data: session } = authClient.useSession();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	/* ── State ── */
	const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
	const [selectedPort, setSelectedPort] = useState<{
		deviceId: string;
		portNumber: number;
	} | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [activeTab, setActiveTab] = useState<ViewTab>("topology");
	const [highlightedConnectionId, setHighlightedConnectionId] = useState<
		string | null
	>(null);
	const [editingWorkspaceName, setEditingWorkspaceName] = useState(false);
	const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");
	const wsNameInputRef = useRef<HTMLInputElement>(null);

	/* ── Queries ── */
	const workspaceQuery = useQuery(
		trpc.workspaces.get.queryOptions({ id: workspaceId }),
	);
	const devicesQuery = useQuery(
		trpc.devices.list.queryOptions({ workspaceId }),
	);
	const connectionsQuery = useQuery(
		trpc.connections.list.queryOptions({ workspaceId }),
	);
	const annotationsQuery = useQuery(
		trpc.annotations.list.queryOptions({ workspaceId }),
	);

	const devices = devicesQuery.data ?? [];
	const connections = connectionsQuery.data ?? [];
	const annotations = annotationsQuery.data ?? [];

	/* ── Interfaces (per-port config including IP, DHCP, WiFi, NAT) ── */
	const interfaceQueries = useQueries({
		queries: devices.map((d) =>
			trpc.interfaces.list.queryOptions({ deviceId: d.id }),
		),
	});

	const portConfigs = useMemo<InterfaceRow[]>(() => {
		const all: InterfaceRow[] = [];
		for (const q of interfaceQueries) {
			if (q.data) all.push(...q.data);
		}
		return all;
	}, [interfaceQueries]);

	/* ── Invalidation helper ── */
	const invalidateAll = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: trpc.devices.list.queryKey({ workspaceId }),
		});
		void queryClient.invalidateQueries({
			queryKey: trpc.connections.list.queryKey({ workspaceId }),
		});
		void queryClient.invalidateQueries({
			queryKey: trpc.annotations.list.queryKey({ workspaceId }),
		});
		for (const d of devices) {
			void queryClient.invalidateQueries({
				queryKey: trpc.interfaces.list.queryKey({ deviceId: d.id }),
			});
		}
	}, [queryClient, trpc, workspaceId, devices]);

	/* ── Mutations ── */
	const addDevice = useMutation(
		trpc.devices.create.mutationOptions({ onSuccess: invalidateAll }),
	);
	const moveDevice = useMutation(
		trpc.devices.move.mutationOptions({ onSuccess: invalidateAll }),
	);
	const deleteDevice = useMutation(
		trpc.devices.delete.mutationOptions({ onSuccess: invalidateAll }),
	);
	const updateDevice = useMutation(
		trpc.devices.update.mutationOptions({ onSuccess: invalidateAll }),
	);
	const addConnection = useMutation(
		trpc.connections.create.mutationOptions({ onSuccess: invalidateAll }),
	);
	const deleteConnection = useMutation(
		trpc.connections.delete.mutationOptions({ onSuccess: invalidateAll }),
	);
	const upsertPortConfig = useMutation(
		trpc.interfaces.upsert.mutationOptions({ onSuccess: invalidateAll }),
	);
	const createAnnotation = useMutation(
		trpc.annotations.create.mutationOptions({ onSuccess: invalidateAll }),
	);
	const updateAnnotation = useMutation(
		trpc.annotations.update.mutationOptions({ onSuccess: invalidateAll }),
	);
	const deleteAnnotation = useMutation(
		trpc.annotations.delete.mutationOptions({ onSuccess: invalidateAll }),
	);
	const updateWorkspace = useMutation(
		trpc.workspaces.update.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.workspaces.get.queryKey({ id: workspaceId }),
				});
				setEditingWorkspaceName(false);
			},
		}),
	);

	/* ── Port click (connect flow) ── */
	const handlePortClick = useCallback(
		(deviceId: string, portNumber: number) => {
			if (isPortConnected(deviceId, portNumber, connections)) return;

			if (!selectedPort) {
				setSelectedPort({ deviceId, portNumber });
				return;
			}

			if (
				selectedPort.deviceId === deviceId &&
				selectedPort.portNumber === portNumber
			) {
				setSelectedPort(null);
				return;
			}

			/* Same device? Disallow */
			if (selectedPort.deviceId === deviceId) {
				setSelectedPort({ deviceId, portNumber });
				return;
			}

			/* Check if target port is already connected */
			if (isPortConnected(deviceId, portNumber, connections)) {
				setSelectedPort(null);
				return;
			}

			/* Auto-detect WiFi: only when at least one port is 0 (virtual WiFi interface) */
			const devA = devices.find((d) => d.id === selectedPort.deviceId);
			const devB = devices.find((d) => d.id === deviceId);
			const capsA = devA
				? DEVICE_CAPABILITIES[devA.deviceType as DeviceType]
				: null;
			const capsB = devB
				? DEVICE_CAPABILITIES[devB.deviceType as DeviceType]
				: null;
			const isWifi =
				(selectedPort.portNumber === 0 || portNumber === 0) &&
				((capsA?.wifiHost && capsB?.wifiClient) ||
					(capsB?.wifiHost && capsA?.wifiClient));

			addConnection.mutate(
				{
					workspaceId,
					deviceAId: selectedPort.deviceId,
					portA: selectedPort.portNumber,
					deviceBId: deviceId,
					portB: portNumber,
					connectionType: isWifi ? "wifi" : "wired",
				},
				{
					onSuccess: () => {
						/* Auto-assign DHCP IP to the client on wired connections */
						if (!isWifi) {
							/* Determine which interface is the DHCP server */
							const ifaceA = portConfigs.find(
								(pc) =>
									pc.deviceId === selectedPort.deviceId &&
									pc.portNumber === selectedPort.portNumber,
							);
							const ifaceB = portConfigs.find(
								(pc) =>
									pc.deviceId === deviceId && pc.portNumber === portNumber,
							);

							let dhcpServer: typeof devA;
							let serverPort: number | null = null;
							let clientId: string | null = null;
							let clientPort: number | null = null;

							if (ifaceA?.dhcpEnabled && devA) {
								dhcpServer = devA;
								serverPort = selectedPort.portNumber;
								clientId = deviceId;
								clientPort = portNumber;
							} else if (ifaceB?.dhcpEnabled && devB) {
								dhcpServer = devB;
								serverPort = portNumber;
								clientId = selectedPort.deviceId;
								clientPort = selectedPort.portNumber;
							}

							if (
								dhcpServer &&
								clientId &&
								clientPort !== null &&
								serverPort !== null
							) {
								const ip = getNextDhcpIp(
									dhcpServer,
									serverPort,
									connections,
									portConfigs,
								);
								if (ip) {
									upsertPortConfig.mutate({
										deviceId: clientId,
										portNumber: clientPort,
										ipAddress: ip,
									});
								}
							}
						}

						/* Auto-set port role when connecting to cloud/internet */
						const cloudDev =
							devA?.deviceType === "cloud"
								? devA
								: devB?.deviceType === "cloud"
									? devB
									: null;
						if (cloudDev) {
							const otherDevId =
								cloudDev.id === selectedPort.deviceId
									? deviceId
									: selectedPort.deviceId;
							const otherPort =
								cloudDev.id === selectedPort.deviceId
									? portNumber
									: selectedPort.portNumber;
							const otherDev = devices.find((d) => d.id === otherDevId);
							const otherCaps = otherDev
								? DEVICE_CAPABILITIES[otherDev.deviceType as DeviceType]
								: null;
							/* Only auto-assign uplink on L3 devices (router, firewall, etc.) */
							if (otherCaps && otherCaps.layer === 3) {
								upsertPortConfig.mutate({
									deviceId: otherDevId,
									portNumber: otherPort,
									portRole: "uplink",
								});
							}
						}
					},
				},
			);
			setSelectedPort(null);
		},
		[
			selectedPort,
			connections,
			addConnection,
			workspaceId,
			devices,
			portConfigs,
			upsertPortConfig,
		],
	);

	/* ── Port config handler ── */
	const handleUpdatePortConfig = useCallback(
		(config: {
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
		}) => {
			upsertPortConfig.mutate(config);
		},
		[upsertPortConfig],
	);

	/* ── Disconnect handler ── */
	const handleDisconnect = useCallback(
		(connectionId: string) => {
			deleteConnection.mutate({ id: connectionId });
		},
		[deleteConnection],
	);

	/* ── Auth guard ── */
	if (!session?.user) {
		return (
			<div className="flex items-center justify-center h-full bg-(--app-bg) text-(--app-text-muted)">
				Please sign in to access this workspace.
			</div>
		);
	}

	if (workspaceQuery.isLoading) {
		return (
			<div className="flex items-center justify-center h-full bg-(--app-bg)">
				<div className="animate-pulse text-(--app-text-muted)">
					Loading workspace…
				</div>
			</div>
		);
	}

	const workspace = workspaceQuery.data;

	if (!workspace) {
		return (
			<div className="flex items-center justify-center h-full bg-(--app-bg) text-red-400">
				Workspace not found
			</div>
		);
	}

	return (
		<div className="flex h-full overflow-hidden">
			{/* Sidebar */}
			<WorkspaceSidebar
				devices={devices}
				connections={connections}
				selectedDeviceId={selectedDeviceId}
				selectedPort={selectedPort}
				onAddDevice={(name, portCount, color, deviceType) => {
					const offset = devices.length * 30;
					addDevice.mutate({
						workspaceId,
						name,
						portCount,
						color,
						deviceType: deviceType as DeviceType,
						positionX: 100 + offset,
						positionY: 100 + offset,
					});
				}}
				onDeleteDevice={(id) => deleteDevice.mutate({ id })}
				onUpdateDevice={(id, fields) => updateDevice.mutate({ id, ...fields })}
				onDeviceSelect={setSelectedDeviceId}
				onPortClick={handlePortClick}
				onDeleteConnection={(id) => deleteConnection.mutate({ id })}
				onWifiConnect={(clientDeviceId, hostDeviceId) => {
					addConnection.mutate(
						{
							workspaceId,
							deviceAId: clientDeviceId,
							portA: 0,
							deviceBId: hostDeviceId,
							portB: 0,
							connectionType: "wifi",
						},
						{
							onSuccess: () => {
								/* Auto-assign DHCP IP to the client (WiFi port 0) */
								const hostDev = devices.find((d) => d.id === hostDeviceId);
								if (hostDev) {
									const ip = getNextDhcpIp(
										hostDev,
										0,
										connections,
										portConfigs,
									);
									if (ip) {
										upsertPortConfig.mutate({
											deviceId: clientDeviceId,
											portNumber: 0,
											ipAddress: ip,
										});
									}
								}
							},
						},
					);
				}}
				portConfigs={portConfigs}
				searchQuery={searchQuery}
				onSearchChange={setSearchQuery}
			/>

			{/* Main area */}
			<div className="flex-1 flex flex-col overflow-hidden">
				{/* Tab bar */}
				<div className="flex items-center gap-1 px-4 py-2 bg-(--app-surface-alt) border-b border-(--app-border)">
					<div className="text-sm font-bold text-(--app-text) mr-3 flex items-center gap-2">
						<Cable size={14} className="text-cyan-400" />
						{editingWorkspaceName ? (
							<form
								className="flex items-center gap-1"
								onSubmit={(e) => {
									e.preventDefault();
									const trimmed = workspaceNameDraft.trim();
									if (trimmed && trimmed !== workspace.name) {
										updateWorkspace.mutate({ id: workspaceId, name: trimmed });
									} else {
										setEditingWorkspaceName(false);
									}
								}}
							>
								<input
									ref={wsNameInputRef}
									value={workspaceNameDraft}
									onChange={(e) => setWorkspaceNameDraft(e.target.value)}
									className="bg-(--app-input-bg) border border-(--app-border) rounded px-1.5 py-0.5 text-sm text-(--app-text) w-40 focus:outline-none focus:ring-1 focus:ring-cyan-400"
									onKeyDown={(e) => {
										if (e.key === "Escape") setEditingWorkspaceName(false);
									}}
								/>
								<button
									type="submit"
									className="text-green-400 hover:text-green-300 p-0.5"
									title="Save"
								>
									<Check size={14} />
								</button>
								<button
									type="button"
									className="text-(--app-text-muted) hover:text-(--app-text) p-0.5"
									onClick={() => setEditingWorkspaceName(false)}
									title="Cancel"
								>
									<X size={14} />
								</button>
							</form>
						) : (
							<span
								className="cursor-pointer hover:underline decoration-dotted underline-offset-2 flex items-center gap-1.5 group"
								onDoubleClick={() => {
									setWorkspaceNameDraft(workspace.name);
									setEditingWorkspaceName(true);
									setTimeout(() => wsNameInputRef.current?.select(), 0);
								}}
								title="Double-click to rename"
							>
								{workspace.name}
								<Pencil
									size={11}
									className="opacity-0 group-hover:opacity-50 transition-opacity"
								/>
							</span>
						)}
					</div>
					<button
						type="button"
						className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
							activeTab === "topology"
								? "bg-(--app-surface-hover) text-white"
								: "text-(--app-text-muted) hover:text-white"
						}`}
						onClick={() => setActiveTab("topology")}
					>
						<Network size={12} /> Topology
					</button>
					<button
						type="button"
						className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
							activeTab === "connections"
								? "bg-(--app-surface-hover) text-white"
								: "text-(--app-text-muted) hover:text-white"
						}`}
						onClick={() => setActiveTab("connections")}
					>
						<Table2 size={12} /> Connections ({connections.length})
					</button>
					<button
						type="button"
						className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
							activeTab === "insights"
								? "bg-(--app-surface-hover) text-white"
								: "text-(--app-text-muted) hover:text-white"
						}`}
						onClick={() => setActiveTab("insights")}
					>
						<Lightbulb size={12} /> Insights
					</button>
				</div>

				{/* Content */}
				{activeTab === "topology" ? (
					<TopologyCanvas
						devices={devices}
						connections={connections}
						portConfigs={portConfigs}
						annotations={annotations}
						selectedPort={selectedPort}
						onPortClick={handlePortClick}
						onDeviceMove={(id, x, y) =>
							moveDevice.mutate({
								id,
								positionX: x,
								positionY: y,
							})
						}
						onDeviceSelect={setSelectedDeviceId}
						selectedDeviceId={selectedDeviceId}
						onUpdatePortConfig={handleUpdatePortConfig}
						onDisconnect={handleDisconnect}
						onUpdateDevice={(id, fields) =>
							updateDevice.mutate({ id, ...fields })
						}
						onDeleteDevice={(id) => deleteDevice.mutate({ id })}
						onAddAnnotation={(ann) =>
							createAnnotation.mutate({ workspaceId, ...ann })
						}
						onUpdateAnnotation={(id, fields) =>
							updateAnnotation.mutate({ id, ...fields })
						}
						onDeleteAnnotation={(id) => deleteAnnotation.mutate({ id })}
					/>
				) : activeTab === "connections" ? (
					<div className="flex-1 overflow-auto bg-(--app-bg) p-4">
						<ConnectionsTable
							connections={connections}
							devices={devices}
							portConfigs={portConfigs}
							onDelete={(id) => deleteConnection.mutate({ id })}
							highlightedConnectionId={highlightedConnectionId}
							onHighlight={setHighlightedConnectionId}
							searchQuery={searchQuery}
						/>
					</div>
				) : (
					<NetworkInsights
						devices={devices}
						connections={connections}
						portConfigs={portConfigs}
					/>
				)}
			</div>
		</div>
	);
}
