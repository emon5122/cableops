import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/integrations/trpc/react";
import { authClient } from "@/lib/auth-client";
import { safeParseWorkspaceSnapshot } from "@/lib/workspace-snapshot-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Cable, Folder, Network, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
	const { data: session, isPending: authLoading } = authClient.useSession();
	const [newName, setNewName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const importInputRef = useRef<HTMLInputElement | null>(null);
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const userId = session?.user?.id ?? "";

	const workspacesQuery = useQuery(
		trpc.workspaces.list.queryOptions(
			{ ownerId: userId },
			{ enabled: !!userId },
		),
	);

	const createWorkspace = useMutation(
		trpc.workspaces.create.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.workspaces.list.queryKey({ ownerId: userId }),
				});
				setNewName("");
			},
		}),
	);

	const deleteWorkspace = useMutation(
		trpc.workspaces.delete.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.workspaces.list.queryKey({ ownerId: userId }),
				});
			},
		}),
	);

	const importSnapshot = useMutation(
		trpc.workspaces.importSnapshot.mutationOptions(),
	);

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
				queryKey: trpc.workspaces.list.queryKey({ ownerId: userId }),
			});

			void navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: createdWorkspace.id },
			});
		} catch (error) {
			console.error("Import failed", error);
		}
	};

	/* ── Not signed in ── */
	if (!authLoading && !session?.user) {
		return (
			<div className="min-h-full flex items-center justify-center bg-(--app-bg) p-4 lg:p-6">
				<motion.div
					className="max-w-lg text-center w-full"
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.28, ease: "easeOut" }}
				>
					<div className="flex items-center justify-center gap-2 lg:gap-3 mb-4 lg:mb-6">
						<motion.div
							animate={{ rotate: [0, -3, 3, 0] }}
							transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, repeatDelay: 4 }}
						>
							<Cable className="text-cyan-400" size={40} />
						</motion.div>
						<h1 className="text-3xl lg:text-4xl font-black text-(--app-text)">CableOps</h1>
					</div>
					<p className="text-(--app-text-muted) text-base lg:text-lg mb-2">
						Ethernet Cable Connection Manager
					</p>
					<p className="text-(--app-text-muted) text-xs lg:text-sm mb-6 lg:mb-8 max-w-md mx-auto">
						Visualize, plan, and document your network cable topology.
						Drag-and-drop devices, connect ports, and keep track of every
						connection.
					</p>
					<div className="flex items-center justify-center gap-3">
						<Link to="/auth/sign-in">
							<Button className="bg-cyan-600 hover:bg-cyan-700 text-white px-5 lg:px-6 h-9 lg:h-10 rounded-lg">
								Sign In
							</Button>
						</Link>
						<Link to="/auth/sign-up">
							<Button
								variant="outline"
								className="border-(--app-border) text-(--app-text) hover:bg-(--app-surface-hover) px-5 lg:px-6 h-9 lg:h-10 rounded-lg"
							>
								Create Account
							</Button>
						</Link>
					</div>

					{/* Feature cards */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4 mt-8 lg:mt-12">
						<FeatureCard
							index={0}
							icon={<Network size={24} />}
							title="Visual Topology"
							desc="Drag-and-drop network devices on an interactive canvas"
						/>
						<FeatureCard
							index={1}
							icon={<Cable size={24} />}
							title="Port Management"
							desc="Connect ports with click-to-link, track aliases & VLANs"
						/>
						<FeatureCard
							index={2}
							icon={<Folder size={24} />}
							title="Workspaces"
							desc="Organize projects into separate workspaces"
						/>
					</div>
				</motion.div>
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

	/* ── Dashboard ── */
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
							<p className="text-xs text-(--app-text-muted) mb-3">
								Created{" "}
								{ws.createdAt
									? new Date(ws.createdAt).toLocaleDateString()
									: "recently"}
							</p>
							<Link
								to="/workspace/$workspaceId"
								params={{ workspaceId: ws.id }}
								className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
							>
								Open workspace <ArrowRight size={12} />
							</Link>
						</motion.div>
					))}
				</div>
			</div>
		</div>
	);
}

function FeatureCard({
	icon,
	title,
	desc,
	index = 0,
}: {
	icon: React.ReactNode;
	title: string;
	desc: string;
	index?: number;
}) {
	return (
		<motion.div
			className="bg-(--app-surface) border border-(--app-border) rounded-xl p-5 text-left"
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.22, delay: index * 0.04 }}
			whileHover={{ y: -2 }}
		>
			<div className="text-cyan-400 mb-3">{icon}</div>
			<h3 className="text-sm font-bold text-(--app-text) mb-1">{title}</h3>
			<p className="text-xs text-(--app-text-muted) leading-relaxed">{desc}</p>
		</motion.div>
	);
}
