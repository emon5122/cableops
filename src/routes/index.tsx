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
			<div className="min-h-full flex items-center justify-center bg-(--app-bg) p-6">
				<motion.div
					className="max-w-lg text-center"
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.28, ease: "easeOut" }}
				>
					<div className="flex items-center justify-center gap-3 mb-6">
						<motion.div
							animate={{ rotate: [0, -3, 3, 0] }}
							transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, repeatDelay: 4 }}
						>
							<Cable className="text-cyan-400" size={48} />
						</motion.div>
						<h1 className="text-4xl font-black text-(--app-text)">CableOps</h1>
					</div>
					<p className="text-(--app-text-muted) text-lg mb-2">
						Ethernet Cable Connection Manager
					</p>
					<p className="text-(--app-text-muted) text-sm mb-8 max-w-md mx-auto">
						Visualize, plan, and document your network cable topology.
						Drag-and-drop devices, connect ports, and keep track of every
						connection.
					</p>
					<div className="flex items-center justify-center gap-4">
						<Link to="/auth/sign-in">
							<Button className="bg-cyan-600 hover:bg-cyan-700 text-white px-6">
								Sign In
							</Button>
						</Link>
						<Link to="/auth/sign-up">
							<Button
								variant="outline"
								className="border-(--app-border) text-(--app-text) hover:bg-(--app-surface-hover) px-6"
							>
								Create Account
							</Button>
						</Link>
					</div>

					{/* Feature cards */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12">
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
		<div className="min-h-full bg-(--app-bg) p-6">
			<div className="max-w-4xl mx-auto">
				<div className="flex items-center justify-between mb-8">
					<div>
						<h2 className="text-2xl font-bold text-(--app-text)">Workspaces</h2>
						<p className="text-sm text-(--app-text-muted) mt-1">
							Each workspace contains its own device topology
						</p>
					</div>
					<div className="flex items-center gap-2">
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
							className="border-(--app-border) text-(--app-text) hover:bg-(--app-surface-hover)"
						>
							Import JSON
						</Button>
					</div>
				</div>

				{/* Create workspace */}
				<form
					className="flex gap-2 mb-8"
					onSubmit={(e) => {
						e.preventDefault();
						if (!newName.trim()) return;
						createWorkspace.mutate({
							name: newName.trim(),
							ownerId: userId,
						});
					}}
				>
					<Input
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						placeholder="New workspace name…"
						className="bg-(--app-surface) border-(--app-border) text-(--app-text) flex-1"
					/>
					<Button
						type="submit"
						disabled={createWorkspace.isPending}
						className="bg-cyan-600 hover:bg-cyan-700 text-white"
					>
						<Plus size={16} />
						Create
					</Button>
				</form>

				{/* Workspace cards */}
				{workspacesQuery.isLoading && (
					<div className="text-(--app-text-muted) text-sm animate-pulse">
						Loading workspaces…
					</div>
				)}

				{workspaces.length === 0 && !workspacesQuery.isLoading && (
					<motion.div
						className="text-center py-16"
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.24 }}
					>
						<Network
							size={48}
							className="mx-auto text-(--app-text-muted) opacity-30 mb-4"
						/>
						<p className="text-(--app-text-muted)">
							No workspaces yet. Create one to get started!
						</p>
					</motion.div>
				)}

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
