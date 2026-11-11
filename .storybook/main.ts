import path from "node:path";

import type { StorybookConfig } from "@storybook/react-vite";
import Icons from "unplugin-icons/vite";

import { inlineOnigurumaWasmPlugin } from "../scripts/utils/vite-plugin-inline-oniguruma-wasm.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const root = path.resolve(projectRoot, "src");

/**
 * Names of Vite plugins installed by the CEP build that must be stripped
 * from Storybook's preview/dev server. They transform `__adobe_cep__`
 * globals, inject ExtendScript shims, and rewrite `file://` redirects —
 * none of which exist outside After Effects. Running them under Storybook
 * would either crash at boot or silently corrupt CEP artifacts.
 *
 * `ty-plus:inline-oniguruma-wasm` is NOT in this list. That plugin only
 * reads a file and base64-encodes it; it has no CEP dependency. It is
 * required by any story whose component transitively imports
 * `@/management/preset` (via `editor/textmate.ts`), and is explicitly
 * re-added below.
 *
 * Matched by `plugin.name` substring (see `vite.config.ts` for the source
 * definitions). Keep this list in sync with the CEP plugin block in
 * `vite.config.ts:204-224`.
 *
 * The exact names below are observed in:
 *   node_modules/vite-cep-plugin/lib/index.js
 *     - "cep"            (main `cep()` plugin, line 120)
 *     - "CEP HTML Dev File"
 *     - "CEP Manifest File"
 *     - "CEP Debug File"
 *     - "extendscript-include-resolver"
 *     - "extendscript-ponyfill-resolver"
 *     - "extendscript-jsxbin"
 *     - "JSXBIN"
 *   scripts/utils/vite-plugin-cep-manifest-position.js
 *     - "typlus-cep-manifest-position"
 *   scripts/utils/vite-plugin-strip-cep-dev-redirect.js
 *     - "typlus-strip-cep-dev-redirect"
 *     - "typlus-add-data-main"
 *     - "typlus-rewrite-cep-dev-redirect"
 *     - "typlus-ensure-cep-dev-redirect"
 *   vite.config.ts
 *     - "ty-plus:drop-console-log-info"
 */
const CEP_PLUGIN_NAME_PATTERNS = [
	"ty-plus:drop-console-log-info",
	"typlus-cep-manifest-position",
	"typlus-strip-cep-dev-redirect",
	"typlus-add-data-main",
	"typlus-rewrite-cep-dev-redirect",
	"typlus-ensure-cep-dev-redirect",
	"vite-cep-plugin",
	// Plain "cep" is the main plugin name from vite-cep-plugin; it is
	// prefixed here to avoid false matches against unrelated plugin
	// names. See `node_modules/vite-cep-plugin/lib/index.js:120`.
	"vcep:",
	"CEP ",
	"extendscript",
	"JSXBIN",
] as const;

const stripCepPlugins = (config: { plugins?: unknown[] }): void => {
	const plugins = Array.isArray(config.plugins) ? config.plugins : [];
	config.plugins = plugins.filter((plugin) => {
		if (!plugin || typeof plugin !== "object") return true;
		const name = (plugin as { name?: unknown }).name;
		if (typeof name !== "string") return true;
		// Match the bare "cep" name exactly (it is the main cep() plugin
		// name registered by vite-cep-plugin). Substring matching is too
		// loose for such a short, generic name.
		if (name === "cep") return false;
		return !CEP_PLUGIN_NAME_PATTERNS.some((pattern) => name.includes(pattern));
	});
};

