// Types for bin/cableops.mjs (used by the CLI tests)
export declare const DEFAULT_URL: string;
export declare const USAGE: string;
export declare class CliError extends Error {
	constructor(message: string, exitCode?: number);
	exitCode: number;
}
export type ParsedArgs =
	| { command: "help" }
	| { command: "workspaces"; json: boolean }
	| { command: "get" | "analyze"; workspace: string };
export declare function parseArgs(argv: string[]): ParsedArgs;
export declare function resolveConfig(env: Record<string, string | undefined>): {
	token: string;
	endpoint: string;
};
export interface CliConfig {
	token: string;
	endpoint: string;
}
export declare function callTool(
	config: CliConfig,
	name: string,
	args: Record<string, unknown>,
	fetchImpl?: typeof fetch,
): Promise<unknown>;
export declare function resolveWorkspaceId(
	config: CliConfig,
	ref: string,
	fetchImpl?: typeof fetch,
): Promise<string>;
export declare function run(io: {
	argv: string[];
	env: Record<string, string | undefined>;
	fetch?: typeof fetch;
	stdout: (s: string) => void;
	stderr: (s: string) => void;
}): Promise<number>;
export declare function main(): Promise<void>;
