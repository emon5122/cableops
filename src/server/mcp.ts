/**
 * Remote MCP server (streamable HTTP, stateless) for agents.
 *
 * Each POST builds a fresh McpServer bound to the authenticated token
 * principal and answers with plain JSON (no session, no SSE). GET is
 * authenticated and then answered with 405, as the spec allows for servers
 * that do not offer a server-initiated SSE stream.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	type CallToolResult,
	ErrorCode,
	McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import snapshotDocsMd from "../../docs/workspace-snapshot-schema.md?raw";
import snapshotSchemaJson from "../../public/schemas/workspace-snapshot.schema.json?raw";
import { AgentToolError, analyzeSnapshot, findPath } from "./agent-tools";
import type { Db } from "./db-type";
import {
	authenticateBearer,
	type FixedWindowRateLimiter,
	type TokenPrincipal,
} from "./token-auth";
import {
	getReadableWorkspace,
	listReadableWorkspaces,
} from "./workspace-access";
import { buildWorkspaceSnapshot } from "./workspace-snapshot";

declare const __APP_VERSION__: string | undefined;
const SERVER_VERSION =
	typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";

export const SNAPSHOT_SCHEMA_URI =
	"cableops://schemas/workspace-snapshot.schema.json";
export const SNAPSHOT_DOCS_URI = "cableops://docs/workspace-snapshot-schema.md";

const MAX_BODY_BYTES = 1024 * 1024;

function json(value: unknown): CallToolResult {
	return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function requireScope(
	principal: TokenPrincipal,
	scope: TokenPrincipal["scopes"][number],
) {
	if (!principal.scopes.includes(scope)) {
		throw new McpError(
			ErrorCode.InvalidRequest,
			`API token lacks the "${scope}" scope`,
		);
	}
}

async function readableSnapshot(
	db: Db,
	principal: TokenPrincipal,
	workspaceId: string,
) {
	requireScope(principal, "read");
	const ws = await getReadableWorkspace(db, principal.userId, workspaceId);
	if (!ws) {
		// Same message for "missing" and "not yours": do not leak existence
		throw new McpError(
			ErrorCode.InvalidParams,
			`Workspace "${workspaceId}" not found or not readable with this token (call list_workspaces)`,
		);
	}
	// Agents get the topology, never stored credentials (WiFi passwords)
	return buildWorkspaceSnapshot(db, workspaceId, principal.userId, {
		redactCredentials: true,
	});
}

function asParamsError(fn: () => CallToolResult): CallToolResult {
	try {
		return fn();
	} catch (error) {
		if (error instanceof AgentToolError) {
			throw new McpError(ErrorCode.InvalidParams, error.message);
		}
		throw error;
	}
}

const workspaceIdShape = {
	workspaceId: z.string().min(1).describe("Workspace id from list_workspaces"),
};

export function createCableOpsMcpServer(
	db: Db,
	principal: TokenPrincipal,
): McpServer {
	const server = new McpServer(
		{ name: "cableops", version: SERVER_VERSION },
		{
			instructions:
				"CableOps network topology (read-only). Start with list_workspaces, then get_snapshot / analyze / find_path with a workspaceId. The snapshot format is described by the cableops://schemas and cableops://docs resources.",
		},
	);
	const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

	server.registerTool(
		"list_workspaces",
		{
			title: "List workspaces",
			description:
				"Workspaces this token's user owns or is a member of, with their permission (owner | collaborator | viewer).",
			annotations: readOnly,
		},
		async () => {
			requireScope(principal, "read");
			const workspaces = await listReadableWorkspaces(db, principal.userId);
			return json({ workspaces });
		},
	);

	server.registerTool(
		"get_snapshot",
		{
			title: "Get workspace snapshot",
			description:
				"Full workspace snapshot (devices, interfaces, connections, routes, annotations): the same JSON as Export JSON in the UI. Schema: resource cableops://schemas/workspace-snapshot.schema.json.",
			inputSchema: workspaceIdShape,
			annotations: readOnly,
		},
		async ({ workspaceId }) =>
			json(await readableSnapshot(db, principal, workspaceId)),
	);

	server.registerTool(
		"analyze",
		{
			title: "Analyze network",
			description:
				"Network Insights for a workspace: errors/warnings (subnet mismatch, duplicate IP, missing gateway, forwarding, NAT, …) and the discovered L2 segments.",
			inputSchema: workspaceIdShape,
			annotations: readOnly,
		},
		async ({ workspaceId }) => {
			const snapshot = await readableSnapshot(db, principal, workspaceId);
			return json(analyzeSnapshot(snapshot));
		},
	);

	server.registerTool(
		"find_path",
		{
			title: "Find path between devices",
			description:
				"Physical cable path between two devices plus L2/L3 reachability in both directions (same engine as the canvas focus view). Devices are given by id or exact name (case-insensitive).",
			inputSchema: {
				...workspaceIdShape,
				fromDevice: z.string().min(1).describe("Source device id or name"),
				toDevice: z.string().min(1).describe("Destination device id or name"),
			},
			annotations: readOnly,
		},
		async ({ workspaceId, fromDevice, toDevice }) => {
			const snapshot = await readableSnapshot(db, principal, workspaceId);
			return asParamsError(() =>
				json(findPath(snapshot, fromDevice, toDevice)),
			);
		},
	);

	server.registerResource(
		"workspace-snapshot-schema",
		SNAPSHOT_SCHEMA_URI,
		{
			title: "Workspace snapshot JSON Schema",
			description:
				"JSON Schema (draft 2020-12) of get_snapshot output and Import JSON input",
			mimeType: "application/schema+json",
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: "application/schema+json",
					text: snapshotSchemaJson,
				},
			],
		}),
	);

	server.registerResource(
		"workspace-snapshot-docs",
		SNAPSHOT_DOCS_URI,
		{
			title: "Workspace snapshot format guide",
			description: "Human-readable guide to the snapshot format",
			mimeType: "text/markdown",
		},
		async (uri) => ({
			contents: [
				{ uri: uri.href, mimeType: "text/markdown", text: snapshotDocsMd },
			],
		}),
	);

	return server;
}

export interface McpHandlerOptions {
	db: Db;
	rateLimiter?: FixedWindowRateLimiter;
}

/** HTTP entry point for /api/mcp */
export async function handleMcpRequest(
	request: Request,
	{ db, rateLimiter }: McpHandlerOptions,
): Promise<Response> {
	const auth = await authenticateBearer(request, {
		db,
		requiredScope: "read",
		rateLimiter,
	});
	if (!auth.ok) return auth.response;

	if (request.method !== "POST") {
		return new Response(
			JSON.stringify({
				jsonrpc: "2.0",
				error: {
					code: -32000,
					message:
						"Method not allowed: this stateless MCP server only accepts POST",
				},
				id: null,
			}),
			{
				status: 405,
				headers: { allow: "POST", "content-type": "application/json" },
			},
		);
	}

	const server = createCableOpsMcpServer(db, auth.principal);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
		maxRequestBodySize: MAX_BODY_BYTES,
	});
	await server.connect(transport);
	try {
		return await transport.handleRequest(request);
	} finally {
		// JSON responses are fully built before handleRequest resolves
		void server.close();
	}
}
