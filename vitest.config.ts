import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests do not load the Start/Nitro plugins.
export default defineConfig({
	plugins: [tsconfigPaths({ projects: ["./tsconfig.json"] })],
	define: { __APP_VERSION__: JSON.stringify("test") },
	test: {
		include: ["src/**/*.test.ts", "bin/**/*.test.ts"],
		environment: "node",
		testTimeout: 30_000,
		hookTimeout: 60_000,
	},
});
