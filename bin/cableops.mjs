#!/usr/bin/env node
/**
 * cableops — thin CLI over the CableOps MCP endpoint (no dependencies).
 *
 *   cableops workspaces [--json]
 *   cableops get <workspace id|name>        snapshot JSON to stdout
 *   cableops analyze <workspace id|name>    Network Insights JSON to stdout
 *
 * Env: CABLEOPS_TOKEN (required, an API token from Settings → API tokens)
 *      CABLEOPS_URL   (default https://cableops.nexisltd.com)
 *
 * The token is only ever sent in the Authorization header; it is never
 * printed, not even in errors.
 */
import { pathToFileURL } from "node:url";

export const DEFAULT_URL = "https://cableops.nexisltd.com";

export const USAGE = `Usage: cableops <command> [args]

Commands:
  workspaces [--json]         List workspaces the token can read
  get <workspace id|name>     Print the workspace snapshot JSON
  analyze <workspace id|name> Print Network Insights (issues + segments) JSON
  help                        Show this help

Environment:
  CABLEOPS_TOKEN  API token (create one at <CABLEOPS_URL>/settings/tokens)
  CABLEOPS_URL    Server URL (default ${DEFAULT_URL})`;

export class CliError extends Error {
	/** @param {string} message @param {number} [exitCode] */
	constructor(message, exitCode = 1) {
		super(message);
		this.exitCode = exitCode;
	}
}

/**
 * @param {string[]} argv arguments after the program name
 * @returns {{ command: "help" } | { command: "workspaces", json: boolean } | { command: "get" | "analyze", workspace: string }}
 */
export function parseArgs(argv) {
	const args = argv.filter((a) => a !== "");
	const [command, ...rest] = args;
	if (!command || command === "help" || command === "--help" || command === "-h") {
		return { command: "help" };
	}
	if (command === "workspaces" || command === "ws") {
		const unknown = rest.filter((a) => a !== "--json");
		if (unknown.length > 0) throw new CliError(`Unexpected argument: ${unknown[0]}\n\n${USAGE}`, 2);
		return { command: "workspaces", json: rest.includes("--json") };
	}
	if (command === "get" || command === "analyze") {
		if (rest.length !== 1) {
			throw new CliError(`"${command}" needs exactly one workspace id or name\n\n${USAGE}`, 2);
		}
		return { command, workspace: rest[0] };
	}
	throw new CliError(`Unknown command: ${command}\n\n${USAGE}`, 2);
}

/** @param {Record<string, string | undefined>} env */
export function resolveConfig(env) {
	const token = env.CABLEOPS_TOKEN?.trim();
	if (!token) {
		throw new CliError("CABLEOPS_TOKEN is not set (create a token at /settings/tokens)", 2);
	}
	const base = (env.CABLEOPS_URL?.trim() || DEFAULT_URL).replace(/\/+$/, "");
	let url;
	try {
		url = new URL(base);
	} catch {
		throw new CliError(`CABLEOPS_URL is not a valid URL: ${base}`, 2);
	}
	const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
	if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
		throw new CliError(
			"CABLEOPS_URL must be https:// (plain http is only allowed for localhost/127.0.0.1) so the token is never sent in clear text",
			2,
		);
	}
	return { token, endpoint: `${base}/api/mcp` };
}

/** Pull the JSON-RPC message out of a JSON or text/event-stream body */
function parseRpcBody(text, contentType) {
	if (contentType.includes("text/event-stream")) {
		const data = text
			.split(/\r?\n/)
			.filter((l) => l.startsWith("data:"))
			.map((l) => l.slice(5).trim())
			.filter(Boolean);
		for (const d of data) {
			const msg = JSON.parse(d);
			if (msg && (msg.result !== undefined || msg.error !== undefined)) return msg;
		}
		throw new CliError("Server sent no JSON-RPC response");
	}
	return JSON.parse(text);
}

/**
 * Call one MCP tool and return its parsed JSON payload.
 * @param {{ token: string, endpoint: string }} config
 * @param {string} name
 * @param {Record<string, unknown>} args
 * @param {typeof fetch} fetchImpl
 */
