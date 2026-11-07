import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ChevronLeft, Lock, Map as MapIcon, Network } from "lucide-react";
import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTRPC } from "@/integrations/trpc/react";
import { authClient } from "@/lib/auth-client";
import {
	WORKSPACE_LINK_TYPE_LABELS,
	type WorkspaceLinkType,
} from "@/lib/workspace-links";

export const Route = createFileRoute("/sites")({ component: SiteMapPage });

const NODE_W = 220;
const NODE_H = 84;
const POSITIONS_KEY = "cableops-site-map-positions";

const LINK_TYPE_COLORS: Record<WorkspaceLinkType, string> = {
	wired: "#22d3ee",
	wifi: "#38bdf8",
	vpn: "#a78bfa",
	tunnel: "#fbbf24",
	wan: "#34d399",
};

const ROLE_STYLE: Record<
	"owner" | "collaborator" | "viewer" | "linked" | "locked",
	{ color: string; label: string }
> = {
	owner: { color: "#0891b2", label: "Owner" },
	collaborator: { color: "#059669", label: "Collaborator" },
	viewer: { color: "#475569", label: "Viewer" },
	linked: { color: "#7c3aed", label: "Linked" },
	locked: { color: "#334155", label: "No access" },
};

type Pos = { x: number; y: number };

/** Place nodes on a circle (a row for one or two). */
function defaultLayout(keys: string[]): Record<string, Pos> {
	const out: Record<string, Pos> = {};
	const n = keys.length;
	if (n <= 2) {
		keys.forEach((k, i) => {
			out[k] = { x: 80 + i * (NODE_W + 160), y: 120 };
		});
		return out;
	}
	const r = Math.max(200, (n * (NODE_W + 40)) / (2 * Math.PI));
	keys.forEach((k, i) => {
		const a = (2 * Math.PI * i) / n - Math.PI / 2;
		out[k] = {
			x: Math.round(r + 80 + r * Math.cos(a)),
			y: Math.round(r + 60 + r * Math.sin(a)),
		};
	});
	return out;
}

function loadSavedPositions(): Record<string, Pos> {
	try {
		const raw = window.localStorage.getItem(POSITIONS_KEY);
		return raw ? (JSON.parse(raw) as Record<string, Pos>) : {};
	} catch {
		return {};
	}
}

function savePositions(pos: Record<string, Pos>) {
	try {
		window.localStorage.setItem(POSITIONS_KEY, JSON.stringify(pos));
	} catch {
		/* storage unavailable: positions just reset next visit */
	}
}

