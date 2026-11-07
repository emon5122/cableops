import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/integrations/trpc/react";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/settings/tokens")({
	component: ApiTokensPage,
});

type ScopeChoice = "read" | "read+import";
const EXPIRY_CHOICES = [
	{ label: "Never", days: null },
	{ label: "7 days", days: 7 },
	{ label: "30 days", days: 30 },
	{ label: "90 days", days: 90 },
	{ label: "1 year", days: 365 },
] as const;

const selectClass =
	"h-9 w-full rounded-md border border-(--app-input-border) bg-(--app-input-bg) px-3 text-sm text-(--app-text)";

function formatDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	return new Date(value).toLocaleString();
}

function CopyButton({ text, label }: { text: string; label: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			className="border-(--app-border) text-(--app-text) hover:bg-(--app-surface-hover) gap-1.5 shrink-0"
			onClick={() => {
				void navigator.clipboard.writeText(text).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				});
			}}
		>
			{copied ? <Check size={13} /> : <Copy size={13} />}
			<span className="text-xs">{copied ? "Copied" : label}</span>
		</Button>
	);
}

function ApiTokensPage() {
	const { data: session, isPending: authLoading } = authClient.useSession();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [scope, setScope] = useState<ScopeChoice>("read");
	const [expiryIdx, setExpiryIdx] = useState(2);
	const fieldId = useId();
	const [created, setCreated] = useState<{
		name: string;
		token: string;
	} | null>(null);

	const tokensQuery = useQuery({
		...trpc.apiTokens.list.queryOptions(),
		enabled: !!session?.user,
	});
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: trpc.apiTokens.list.queryKey() });

	const createToken = useMutation(
		trpc.apiTokens.create.mutationOptions({
			onSuccess: (row) => {
				setCreated({ name: row.name, token: row.token });
				setName("");
				void invalidate();
			},
		}),
	);
	const revokeToken = useMutation(
		trpc.apiTokens.revoke.mutationOptions({
			onSuccess: () => void invalidate(),
		}),
	);

	if (authLoading) {
		return (
			<div className="h-full flex items-center justify-center bg-(--app-bg)">
				<div className="animate-pulse text-(--app-text-muted)">Loading…</div>
			</div>
		);
	}
	if (!session?.user) {
		return (
			<div className="h-full flex flex-col items-center justify-center gap-3 bg-(--app-bg)">
				<p className="text-sm text-(--app-text-muted)">
					Sign in to manage API tokens.
				</p>
				<Link to="/auth/sign-in">
					<Button
						size="sm"
						className="bg-cyan-600 hover:bg-cyan-700 text-white"
					>
						Sign in
					</Button>
				</Link>
			</div>
		);
	}

	const origin = typeof window === "undefined" ? "" : window.location.origin;
	const mcpUrl = `${origin}/api/mcp`;
	const tokens = tokensQuery.data ?? [];

	return (
		<div className="h-full overflow-y-auto bg-(--app-bg) p-4 lg:p-6">
			<div className="max-w-3xl mx-auto flex flex-col gap-6">
				<div>
					<h2 className="text-xl lg:text-2xl font-bold text-(--app-text) flex items-center gap-2">
						<KeyRound size={20} className="text-cyan-400" /> API tokens
					</h2>
					<p className="text-xs lg:text-sm text-(--app-text-muted) mt-1">
						Tokens let agents and the <code>cableops</code> CLI read your
						workspaces without a browser session. A token acts as you, limited
						to its scope, and only sees workspaces you own or have joined.
					</p>
				</div>

				{/* MCP connection info */}
				<section className="bg-(--app-surface) border border-(--app-border) rounded-xl p-4 flex flex-col gap-2">
					<h3 className="text-sm font-bold text-(--app-text) flex items-center gap-2">
						<Bot size={15} className="text-cyan-400" /> MCP endpoint
					</h3>
					<div className="flex items-center gap-2">
						<code className="flex-1 truncate text-xs bg-(--app-bg) border border-(--app-border) rounded-md px-2 py-1.5 text-(--app-text)">
							{mcpUrl}
						</code>
						<CopyButton text={mcpUrl} label="Copy" />
					</div>
					<p className="text-[11px] text-(--app-text-muted)">
						Streamable HTTP transport. Send{" "}
						<code>Authorization: Bearer &lt;token&gt;</code>. Tools:
						list_workspaces, get_snapshot, analyze, find_path.
					</p>
				</section>

				{/* Newly created token — shown once */}
				{created && (
					<section className="border border-emerald-500/40 bg-emerald-500/10 rounded-xl p-4 flex flex-col gap-2">
						<h3 className="text-sm font-bold text-emerald-400">
							Token “{created.name}” created
						</h3>
						<p className="text-xs text-(--app-text)">
							Copy it now. It is shown only once and cannot be recovered; only a
							hash is stored.
						</p>
						<div className="flex items-center gap-2">
							<code className="flex-1 break-all text-xs bg-(--app-bg) border border-(--app-border) rounded-md px-2 py-1.5 text-(--app-text)">
								{created.token}
							</code>
							<CopyButton text={created.token} label="Copy token" />
						</div>
						<div className="flex justify-end">
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="text-(--app-text-muted) hover:text-(--app-text)"
								onClick={() => setCreated(null)}
							>
								Done
							</Button>
						</div>
					</section>
				)}

				{/* Create form */}
				<section className="bg-(--app-surface) border border-(--app-border) rounded-xl p-4">
					<h3 className="text-sm font-bold text-(--app-text) mb-3">
						New token
					</h3>
					<form
						className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
						onSubmit={(e) => {
							e.preventDefault();
							if (!name.trim()) return;
							createToken.mutate({
								name: name.trim(),
								scopes: scope === "read" ? ["read"] : ["read", "write:import"],
								expiresInDays: EXPIRY_CHOICES[expiryIdx]?.days ?? null,
							});
						}}
					>
						<div className="flex flex-col gap-1.5">
							<Label
								htmlFor={`${fieldId}-name`}
								className="text-xs text-(--app-text-muted)"
							>
								Name
							</Label>
							<Input
								id={`${fieldId}-name`}
								value={name}
								maxLength={64}
								onChange={(e) => setName(e.target.value)}
								placeholder="e.g. claude-code laptop"
								className="bg-(--app-bg) border-(--app-border) text-(--app-text)"
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label
								htmlFor={`${fieldId}-scope`}
								className="text-xs text-(--app-text-muted)"
							>
								Scope
							</Label>
							<select
								id={`${fieldId}-scope`}
								className={selectClass}
								value={scope}
								onChange={(e) => setScope(e.target.value as ScopeChoice)}
							>
								<option value="read">read</option>
								<option value="read+import">read + write:import</option>
							</select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label
								htmlFor={`${fieldId}-expiry`}
								className="text-xs text-(--app-text-muted)"
							>
								Expires
							</Label>
							<select
								id={`${fieldId}-expiry`}
								className={selectClass}
								value={expiryIdx}
								onChange={(e) => setExpiryIdx(Number(e.target.value))}
							>
								{EXPIRY_CHOICES.map((c, i) => (
									<option key={c.label} value={i}>
										{c.label}
									</option>
								))}
							</select>
						</div>
						<div className="sm:col-span-3 flex items-center justify-between gap-3">
							<p className="text-[11px] text-(--app-text-muted)">
								write:import is reserved for upcoming write tools; no tool uses
								it yet.
							</p>
							<Button
								type="submit"
								size="sm"
								disabled={createToken.isPending || !name.trim()}
								className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0"
							>
								Create token
							</Button>
						</div>
						{createToken.error && (
							<p className="sm:col-span-3 text-xs text-red-400">
								{createToken.error.message}
							</p>
						)}
					</form>
				</section>

				{/* Token list */}
				<section className="bg-(--app-surface) border border-(--app-border) rounded-xl overflow-hidden">
					<div className="px-4 py-3 border-b border-(--app-border)">
						<h3 className="text-sm font-bold text-(--app-text)">Your tokens</h3>
					</div>
					{tokensQuery.isLoading && (
						<p className="p-4 text-sm text-(--app-text-muted) animate-pulse">
							Loading…
						</p>
					)}
					{!tokensQuery.isLoading && tokens.length === 0 && (
						<p className="p-4 text-sm text-(--app-text-muted)">
							No tokens yet.
						</p>
					)}
					<ul className="divide-y divide-(--app-border)">
						{tokens.map((t) => (
							<li key={t.id} className="px-4 py-3 flex items-start gap-3">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<span className="text-sm font-medium text-(--app-text) truncate">
											{t.name}
										</span>
										<code className="text-[11px] text-(--app-text-muted)">
											{t.prefix}…
										</code>
										{t.scopes.map((s) => (
											<span
												key={s}
												className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/15 text-cyan-400"
											>
												{s}
											</span>
										))}
										{t.state !== "active" && (
											<span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400">
												{t.state}
											</span>
										)}
									</div>
									<p className="text-[11px] text-(--app-text-muted) mt-1">
										Created {formatDate(t.createdAt)} · Last used{" "}
										{formatDate(t.lastUsedAt)} · Expires{" "}
										{t.expiresAt ? formatDate(t.expiresAt) : "never"}
									</p>
								</div>
								{t.state === "active" && (
									<Button
										type="button"
										size="sm"
										variant="ghost"
										disabled={revokeToken.isPending}
										className="text-red-400 hover:text-red-300 hover:bg-red-500/15 gap-1.5 shrink-0"
										onClick={() => {
											if (
												window.confirm(
													`Revoke token “${t.name}”? Agents using it stop working.`,
												)
											) {
												revokeToken.mutate({ id: t.id });
											}
										}}
									>
										<Trash2 size={13} />
										<span className="text-xs">Revoke</span>
									</Button>
								)}
							</li>
						))}
					</ul>
				</section>
			</div>
		</div>
	);
}
