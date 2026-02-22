import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/integrations/trpc/react";
import { authClient } from "@/lib/auth-client";
import { safeParseWorkspaceSnapshot } from "@/lib/workspace-snapshot-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Link2, Network, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const ANON_WORKSPACE_KEY = "cableops-workspace-id";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
	const { data: session, isPending: authLoading } = authClient.useSession();
	const [newName, setNewName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const importInputRef = useRef<HTMLInputElement | null>(null);
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [anonRedirecting, setAnonRedirecting] = useState(false);

	const userId = session?.user?.id ?? "";

	const workspacesQuery = useQuery({
		...trpc.workspaces.listOwned.queryOptions(),
		enabled: !!userId,
	});

	const createWorkspace = useMutation(
		trpc.workspaces.create.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.workspaces.listOwned.queryKey(),
				});
				setNewName("");
			},
		}),
	);

	const createAnonymousWorkspace = useMutation(
		trpc.workspaces.createAnonymous.mutationOptions(),
	);

	const claimOwnership = useMutation(
		trpc.workspaces.claimOwnership.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.workspaces.listOwned.queryKey(),
				});
			},
		}),
	);

	const deleteWorkspace = useMutation(
		trpc.workspaces.delete.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.workspaces.listOwned.queryKey(),
				});
			},
		}),
	);

	const importSnapshot = useMutation(
		trpc.workspaces.importSnapshot.mutationOptions(),
	);

	/* ── Anonymous user: auto-create workspace and redirect ── */
	useEffect(() => {
		if (authLoading || session?.user || anonRedirecting) return;

		// Check if there's already an anon workspace
		const existingId = localStorage.getItem(ANON_WORKSPACE_KEY);
		if (existingId) {
			setAnonRedirecting(true);
			void navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: existingId },
				replace: true,
			});
			return;
		}

		// Create new anonymous workspace
		setAnonRedirecting(true);
		createAnonymousWorkspace.mutate(
			{ name: "My Workspace" },
			{
				onSuccess: (ws) => {
					localStorage.setItem(ANON_WORKSPACE_KEY, ws.id);
					void navigate({
						to: "/workspace/$workspaceId",
						params: { workspaceId: ws.id },
						replace: true,
					});
				},
			},
		);
	}, [authLoading, session, anonRedirecting, navigate, createAnonymousWorkspace]);

	/* ── Signed-in user: claim localStorage workspace if one exists ── */
	useEffect(() => {
		if (authLoading || !session?.user) return;
		const anonId = localStorage.getItem(ANON_WORKSPACE_KEY);
		if (!anonId) return;

		// Attempt to claim and clear localStorage
		claimOwnership.mutate(
			{ workspaceId: anonId },
			{
				onSettled: () => {
					localStorage.removeItem(ANON_WORKSPACE_KEY);
				},
			},
		);
	}, [authLoading, session?.user?.id]);

	const handleImportWorkspaceJson = async (file: File) => {
		if (!userId) return;
		try {
			const text = await file.text();
			const parsed = JSON.parse(text) as unknown;
			const snapshotResult = safeParseWorkspaceSnapshot(parsed);
			if (!snapshotResult.success) {
				console.error("Import failed: invalid snapshot schema", snapshotResult.error.format());
				return;
			}
			const snapshot = snapshotResult.data;

			const importedName = snapshot.workspace.name?.trim();
			const createdWorkspace = await createWorkspace.mutateAsync({
				name: importedName && importedName.length > 0 ? importedName : "Imported workspace",
				ownerId: userId,
			});

			await importSnapshot.mutateAsync({
				workspaceId: createdWorkspace.id,
				snapshot,
			});

			await queryClient.invalidateQueries({
				queryKey: trpc.workspaces.listOwned.queryKey(),
			});

			void navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: createdWorkspace.id },
			});
		} catch (error) {
			console.error("Import failed", error);
		}
	};

	/* ── Not signed in — redirect is happening ── */
	if (!authLoading && !session?.user) {
		return (
			<div className="min-h-full flex items-center justify-center bg-(--app-bg)">
				<div className="animate-pulse text-(--app-text-muted)">Setting up your workspace…</div>
			</div>
		);
	}

	/* ── Loading ── */
	if (authLoading) {
		return (
			<div className="min-h-full flex items-center justify-center bg-(--app-bg)">
				<div className="animate-pulse text-(--app-text-muted)">Loading…</div>
			</div>
		);
	}

	/* ── Dashboard (signed in) ── */
	const workspaces = workspacesQuery.data ?? [];
	const isImportingWorkspace =
		createWorkspace.isPending || importSnapshot.isPending;

	return (
		<div className="min-h-full bg-(--app-bg) p-4 lg:p-6">
			<div className="max-w-5xl mx-auto">
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 lg:mb-8">
					<div>
						<h2 className="text-xl lg:text-2xl font-bold text-(--app-text)">Workspaces</h2>
						<p className="text-xs lg:text-sm text-(--app-text-muted) mt-0.5 lg:mt-1">
							Each workspace contains its own device topology
						</p>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						<input
							ref={importInputRef}
							type="file"
							accept="application/json,.json"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (file) {
									void handleImportWorkspaceJson(file);
								}
								e.currentTarget.value = "";
							}}
						/>
						<Button
							type="button"
							variant="outline"
							disabled={isImportingWorkspace}
							onClick={() => importInputRef.current?.click()}
							className="border-(--app-border) text-(--app-text) hover:bg-(--app-surface-hover) text-xs lg:text-sm"
						>
							Import JSON
						</Button>
					</div>
				</div>

				{/* Workspace cards */}
				{workspacesQuery.isLoading && (
					<div className="text-(--app-text-muted) text-sm animate-pulse">
						Loading workspaces…
					</div>
				)}

				<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
					{/* Create New Workspace Card */}
					{!workspacesQuery.isLoading && (
						<motion.div
							className={`bg-(--app-surface)/50 border-2 border-dashed border-(--app-border) rounded-xl p-4 transition-all flex flex-col justify-center min-h-30 ${
								isCreating
									? "border-cyan-500/50 bg-(--app-surface)"
									: "hover:border-cyan-500/50 hover:bg-(--app-surface) cursor-pointer items-center"
							}`}
							onClick={() => !isCreating && setIsCreating(true)}
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.2 }}
						>
							{isCreating ? (
								<form
									className="w-full flex flex-col gap-3"
									onSubmit={(e) => {
										e.preventDefault();
										if (!newName.trim()) return;
										createWorkspace.mutate({
											name: newName.trim(),
											ownerId: userId,
										});
										setIsCreating(false);
									}}
								>
									<Input
										autoFocus
										value={newName}
										onChange={(e) => setNewName(e.target.value)}
										placeholder="Workspace name…"
										className="bg-(--app-bg) border-(--app-border) text-(--app-text) w-full"
									/>
									<div className="flex gap-2 justify-end">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={(e) => {
												e.stopPropagation();
												setIsCreating(false);
												setNewName("");
											}}
											className="text-(--app-text-muted) hover:text-(--app-text)"
										>
											Cancel
										</Button>
										<Button
											type="submit"
											size="sm"
											disabled={createWorkspace.isPending || !newName.trim()}
											className="bg-cyan-600 hover:bg-cyan-700 text-white"
										>
											Create
										</Button>
									</div>
								</form>
							) : (
								<>
									<Plus size={24} className="text-cyan-400 mb-2" />
									<span className="text-sm font-medium text-(--app-text)">
										Create New Workspace
									</span>
								</>
							)}
						</motion.div>
					)}

					{workspaces.map((ws, index) => (
						<motion.div
							key={ws.id}
							className="bg-(--app-surface) border border-(--app-border) rounded-xl p-4 hover:border-cyan-500/30 transition-all group"
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.03 }}
							whileHover={{ y: -2, scale: 1.01 }}
							whileTap={{ scale: 0.995 }}
						>
							<div className="flex items-start justify-between mb-3">
								<div className="flex items-center gap-2">
									<Network size={18} className="text-cyan-400" />
									<h3 className="text-sm font-bold text-(--app-text)">
										{ws.name}
									</h3>
								</div>
								<button
									type="button"
									className="text-(--app-text-muted) hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
									onClick={() => deleteWorkspace.mutate({ id: ws.id })}
									title="Delete workspace"
								>
									<Trash2 size={14} />
								</button>
							</div>

							{/* Stats row: members + share links */}
							<div className="flex items-center gap-3 mb-3 text-[11px] text-(--app-text-muted)">
								<span className="flex items-center gap-1" title={`${ws.memberCount} member${ws.memberCount !== 1 ? "s" : ""}`}>
									<Users size={11} className="text-(--app-text-muted)" />
									{ws.memberCount} member{ws.memberCount !== 1 ? "s" : ""}
								</span>
								<span className="flex items-center gap-1" title={`${ws.shareCount} share link${ws.shareCount !== 1 ? "s" : ""}`}>
									<Link2 size={11} className="text-(--app-text-muted)" />
									{ws.shareCount} link{ws.shareCount !== 1 ? "s" : ""}
								</span>
								<span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium ${
									ws.mode === "collaboration"
										? "bg-emerald-500/15 text-emerald-400"
										: "bg-amber-500/15 text-amber-400"
								}`}>
									{ws.mode === "collaboration" ? "Collab" : "Presenting"}
								</span>
							</div>

							<p className="text-xs text-(--app-text-muted) mb-3">
								Created{" "}
								{ws.createdAt
									? new Date(ws.createdAt).toLocaleDateString()
									: "recently"}
							</p>

							<div className="flex items-center justify-between">
								<Link
									to="/workspace/$workspaceId"
									params={{ workspaceId: ws.id }}
									className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
								>
									Open workspace <ArrowRight size={12} />
								</Link>
							</div>
						</motion.div>
					))}
				</div>
			</div>
		</div>
	);
}
