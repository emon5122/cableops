import { useTRPC } from "@/integrations/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/share/$shareToken" as never)({
	component: SharedWorkspaceResolver,
});

function SharedWorkspaceResolver() {
	const params = Route.useParams() as { shareToken: string };
	const shareToken = params.shareToken;
	const navigate = useNavigate();
	const trpc = useTRPC();

	const shareQuery = useQuery(
		trpc.workspaces.resolveShare.queryOptions({ token: shareToken }),
	);

	useEffect(() => {
		if (!shareQuery.isSuccess) return;
		const resolved = shareQuery.data;
		if (!resolved?.workspaceId) return;
		void navigate({
			to: "/workspace/$workspaceId",
			params: { workspaceId: resolved.workspaceId },
			replace: true,
		});
	}, [shareQuery.isSuccess, shareQuery.data, navigate]);

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
