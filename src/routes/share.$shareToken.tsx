import { useTRPC } from "@/integrations/trpc/react";
import { authClient } from "@/lib/auth-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

export const Route = createFileRoute("/share/$shareToken" as never)({
	component: SharedWorkspaceResolver,
});

function SharedWorkspaceResolver() {
	const params = Route.useParams() as { shareToken: string };
	const shareToken = params.shareToken;
	const navigate = useNavigate();
	const trpc = useTRPC();
	const { data: session } = authClient.useSession();
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

		// Anonymous users just redirect
		if (!session?.user) {
			void navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: resolved.workspaceId },
				replace: true,
			});
		}
	}, [shareQuery.isSuccess, shareQuery.data, navigate, session?.user, joinViaShare]);

	if (shareQuery.isLoading) {
		return (
			<div className="h-full flex items-center justify-center bg-(--app-bg) text-(--app-text-muted)">
				Resolving shared workspace…
			</div>
		);
	}

	if (!shareQuery.data) {
		return (
			<div className="h-full flex items-center justify-center bg-(--app-bg) text-red-400">
				Invalid or expired share link
			</div>
		);
	}

	return (
		<div className="h-full flex items-center justify-center bg-(--app-bg) text-(--app-text-muted)">
			Opening workspace {shareQuery.data.workspaceName}…
		</div>
	);
}