function SiteMapPage() {
	const { data: session, isPending: authLoading } = authClient.useSession();
	const trpc = useTRPC();
	const navigate = useNavigate();
	const siteMapQuery = useQuery({
		...trpc.workspaceLinks.siteMap.queryOptions(),
		enabled: !!session?.user,
	});
	const nodes = siteMapQuery.data?.nodes ?? [];
	const edges = siteMapQuery.data?.edges ?? [];

	/* ── Positions: saved (per browser) or a default circle ── */
	const [positions, setPositions] = useState<Record<string, Pos>>({});
	const nodeKeys = useMemo(() => nodes.map((n) => n.key), [nodes]);
	useEffect(() => {
		if (nodeKeys.length === 0) return;
		const saved = loadSavedPositions();
		const defaults = defaultLayout(nodeKeys);
		setPositions((prev) => {
			const next: Record<string, Pos> = {};
			for (const k of nodeKeys) {
				const p = prev[k] ?? saved[k] ?? defaults[k];
				if (p) next[k] = p;
			}
			return next;
		});
	}, [nodeKeys]);

	/* ── Drag (a click without movement opens the workspace) ── */
	const dragRef = useRef<{
		key: string;
		startX: number;
		startY: number;
		orig: Pos;
		moved: boolean;
	} | null>(null);
	const onPointerMove = useCallback((e: PointerEvent) => {
		const d = dragRef.current;
		if (!d) return;
		const dx = e.clientX - d.startX;
		const dy = e.clientY - d.startY;
		if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
		setPositions((prev) => ({
			...prev,
			[d.key]: {
				x: Math.max(0, d.orig.x + dx),
				y: Math.max(0, d.orig.y + dy),
			},
		}));
	}, []);
	const onPointerUp = useCallback(() => {
		const d = dragRef.current;
		dragRef.current = null;
		window.removeEventListener("pointermove", onPointerMove);
		if (!d) return;
		if (d.moved) {
			setPositions((prev) => {
				savePositions(prev);
				return prev;
			});
			return;
		}
		const node = siteMapQuery.data?.nodes.find((n) => n.key === d.key);
		if (node?.workspaceId) {
			void navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: node.workspaceId },
			});
		}
	}, [navigate, onPointerMove, siteMapQuery.data]);
	useEffect(
		() => () => window.removeEventListener("pointermove", onPointerMove),
		[onPointerMove],
	);

	const startDrag = (key: string, e: ReactPointerEvent) => {
		const orig = positions[key];
		if (!orig) return;
		dragRef.current = {
			key,
			startX: e.clientX,
			startY: e.clientY,
			orig,
			moved: false,
		};
		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp, { once: true });
	};

	const canvasSize = useMemo(() => {
		let w = 0;
		let h = 0;
		for (const p of Object.values(positions)) {
			w = Math.max(w, p.x + NODE_W + 80);
			h = Math.max(h, p.y + NODE_H + 80);
		}
		return { w, h };
	}, [positions]);

	if (authLoading) {
		return (
			<div className="flex items-center justify-center h-full bg-(--app-bg) text-(--app-text-muted) animate-pulse">
				Loading…
			</div>
		);
	}

	if (!session?.user) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-3 bg-(--app-bg) text-(--app-text-muted) text-sm">
				<MapIcon size={28} className="text-cyan-400" />
				Sign in to see the map of your workspaces.
				<Link to="/auth/sign-in" className="text-cyan-400 hover:underline">
					Sign in
				</Link>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="flex items-center gap-2 px-3 lg:px-4 py-2 bg-(--app-surface-alt) border-b border-(--app-border) min-h-10">
				<Link
					to="/"
					className="p-1.5 rounded-md text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover)"
					title="Back to workspaces"
				>
					<ChevronLeft size={14} />
				</Link>
				<MapIcon size={14} className="text-cyan-400" />
				<h2 className="text-sm font-bold text-(--app-text)">Site map</h2>
				<span className="text-[11px] text-(--app-text-muted) hidden sm:inline">
					{nodes.length} workspace{nodes.length === 1 ? "" : "s"} ·{" "}
					{edges.reduce((sum, e) => sum + e.count, 0)} cross-link
					{edges.reduce((sum, e) => sum + e.count, 0) === 1 ? "" : "s"}
				</span>
				<div className="ml-auto flex items-center gap-3 text-[10px] text-(--app-text-muted)">
					{(Object.keys(LINK_TYPE_COLORS) as WorkspaceLinkType[]).map((t) => (
						<span key={t} className="hidden md:flex items-center gap-1">
							<span
								className="w-3 h-0.5 rounded"
								style={{ background: LINK_TYPE_COLORS[t] }}
							/>
							{WORKSPACE_LINK_TYPE_LABELS[t]}
						</span>
					))}
				</div>
			</div>

			<div
				className="relative flex-1 overflow-auto"
				style={{
					background: "var(--app-bg)",
					backgroundImage:
						"radial-gradient(circle, var(--app-canvas-dot) 1px, transparent 1px)",
					backgroundSize: "24px 24px",
				}}
			>
				{siteMapQuery.isLoading ? (
					<div className="p-6 text-sm text-(--app-text-muted) animate-pulse">
						Loading site map…
					</div>
				) : nodes.length === 0 ? (
					<div className="p-6 text-sm text-(--app-text-muted)">
						No workspaces yet.{" "}
						<Link to="/" className="text-cyan-400 hover:underline">
							Create one
						</Link>
						, then right-click a port and choose "Link to another workspace".
					</div>
				) : (
					<div
						className="relative"
						style={{
							width: canvasSize.w,
							height: canvasSize.h,
							minWidth: "100%",
							minHeight: "100%",
						}}
					>
						{/* Edges */}
						<svg
							className="absolute inset-0 pointer-events-none"
							width={canvasSize.w}
							height={canvasSize.h}
							aria-hidden="true"
						>
							{edges.map((e) => {
								const a = positions[e.source];
								const b = positions[e.target];
								if (!a || !b) return null;
								const x1 = a.x + NODE_W / 2;
								const y1 = a.y + NODE_H / 2;
								const x2 = b.x + NODE_W / 2;
								const y2 = b.y + NODE_H / 2;
								const mx = (x1 + x2) / 2;
								const my = (y1 + y2) / 2;
								const bend = Math.min(80, Math.hypot(x2 - x1, y2 - y1) / 6);
								const color = LINK_TYPE_COLORS[e.types[0] ?? "wired"];
								const dashed = e.types.every(
									(t) => t === "vpn" || t === "tunnel",
								);
								return (
									<g key={e.key}>
										<path
											d={`M ${x1} ${y1} Q ${mx} ${my - bend} ${x2} ${y2}`}
											stroke={color}
											strokeOpacity={0.25}
											strokeWidth={8}
											fill="none"
										/>
										<path
											d={`M ${x1} ${y1} Q ${mx} ${my - bend} ${x2} ${y2}`}
											stroke={color}
											strokeWidth={2.5}
											strokeDasharray={dashed ? "8 6" : undefined}
											fill="none"
										/>
									</g>
								);
							})}
						</svg>

						{/* Edge labels */}
						{edges.map((e) => {
							const a = positions[e.source];
							const b = positions[e.target];
							if (!a || !b) return null;
							const x1 = a.x + NODE_W / 2;
							const y1 = a.y + NODE_H / 2;
							const x2 = b.x + NODE_W / 2;
							const y2 = b.y + NODE_H / 2;
							const bend = Math.min(80, Math.hypot(x2 - x1, y2 - y1) / 6);
							return (
								<div
									key={`label-${e.key}`}
									className="absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-(--app-surface) border border-(--app-border) text-(--app-text) whitespace-nowrap shadow"
									style={{ left: (x1 + x2) / 2, top: (y1 + y2) / 2 - bend / 2 }}
								>
									{e.count} link{e.count === 1 ? "" : "s"} ·{" "}
									{e.types.map((t) => WORKSPACE_LINK_TYPE_LABELS[t]).join(", ")}
								</div>
							);
						})}

						{/* Nodes */}
						{nodes.map((n) => {
							const p = positions[n.key];
							if (!p) return null;
							const style = ROLE_STYLE[n.role];
							const locked = n.role === "locked";
							return (
								<motion.div
									key={n.key}
									className="absolute select-none"
									style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
									initial={{ opacity: 0, scale: 0.98 }}
									animate={{ opacity: 1, scale: 1 }}
									whileHover={{ y: -1 }}
									transition={{ duration: 0.15 }}
								>
									<button
										type="button"
										className={`w-full h-full text-left rounded-xl border-2 shadow-lg shadow-black/30 overflow-hidden cursor-grab active:cursor-grabbing ${
											locked
												? "border-dashed border-(--app-border)"
												: "border-(--app-border) hover:border-white/40"
										}`}
										style={{ background: "var(--app-surface)" }}
										onPointerDown={(e) => startDrag(n.key, e)}
										onKeyDown={(e) => {
											if (e.key === "Enter" && n.workspaceId) {
												void navigate({
													to: "/workspace/$workspaceId",
													params: { workspaceId: n.workspaceId },
												});
											}
										}}
										title={
											locked
												? "A workspace linked to yours that you cannot view"
												: `Open ${n.name} (drag to move)`
										}
									>
										<div
											className="px-3 py-2 flex items-center gap-2 text-white"
											style={{ backgroundColor: style.color }}
										>
											{locked ? <Lock size={14} /> : <Network size={14} />}
											<span className="text-sm font-bold truncate">
												{n.name}
											</span>
										</div>
										<div className="px-3 py-1.5 flex items-center justify-between text-[11px] text-(--app-text-muted)">
											<span>
												{locked
													? "No access"
													: `${n.deviceCount} device${n.deviceCount === 1 ? "" : "s"}`}
											</span>
											<span className="uppercase tracking-wider text-[9px]">
												{style.label}
											</span>
										</div>
									</button>
								</motion.div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
