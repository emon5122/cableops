import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const config = defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	plugins: [
		devtools(),
		nitro({ rollupConfig: { external: [/^@sentry\//] } }),
		tsconfigPaths({ projects: ["./tsconfig.json"] }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
