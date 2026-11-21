import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { SITE } from "./src/lib/site";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, "../..");

export default defineConfig({
	server: {
		port: Number(process.env.TY_PLUS_WEB_PORT ?? 3200),
	},
	preview: {
		port: Number(process.env.TY_PLUS_PREVIEW_PORT ?? 4173),
	},
	resolve: {
		alias: [
			{
				find: /^@ty-plus\/ui\/(.*)$/,
				replacement: `${path.join(repoRoot, "packages/ui/src")}/$1`,
			},
			{
				find: "@ty-plus/product",
				replacement: path.join(repoRoot, "src"),
			},
			{
				find: "@ty-plus/ui",
				replacement: path.join(repoRoot, "packages/ui/src/index.ts"),
			},
			{
				find: /^@\/styled-system\/(.*)$/,
				replacement: `${path.join(root, "styled-system")}/$1`,
			},
			{
				find: /^@styled-system\/(.*)$/,
				replacement: `${path.join(root, "styled-system")}/$1`,
			},
		],
	},
	plugins: [
		// Cloudflare plugin must come first; it provides the workerd
		// environment that `vite dev` / `vite preview` and `wrangler deploy`
		// build on. See wrangler.jsonc.
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tanstackStart({
			// Public pages are static: prerender every route and emit a sitemap.
			prerender: { enabled: true, crawlLinks: true },
			sitemap: { enabled: true, host: SITE.url },
		}),
		viteReact(),
	],
});