export async function callTool(config, name, args, fetchImpl = fetch) {
	let res;
	try {
		res = await fetchImpl(config.endpoint, {
			method: "POST",
			headers: {
				authorization: `Bearer ${config.token}`,
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: { name, arguments: args },
			}),
		});
	} catch (error) {
		throw new CliError(`Cannot reach ${config.endpoint}: ${error instanceof Error ? error.message : String(error)}`);
	}
	const text = await res.text();
	if (res.status === 401) throw new CliError(`Unauthorized (401): ${errorText(text)}`, 3);
	if (res.status === 403) throw new CliError(`Forbidden (403): ${errorText(text)}`, 3);
	if (res.status === 429) {
		throw new CliError(`Rate limited (429), retry in ${res.headers.get("retry-after") ?? "a few"}s`, 4);
	}
	if (!res.ok) throw new CliError(`HTTP ${res.status} from ${config.endpoint}: ${errorText(text)}`);

	let msg;
	try {
		msg = parseRpcBody(text, res.headers.get("content-type") ?? "");
	} catch (error) {
		if (error instanceof CliError) throw error;
		throw new CliError(`Unexpected response from ${config.endpoint}`);
	}
	if (msg.error) throw new CliError(msg.error.message ?? "MCP error");
	const result = msg.result ?? {};
	const body = (result.content ?? [])
		.filter((c) => c.type === "text")
		.map((c) => c.text)
		.join("\n");
	if (result.isError) throw new CliError(body || `Tool ${name} failed`);
	try {
		return JSON.parse(body);
	} catch {
		return body;
	}
}

function errorText(text) {
	try {
		const parsed = JSON.parse(text);
		return parsed.error?.message ?? parsed.error ?? text;
	} catch {
		return text.slice(0, 200);
	}
}

/** Resolve a workspace argument (id or case-insensitive name) to an id */
export async function resolveWorkspaceId(config, ref, fetchImpl = fetch) {
	const { workspaces } = await callTool(config, "list_workspaces", {}, fetchImpl);
	const byId = workspaces.find((w) => w.id === ref);
	if (byId) return byId.id;
	const needle = ref.trim().toLowerCase();
	const matches = workspaces.filter((w) => w.name.trim().toLowerCase() === needle);
	if (matches.length === 1) return matches[0].id;
	if (matches.length > 1) {
		throw new CliError(
			`Workspace name "${ref}" is ambiguous; use an id: ${matches.map((w) => w.id).join(", ")}`,
		);
	}
	throw new CliError(`No readable workspace with id or name "${ref}" (see: cableops workspaces)`);
}

/**
 * @param {{ argv: string[], env: Record<string, string | undefined>, fetch?: typeof fetch,
 *           stdout: (s: string) => void, stderr: (s: string) => void }} io
 * @returns {Promise<number>} exit code
 */
export async function run({ argv, env, fetch: fetchImpl = fetch, stdout, stderr }) {
	try {
		const cmd = parseArgs(argv);
		if (cmd.command === "help") {
			stdout(`${USAGE}\n`);
			return 0;
		}
		const config = resolveConfig(env);
		if (cmd.command === "workspaces") {
			const { workspaces } = await callTool(config, "list_workspaces", {}, fetchImpl);
			if (cmd.json) {
				stdout(`${JSON.stringify(workspaces, null, 2)}\n`);
			} else {
				for (const w of workspaces) stdout(`${w.id}\t${w.permission}\t${w.name}\n`);
			}
			return 0;
		}
		const workspaceId = await resolveWorkspaceId(config, cmd.workspace, fetchImpl);
		const tool = cmd.command === "get" ? "get_snapshot" : "analyze";
		const payload = await callTool(config, tool, { workspaceId }, fetchImpl);
		stdout(`${JSON.stringify(payload, null, 2)}\n`);
		return 0;
	} catch (error) {
		if (error instanceof CliError) {
			stderr(`cableops: ${error.message}\n`);
			return error.exitCode;
		}
		stderr(`cableops: ${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
}

const invokedDirectly =
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
	main();
}

/** Entry point used by `node bin/cableops.mjs` and the `bin/cableops` shim */
export function main() {
	return run({
		argv: process.argv.slice(2),
		env: process.env,
		stdout: (s) => process.stdout.write(s),
		stderr: (s) => process.stderr.write(s),
	}).then((code) => {
		process.exitCode = code;
	});
}
