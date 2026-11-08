import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useTRPC } from "@/integrations/trpc/react";
import { authClient } from "@/lib/auth-client";
import { rememberShareRedirect, resolveShareFlow } from "@/lib/share-flow";

export const Route = createFileRoute("/share/$shareToken" as never)({
	component: SharedWorkspaceResolver,
});

function SharedWorkspaceResolver() {
	const params = Route.useParams() as { shareToken: string };
	const shareToken = params.shareToken;
	const navigate = useNavigate();
	const trpc = useTRPC();
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const joinedRef = useRef(false);

	const shareQuery = useQuery(
		trpc.workspaces.resolveShare.queryOptions({ token: shareToken }),
	);

	const joinViaShare = useMutation(
		trpc.workspaces.joinViaShare.mutationOptions(),
	);

	useEffect(() => {
		if (!shareQuery.isSuccess) return;
		const resolved = shareQuery.data;
		if (!resolved?.workspaceId) return;

		// Auto-join signed-in users as workspace members
		if (session?.user && !joinedRef.current) {
			joinedRef.current = true;
			joinViaShare.mutate(
				{ token: shareToken },
				{
					onSettled: () => {
						void navigate({
							to: "/workspace/$workspaceId",
							params: { workspaceId: resolved.workspaceId },
							replace: true,
						});
					},
				},
			);
			return;
		}
	}, [
		shareQuery.isSuccess,
		shareQuery.data,
		navigate,
		session?.user,
		joinViaShare,
	]);

	const flow = resolveShareFlow({
		sessionPending,
		signedIn: !!session?.user,
		linkLoading: shareQuery.isLoading,
		linkValid: !!shareQuery.data,
	});

	useEffect(() => {
		if (flow.kind === "sign-in-required") {
			rememberShareRedirect(`/share/${shareToken}`);
		}
	}, [flow.kind, shareToken]);

	if (flow.kind === "resolving") {
		return (
			<div className="h-full flex items-center justify-center bg-(--app-bg) text-(--app-text-muted)">
				Resolving shared workspace…
			</div>
		);
	}

	if (flow.kind === "invalid" || !shareQuery.data) {
		return (
			<div className="h-full flex items-center justify-center bg-(--app-bg) text-red-400">
				Invalid or expired share link
			</div>
		);
	}

	if (flow.kind === "sign-in-required") {
		return (
			<div className="h-full flex flex-col items-center justify-center gap-3 bg-(--app-bg) text-(--app-text-muted)">
				<p>
					Sign in to open the shared workspace {shareQuery.data.workspaceName}.
				</p>
				<div className="flex gap-3">
					<Link to="/auth/sign-in" className="text-cyan-400 hover:underline">
						Sign in
					</Link>
					<Link to="/auth/sign-up" className="text-cyan-400 hover:underline">
						Create account
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full flex items-center justify-center bg-(--app-bg) text-(--app-text-muted)">
			Opening workspace {shareQuery.data.workspaceName}…
		</div>
	);
}
