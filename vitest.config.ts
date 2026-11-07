import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/* Unit tests run on plain Node: no TanStack Start / Nitro plugins needed. */
export default defineConfig({
	plugins: [tsconfigPaths({ projects: ["./tsconfig.json"] })],
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
