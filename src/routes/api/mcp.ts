import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/db";
import { handleMcpRequest } from "@/server/mcp";

/** Remote MCP endpoint for agents — Authorization: Bearer cops_… (scope: read) */
export const Route = createFileRoute("/api/mcp")({
	server: {
		handlers: {
			GET: ({ request }) => handleMcpRequest(request, { db }),
			POST: ({ request }) => handleMcpRequest(request, { db }),
			DELETE: ({ request }) => handleMcpRequest(request, { db }),
		},
	},
});