const config: StorybookConfig = {
	framework: {
		name: "@storybook/react-vite",
		options: {},
	},
	stories: ["../src/**/*.stories.@(ts|tsx)"],
	addons: ["@storybook/addon-vitest"],
	docs: {},
	core: {
		disableTelemetry: true,
	},
	viteFinal: (config) => {
		stripCepPlugins(config as { plugins?: unknown[] });
		config.plugins = [
			...(Array.isArray(config.plugins) ? config.plugins : []),
			// Do NOT re-append `react()` here — the `@storybook/react-vite`
			// framework preset already registers `@vitejs/plugin-react` and
			// its React Fast Refresh preamble. Adding it twice causes
			// `SyntaxError: Identifier 'RefreshRuntime' has already been
			// declared` at first request and the preview stays on its
			// "loading…" screen forever. Only `Icons` and
			// `inlineOnigurumaWasmPlugin` are unique to this project.
			// PostCSS auto-loads `@pandacss/postcss` via `postcss.config.cjs`.
			Icons({ compiler: "jsx" }),
			// `vscode-oniguruma` is imported by `editor/textmate.ts`, which
			// is reachable through the `@/management/preset` barrel that
			// most CEP components transitively touch. Without this plugin
			// the WASM resolves to an empty module and Storybook aborts
			// with `MISSING_EXPORT`. See scripts/utils/vite-plugin-inline-
			// oniguruma-wasm.ts for details.
			inlineOnigurumaWasmPlugin(),
		];
		// Do NOT set `config.root` — Storybook uses the root to resolve
		// the `stories` glob, and pointing root at `src/` would make the
		// glob double-prefix. Aliases below are absolute paths so they
		// resolve correctly without a custom root.
		//
		// `node:*` aliases redirect the handful of Node builtins that
		// modules under `src/management/ipc/*` and `src/management/debug/*`
		// import. Vite externalizes them for browser compatibility which
		// causes `Module "node:child_process" has been externalized for
		// browser compatibility. Cannot access "node:child_process.spawn"`
		// once any story transitively touches the storage / IPC barrels.
		// `.storybook/empty-node-module.js` exports inert stand-ins so the
		// optimizer scan completes; the stories that reach this path are
		// either already-stubs or never call the Node side at render time.
		const emptyNodeModule = path.resolve(
			import.meta.dirname,
			"empty-node-module.js",
		);
		config.resolve = {
			...config.resolve,
			extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
			alias: [
				{
					find: /^@\/styled-system\/(.*)$/,
					replacement: path.resolve(projectRoot, "styled-system") + "/$1",
				},
				{
					find: /^@styled-system\/(.*)$/,
					replacement: path.resolve(projectRoot, "styled-system") + "/$1",
				},
				{ find: "@", replacement: path.resolve(root) },
				{ find: "@esTypes", replacement: path.resolve(root) },
				{ find: "@ui", replacement: path.resolve(root, "js/ui") },
				{ find: "@system", replacement: path.resolve(root, "js/system") },
				{ find: "@infra", replacement: path.resolve(root, "js/infra") },
				{ find: /^node:child_process$/, replacement: emptyNodeModule },
				{ find: /^node:events$/, replacement: emptyNodeModule },
				{ find: /^node:fs$/, replacement: emptyNodeModule },
				{ find: /^node:fs\/promises$/, replacement: emptyNodeModule },
				{ find: /^node:crypto$/, replacement: emptyNodeModule },
				{ find: /^node:path$/, replacement: emptyNodeModule },
			],
		};
		// Scope the dep optimizer so it does not crawl every story file
		// on every startup. With 123 stories the optimizer scan can run
		// for several minutes before the preview is ready, which the
		// user perceives as "loading forever" right after a fresh
		// `bun install` (Vite invalidates its `node_modules/.vite/deps/`
		// cache whenever the lockfile changes). The preview entry
		// covers everything Vite needs to know about for the dev server;
		// each story is then lazily transformed on first navigation.
		//
		// Narrowing `entries` alone is not enough. Anything a story
		// reaches that `preview.ts` does not — `react-dom/client`, the
		// Monaco language contributions, the Volar worker — is discovered
		// mid-run, and Vite responds by re-optimizing: the browserHash
		// changes, every already-issued `?v=<hash>` module URL 404s, and
		// the run dies with `Failed to fetch dynamically imported module
		// …/react-18.js?v=<old hash>` plus a handful of
		// `Vitest failed to find the current suite` suites. It only
		// happens on a cold `node_modules/.cache/storybook` — which is
		// exactly what CI always has — and it takes a second run to go
		// green, so the flake hid behind local runs.
		//
		// `include` pins the full discovered set so the cold start does a
		// single optimization pass and the hash stays stable for the whole
		// run. The list is what a completed optimization pass produces
		// (see `node_modules/.cache/storybook/**/sb-vitest/deps/
		// _metadata.json`); a new dependency added by a story has to be
		// appended here, otherwise it re-introduces the second pass.
		config.optimizeDeps = {
			...config.optimizeDeps,
			entries: ["./.storybook/preview.ts"],
			include: [
				"@emoji-mart/react",
				"@volar/monaco",
				"@volar/monaco/worker",
				"@volar/typescript/lib/common.js",
				"i18next",
				"lucide-react",
				"monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js",
				"monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js",
				"monaco-editor/esm/vs/common/initialize.js",
				"monaco-editor/esm/vs/editor/editor.api.js",
				"react",
				"react-dom",
				"react-dom/client",
				"react-dom/test-utils",
				"react-i18next",
				"react/jsx-dev-runtime",
				"typescript",
				"volar-service-typescript",
				"vscode-oniguruma",
				"vscode-textmate",
				"vscode-uri",
			],
		};
		return config;
	},
};

export default config;
