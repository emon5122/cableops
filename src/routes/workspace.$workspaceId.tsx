import TopologyCanvas from "@/components/topology/TopologyCanvas";
import ConnectionsTable from "@/components/workspace/ConnectionsTable";
import NetworkInsights from "@/components/workspace/NetworkInsights";
import WorkspaceSidebar from "@/components/workspace/WorkspaceSidebar";
import { useTRPC } from "@/integrations/trpc/react";
import { authClient } from "@/lib/auth-client";
import type {
    ConnectionRow,
    DeviceType,
    InterfaceRow,
    RouteRow,
} from "@/lib/topology-types";
import {
    DEVICE_CAPABILITIES,
    getNetworkSegment,
    getNextDhcpIp,
    isPortConnected,
} from "@/lib/topology-types";
import { safeParseWorkspaceSnapshot } from "@/lib/workspace-snapshot-schema";
import {
    useMutation,
    useQueries,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
    Cable,
    Check,
    ChevronLeft,
    ClipboardCheck,
    Copy,
    Download,
    Eye,
    Lightbulb,
    Link2,
    Menu,
    Network,
    Pencil,
    Presentation,
    Settings,
    Share2,
    Table2,
    Trash2,
    Upload,
    UserPlus,
    Users,
    X
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

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
	const importFileInputRef = useRef<HTMLInputElement>(null);
	const [isLiveSyncEnabled, setIsLiveSyncEnabled] = useState(true);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const liveRefetchInterval: number | false = isLiveSyncEnabled ? 2000 : false;
	const [sharePopoverOpen, setSharePopoverOpen] = useState(false);
	const [shareCopied, setShareCopied] = useState(false);
	const [managePanelOpen, setManagePanelOpen] = useState(false);

	/* ── Permission query ── */
	const permissionQuery = useQuery({
		...trpc.workspaces.getPermission.queryOptions({ workspaceId }),
		refetchInterval: liveRefetchInterval,
	});
	const permission = permissionQuery.data?.permission ?? "viewer";
	const workspaceMode = permissionQuery.data?.mode ?? "presentation";
	const canEdit = permission === "owner" || permission === "collaborator";
	const isOwner = permission === "owner";

	/* ── Queries ── */
	const workspaceQuery = useQuery({
		...trpc.workspaces.get.queryOptions({ id: workspaceId }),
		refetchInterval: liveRefetchInterval,
		refetchIntervalInBackground: true,
		refetchOnWindowFocus: true,
	});
	const devicesQuery = useQuery({
		...trpc.devices.list.queryOptions({ workspaceId }),
		refetchInterval: liveRefetchInterval,
		refetchIntervalInBackground: true,
		refetchOnWindowFocus: true,
	});
	const connectionsQuery = useQuery({
		...trpc.connections.list.queryOptions({ workspaceId }),
		refetchInterval: liveRefetchInterval,
		refetchIntervalInBackground: true,
		refetchOnWindowFocus: true,
	});
	const annotationsQuery = useQuery({
		...trpc.annotations.list.queryOptions({ workspaceId }),
		refetchInterval: liveRefetchInterval,
		refetchIntervalInBackground: true,
		refetchOnWindowFocus: true,
	});

	const devices = devicesQuery.data ?? [];
	const connections = connectionsQuery.data ?? [];
	const annotations = annotationsQuery.data ?? [];

	/* ── Interfaces (per-port config including IP, DHCP, WiFi, NAT) ── */
	const interfaceQueries = useQueries({
		queries: devices.map((d) => ({
			...trpc.interfaces.list.queryOptions({ deviceId: d.id }),
			refetchInterval: liveRefetchInterval,
			refetchIntervalInBackground: true,
			refetchOnWindowFocus: true,
		})),
	});
	const routeQueries = useQueries({
		queries: devices.map((d) => ({
			...trpc.routes.list.queryOptions({ deviceId: d.id }),
			refetchInterval: liveRefetchInterval,
			refetchIntervalInBackground: true,
			refetchOnWindowFocus: true,
		})),
	});

	const portConfigs = useMemo<InterfaceRow[]>(() => {
		const all: InterfaceRow[] = [];
		for (const q of interfaceQueries) {
			if (q.data) all.push(...q.data);
		}
		return all;
	}, [interfaceQueries]);

	const routes = useMemo<RouteRow[]>(() => {
		const all: RouteRow[] = [];
		for (const q of routeQueries) {
			if (q.data) all.push(...q.data);
		}
		return all;
	}, [routeQueries]);

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
			void queryClient.invalidateQueries({
				queryKey: trpc.routes.list.queryKey({ deviceId: d.id }),
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
	const createShare = useMutation(
		trpc.workspaces.createShare.mutationOptions(),
	);
	const setWorkspaceMode = useMutation(
		trpc.workspaces.setMode.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.workspaces.getPermission.queryKey({ workspaceId }),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.workspaces.get.queryKey({ id: workspaceId }),
				});
			},
		}),
	);
	const importSnapshot = useMutation(
		trpc.workspaces.importSnapshot.mutationOptions({ onSuccess: invalidateAll }),
	);

	/* ── Members & Shares queries (for manage panel) ── */
	const membersQuery = useQuery({
		...trpc.workspaces.listMembers.queryOptions({ workspaceId }),
		enabled: isOwner && managePanelOpen,
	});
	const sharesQuery = useQuery({
		...trpc.workspaces.listShares.queryOptions({ workspaceId }),
		enabled: isOwner && managePanelOpen,
	});
	const removeMember = useMutation(
		trpc.workspaces.removeMember.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.workspaces.listMembers.queryKey({ workspaceId }),
				});
			},
		}),
	);
	const deleteShare = useMutation(
		trpc.workspaces.deleteShare.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.workspaces.listShares.queryKey({ workspaceId }),
				});
			},
		}),
	);

	const tryAssignDhcpToClient = useCallback(
		(
			clientDeviceId: string,
			clientPortNumber: number,
			nextConnections: ConnectionRow[],
		): boolean => {
			const existingClientIp = portConfigs.find(
				(pc) =>
					pc.deviceId === clientDeviceId &&
					pc.portNumber === clientPortNumber &&
					!!pc.ipAddress,
			);
			if (existingClientIp) return false;

			const segment = getNetworkSegment(
				clientDeviceId,
				clientPortNumber,
				nextConnections,
				devices,
				portConfigs,
			);

			const dhcpCandidates = segment.ports
				.map((sp) => {
					const host = devices.find((d) => d.id === sp.deviceId);
					if (!host) return null;
					const iface = portConfigs.find(
						(pc) => pc.deviceId === sp.deviceId && pc.portNumber === sp.portNumber,
					);
					if (
						!iface?.dhcpEnabled ||
						!iface.dhcpRangeStart ||
						!iface.dhcpRangeEnd
					)
						return null;

					const caps = DEVICE_CAPABILITIES[host.deviceType as DeviceType];
					const priority = caps?.canBeGateway ? 0 : 1;
					return {
						host,
						hostPort: sp.portNumber,
						priority,
					};
				})
				.filter(
					(v): v is { host: (typeof devices)[number]; hostPort: number; priority: number } =>
						Boolean(v),
				)
				.sort((a, b) => a.priority - b.priority);

			for (const candidate of dhcpCandidates) {
				const ip = getNextDhcpIp(
					candidate.host,
					candidate.hostPort,
					nextConnections,
					portConfigs,
				);
				if (!ip) continue;

				upsertPortConfig.mutate({
					deviceId: clientDeviceId,
					portNumber: clientPortNumber,
					ipAddress: ip,
				});
				return true;
			}

			return false;
		},
		[devices, portConfigs, upsertPortConfig],
	);

	/* ── Port click (connect flow) ── */
	const handlePortClick = useCallback(
		(deviceId: string, portNumber: number) => {
			if (!canEdit) return;
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
			const selectedIsVirtualWifi = selectedPort.portNumber === 0;
			const targetIsVirtualWifi = portNumber === 0;

			/* Never allow WiFi virtual interface to connect directly to physical ports */
			if (selectedIsVirtualWifi !== targetIsVirtualWifi) {
				setSelectedPort({ deviceId, portNumber });
				return;
			}

			const isWifi =
				(selectedIsVirtualWifi && targetIsVirtualWifi) &&
				((capsA?.wifiHost && capsB?.wifiClient) ||
					(capsB?.wifiHost && capsA?.wifiClient));

			/* Virtual WiFi ports must form a valid host<->client WiFi connection */
			if (selectedIsVirtualWifi && targetIsVirtualWifi && !isWifi) {
				setSelectedPort({ deviceId, portNumber });
				return;
			}

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
						const pendingConnection = {
							id: `pending-${Date.now()}`,
							workspaceId,
							deviceAId: selectedPort.deviceId,
							portA: selectedPort.portNumber,
							deviceBId: deviceId,
							portB: portNumber,
							speed: null,
							connectionType: isWifi ? "wifi" : "wired",
							createdAt: new Date() as unknown as ConnectionRow["createdAt"],
						} as ConnectionRow;
						const nextConnections = [...connections, pendingConnection];

						const maybeAssignClient = (id: string, pNum: number) => {
							const dev = devices.find((d) => d.id === id);
							if (!dev) return;
							const caps = DEVICE_CAPABILITIES[dev.deviceType as DeviceType];
							const isClientLike =
								caps.layer === "endpoint" || caps.wifiClient;
							if (!isClientLike) return;
							tryAssignDhcpToClient(id, pNum, nextConnections);
						};

						maybeAssignClient(selectedPort.deviceId, selectedPort.portNumber);
						maybeAssignClient(deviceId, portNumber);

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
			tryAssignDhcpToClient,
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

	const handleExportJson = useCallback(async () => {
		try {
			const snapshot = await queryClient.fetchQuery(
				trpc.workspaces.exportSnapshot.queryOptions({ workspaceId }),
			);
			const json = JSON.stringify(snapshot, null, 2);
			const blob = new Blob([json], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${workspaceQuery.data?.name ?? "workspace"}-snapshot.json`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("Export failed", error);
		}
	}, [queryClient, trpc, workspaceId, workspaceQuery.data?.name]);

	const handleImportJsonFile = useCallback(
		async (file: File) => {
			try {
				const text = await file.text();
				const parsed = JSON.parse(text) as unknown;
				const snapshotResult = safeParseWorkspaceSnapshot(parsed);
				if (!snapshotResult.success) {
					console.error("Import failed: invalid snapshot schema", snapshotResult.error.format());
					return;
				}
				importSnapshot.mutate({
					workspaceId,
					snapshot: snapshotResult.data,
				});
			} catch (error) {
				console.error("Import failed", error);
			}
		},
		[importSnapshot, workspaceId],
	);

	const [shareUrl, setShareUrl] = useState<string | null>(null);

	const handleShareWorkspace = useCallback(async () => {
		if (!session?.user?.id) return;
		try {
			const share = await createShare.mutateAsync({
				workspaceId,
			});
			const url = `${window.location.origin}/share/${share.token}`;
			setShareUrl(url);
			setSharePopoverOpen(true);
			setShareCopied(false);
			await navigator.clipboard.writeText(url);
			setShareCopied(true);
			setTimeout(() => setShareCopied(false), 2000);
		} catch (error) {
			console.error("Share creation failed", error);
		}
	}, [createShare, session?.user?.id, workspaceId]);

	const handleCopyShareUrl = useCallback(async () => {
		if (!shareUrl) return;
		await navigator.clipboard.writeText(shareUrl);
		setShareCopied(true);
		setTimeout(() => setShareCopied(false), 2000);
	}, [shareUrl]);

	/* ── No auth guard — anyone can view ── */

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
			<input
				ref={importFileInputRef}
				type="file"
				accept="application/json"
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) void handleImportJsonFile(file);
					e.currentTarget.value = "";
				}}
			/>

			{/* Sidebar */}
			<div className={`shrink-0 transition-all duration-200 ease-in-out overflow-hidden ${sidebarOpen ? "w-72 xl:w-80" : "w-0"}`}>
			<WorkspaceSidebar
				devices={devices}
				connections={connections}
				selectedDeviceId={selectedDeviceId}
				selectedPort={selectedPort}
				onAddDevice={(name, portCount, color, deviceType) => {
					if (!canEdit) return;
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
				onDeleteDevice={(id) => { if (!canEdit) return; deleteDevice.mutate({ id }); }}
				onUpdateDevice={(id, fields) => { if (!canEdit) return; updateDevice.mutate({ id, ...fields }); }}
				onDeviceSelect={setSelectedDeviceId}
				onPortClick={handlePortClick}
				onDeleteConnection={(id) => { if (!canEdit) return; deleteConnection.mutate({ id }); }}
				onWifiConnect={(clientDeviceId, hostDeviceId) => {
					if (!canEdit) return;
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
								const pendingConnection = {
									id: `pending-${Date.now()}`,
									workspaceId,
									deviceAId: clientDeviceId,
									portA: 0,
									deviceBId: hostDeviceId,
									portB: 0,
									speed: null,
									connectionType: "wifi",
									createdAt: new Date() as unknown as ConnectionRow["createdAt"],
								} as ConnectionRow;
								const nextConnections = [...connections, pendingConnection];
								tryAssignDhcpToClient(clientDeviceId, 0, nextConnections);
							},
						},
					);
				}}
				portConfigs={portConfigs}
				searchQuery={searchQuery}
				onSearchChange={setSearchQuery}
			/>
			</div>

			{/* Main area */}
			<div className="flex-1 flex flex-col overflow-hidden">
				{/* Tab bar */}
				<div className="flex items-center gap-1 px-2 lg:px-4 py-1.5 lg:py-2 bg-(--app-surface-alt) border-b border-(--app-border) min-h-10">
					{/* Sidebar toggle */}
					<button
						type="button"
						className="p-1.5 rounded-md text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover) transition-colors shrink-0 mr-1"
						onClick={() => setSidebarOpen((v) => !v)}
						title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
					>
						{sidebarOpen ? <ChevronLeft size={14} /> : <Menu size={14} />}
					</button>
					<div className="text-sm font-bold text-(--app-text) mr-2 lg:mr-3 flex items-center gap-1.5 lg:gap-2 shrink-0 max-w-40 xl:max-w-64">
						<Cable size={14} className="text-cyan-400 shrink-0" />
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
					{/* View tabs */}
					<div className="flex items-center gap-0.5 shrink-0">
						{([
							{ key: "topology" as const, icon: Network, label: "Topology" },
							{ key: "connections" as const, icon: Table2, label: `Links (${connections.length})` },
							{ key: "insights" as const, icon: Lightbulb, label: "Insights" },
						] as const).map((t) => (
							<motion.button
								key={t.key}
								type="button"
								className={`px-2 xl:px-3 py-1 text-[11px] xl:text-xs font-semibold rounded-md transition-colors flex items-center gap-1 xl:gap-1.5 ${
									activeTab === t.key
										? "bg-(--app-surface-hover) text-white"
										: "text-(--app-text-muted) hover:text-white"
								}`}
								onClick={() => setActiveTab(t.key)}
								whileTap={{ scale: 0.96 }}
							>
								<t.icon size={12} />
								<span className="hidden sm:inline">{t.label}</span>
							</motion.button>
						))}
					</div>

					{/* Actions */}
					<div className="ml-auto flex items-center gap-0.5 lg:gap-1">
						{/* Viewer badge for non-editors */}
						{!canEdit && (
							<span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 flex items-center gap-1 mr-1">
								<Eye size={10} />
								Viewing
							</span>
						)}

						{/* Sign-in prompt for anonymous users */}
						{!session?.user && (
							<Link
								to="/auth/sign-up"
								className="p-1.5 lg:px-2 lg:py-1 text-xs rounded-md text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 flex items-center gap-1 transition-colors border border-cyan-500/20"
								title="Sign up to own this workspace and collaborate"
							>
								<UserPlus size={13} />
								<span className="hidden lg:inline">Sign up</span>
							</Link>
						)}

						<button
							type="button"
							className="p-1.5 lg:px-2 lg:py-1 text-xs rounded-md text-(--app-text-muted) hover:text-white hover:bg-(--app-surface-hover) flex items-center gap-1 transition-colors"
							onClick={handleExportJson}
							title="Export workspace JSON"
						>
							<Download size={13} />
							<span className="hidden xl:inline">Export</span>
						</button>

						{/* Import — only for editors */}
						{canEdit && (
							<button
								type="button"
								className="p-1.5 lg:px-2 lg:py-1 text-xs rounded-md text-(--app-text-muted) hover:text-white hover:bg-(--app-surface-hover) flex items-center gap-1 transition-colors"
								onClick={() => importFileInputRef.current?.click()}
								title="Import JSON into this workspace (replaces current content)"
							>
								<Upload size={13} />
								<span className="hidden xl:inline">Import</span>
							</button>
						)}

						{/* Share — only for owner */}
						{isOwner && (
							<div className="relative">
								<button
									type="button"
									className="p-1.5 lg:px-2 lg:py-1 text-xs rounded-md text-(--app-text-muted) hover:text-white hover:bg-(--app-surface-hover) flex items-center gap-1 transition-colors"
									onClick={() => {
										void handleShareWorkspace();
									}}
									title="Create/copy share URL"
								>
									<Share2 size={13} />
									<span className="hidden xl:inline">Share</span>
								</button>

								{/* Share popover showing the URL */}
								{sharePopoverOpen && shareUrl && (
									<div className="absolute right-0 top-full mt-1.5 z-50 bg-(--app-surface) border border-(--app-border) rounded-lg shadow-lg p-3 w-80">
										<div className="flex items-center justify-between mb-2">
											<span className="text-xs font-semibold text-(--app-text)">Share Link</span>
											<button
												type="button"
												className="text-(--app-text-muted) hover:text-(--app-text) p-0.5"
												onClick={() => setSharePopoverOpen(false)}
											>
												<X size={12} />
											</button>
										</div>
										<div className="flex items-center gap-1.5">
											<input
												type="text"
												readOnly
												value={shareUrl}
												className="flex-1 bg-(--app-bg) border border-(--app-border) rounded px-2 py-1 text-[11px] text-(--app-text) select-all focus:outline-none focus:ring-1 focus:ring-cyan-400"
												onClick={(e) => (e.target as HTMLInputElement).select()}
											/>
											<button
												type="button"
												className={`p-1.5 rounded-md transition-colors ${
													shareCopied
														? "text-green-400 bg-green-500/10"
														: "text-(--app-text-muted) hover:text-white hover:bg-(--app-surface-hover)"
												}`}
												onClick={() => void handleCopyShareUrl()}
												title={shareCopied ? "Copied!" : "Copy link"}
											>
												{shareCopied ? <ClipboardCheck size={14} /> : <Copy size={14} />}
											</button>
										</div>
										{shareCopied && (
											<p className="text-[10px] text-green-400 mt-1.5">Link copied to clipboard!</p>
										)}
									</div>
								)}
							</div>
						)}

						{/* Mode toggle — only for owner */}
						{isOwner && (
							<button
								type="button"
								className={`p-1.5 lg:px-2 lg:py-1 text-xs rounded-md flex items-center gap-1 transition-colors ${
									workspaceMode === "collaboration"
										? "text-emerald-300 bg-emerald-500/10"
										: "text-amber-300 bg-amber-500/10"
								}`}
								onClick={() => {
									const newMode = workspaceMode === "presentation" ? "collaboration" : "presentation";
									setWorkspaceMode.mutate({ workspaceId, mode: newMode });
								}}
								title={workspaceMode === "presentation"
									? "Presentation mode — only you can edit. Click to enable collaboration."
									: "Collaboration mode — shared users can edit. Click to switch to presentation."
								}
							>
								{workspaceMode === "collaboration" ? <Users size={13} /> : <Presentation size={13} />}
								<span className="hidden lg:inline">
									{workspaceMode === "collaboration" ? "Collab" : "Presenting"}
								</span>
							</button>
						)}

						{/* Manage workspace — only for owner */}
						{isOwner && (
							<button
								type="button"
								className="p-1.5 lg:px-2 lg:py-1 text-xs rounded-md text-(--app-text-muted) hover:text-white hover:bg-(--app-surface-hover) flex items-center gap-1 transition-colors"
								onClick={() => setManagePanelOpen((v) => !v)}
								title="Manage members & share links"
							>
								<Settings size={13} />
								<span className="hidden lg:inline">Manage</span>
							</button>
						)}

						{/* Live sync toggle */}
						<button
							type="button"
							className={`p-1.5 lg:px-2 lg:py-1 text-xs rounded-md flex items-center gap-1 transition-colors ${
								isLiveSyncEnabled
									? "text-emerald-300 bg-emerald-500/10"
									: "text-(--app-text-muted) hover:text-white hover:bg-(--app-surface-hover)"
							}`}
							onClick={() => setIsLiveSyncEnabled((v) => !v)}
							title="Toggle multi-collaborator live sync"
						>
							<Network size={13} />
							<span className="hidden lg:inline">{isLiveSyncEnabled ? "Live" : "Paused"}</span>
						</button>
					</div>
				</div>

				{/* Content */}
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={activeTab}
						className="flex-1 min-h-0 overflow-hidden flex flex-col"
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.16, ease: "easeOut" }}
					>
						{activeTab === "topology" ? (
							<TopologyCanvas
								devices={devices}
								connections={connections}
								portConfigs={portConfigs}
								annotations={annotations}
								selectedPort={selectedPort}
								onPortClick={handlePortClick}
								onDeviceMove={(id, x, y) => {
									if (!canEdit) return;
									moveDevice.mutate({
										id,
										positionX: x,
										positionY: y,
									});
								}}
								onDeviceSelect={setSelectedDeviceId}
								selectedDeviceId={selectedDeviceId}
								onUpdatePortConfig={handleUpdatePortConfig}
								onDisconnect={handleDisconnect}
							onUpdateDevice={(id, fields) => {
								if (!canEdit) return;
								updateDevice.mutate({ id, ...fields });
							}}
							onDeleteDevice={(id) => { if (!canEdit) return; deleteDevice.mutate({ id }); }}
							onAddAnnotation={(ann) => {
								if (!canEdit) return;
								createAnnotation.mutate({ workspaceId, ...ann });
							}}
							onUpdateAnnotation={(id, fields) => {
								if (!canEdit) return;
								updateAnnotation.mutate({ id, ...fields });
							}}
							onDeleteAnnotation={(id) => { if (!canEdit) return; deleteAnnotation.mutate({ id }); }}
							/>
						) : activeTab === "connections" ? (
							<div className="flex-1 h-full overflow-auto bg-(--app-bg) p-3 lg:p-4">
								<ConnectionsTable
									connections={connections}
									devices={devices}
									portConfigs={portConfigs}
									onDelete={(id) => { if (!canEdit) return; deleteConnection.mutate({ id }); }}
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
								routes={routes}
							/>
						)}
					</motion.div>
				</AnimatePresence>
			</div>

			{/* ── Manage Panel (owner-only slide-out) ── */}
			<AnimatePresence>
				{managePanelOpen && isOwner && (
					<motion.div
						className="fixed inset-0 z-50 flex justify-end"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
					>
						{/* Backdrop */}
						<div
							className="absolute inset-0 bg-black/40"
							onClick={() => setManagePanelOpen(false)}
							onKeyDown={() => {}}
						/>
						{/* Panel */}
						<motion.div
							className="relative w-full max-w-sm bg-(--app-surface) border-l border-(--app-border) shadow-2xl overflow-y-auto"
							initial={{ x: "100%" }}
							animate={{ x: 0 }}
							exit={{ x: "100%" }}
							transition={{ type: "spring", damping: 28, stiffness: 300 }}
						>
							<div className="sticky top-0 bg-(--app-surface) border-b border-(--app-border) px-4 py-3 flex items-center justify-between z-10">
								<h3 className="text-sm font-bold text-(--app-text)">Manage Workspace</h3>
								<button
									type="button"
									className="p-1 rounded text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover)"
									onClick={() => setManagePanelOpen(false)}
								>
									<X size={16} />
								</button>
							</div>

							{/* Members Section */}
							<div className="px-4 py-3 border-b border-(--app-border)">
								<h4 className="text-xs font-semibold text-(--app-text) mb-2 flex items-center gap-1.5">
									<Users size={12} />
									Members ({membersQuery.data?.length ?? 0})
								</h4>
								{membersQuery.isLoading ? (
									<p className="text-xs text-(--app-text-muted) animate-pulse">Loading…</p>
								) : (membersQuery.data?.length ?? 0) === 0 ? (
									<p className="text-xs text-(--app-text-muted)">No members yet. Share this workspace to invite others.</p>
								) : (
									<div className="space-y-2">
										{membersQuery.data?.map((m) => (
											<div key={m.id} className="flex items-center justify-between bg-(--app-bg) rounded-lg px-3 py-2">
												<div className="min-w-0">
													<p className="text-xs font-medium text-(--app-text) truncate">{m.userName}</p>
													<p className="text-[10px] text-(--app-text-muted) truncate">{m.userEmail}</p>
												</div>
												<button
													type="button"
													className="shrink-0 ml-2 p-1 rounded text-(--app-text-muted) hover:text-red-400 hover:bg-red-500/10 transition-colors"
													onClick={() => removeMember.mutate({ workspaceId, memberId: m.id })}
													title="Remove member"
												>
													<Trash2 size={12} />
												</button>
											</div>
										))}
									</div>
								)}
							</div>

							{/* Share Links Section */}
							<div className="px-4 py-3">
								<h4 className="text-xs font-semibold text-(--app-text) mb-2 flex items-center gap-1.5">
									<Link2 size={12} />
									Share Links ({sharesQuery.data?.length ?? 0})
								</h4>
								{sharesQuery.isLoading ? (
									<p className="text-xs text-(--app-text-muted) animate-pulse">Loading…</p>
								) : (sharesQuery.data?.length ?? 0) === 0 ? (
									<p className="text-xs text-(--app-text-muted)">No share links created yet.</p>
								) : (
									<div className="space-y-2">
										{sharesQuery.data?.map((s) => (
											<div key={s.id} className="flex items-center justify-between bg-(--app-bg) rounded-lg px-3 py-2">
												<div className="min-w-0">
													<p className="text-xs font-mono text-(--app-text) truncate">
														/share/{s.token.slice(0, 8)}…
													</p>
													<p className="text-[10px] text-(--app-text-muted)">
														Created {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "recently"}
													</p>
												</div>
												<button
													type="button"
													className="shrink-0 ml-2 p-1 rounded text-(--app-text-muted) hover:text-red-400 hover:bg-red-500/10 transition-colors"
													onClick={() => deleteShare.mutate({ shareId: s.id })}
													title="Revoke share link"
												>
													<Trash2 size={12} />
												</button>
											</div>
										))}
									</div>
								)}
							</div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
