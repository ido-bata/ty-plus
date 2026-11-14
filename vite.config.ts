import { readFileSync } from "node:fs";
import path from "node:path";

import react from "@vitejs/plugin-react";
import Icons from "unplugin-icons/vite";
import { type Plugin, defineConfig, loadEnv } from "vite";
import { type CepOptions, cep, runAction } from "vite-cep-plugin";
import { LOGGER_MODULE_PATH_SUFFIX } from "./src/management/debug/logger.js";
import cepConfig from "./cep.config.js";
import { cepManifestPositionPlugin } from "./scripts/utils/vite-plugin-cep-manifest-position.js";
import { inlineOnigurumaWasmPlugin } from "./scripts/utils/vite-plugin-inline-oniguruma-wasm.js";
import {
	addDataMainToScriptsPlugin,
	ensureCepDevRedirectPlugin,
	stripCepDevRedirectPlugin,
} from "./scripts/utils/vite-plugin-strip-cep-dev-redirect.js";

const __dirname = import.meta.dirname;

/**
 * Strip `console.log` / `console.info` call statements from production bundles.
 *
 * Only fires when `isProduction === true`. We do not touch `console.error`,
 * `console.warn`, or the dev `subscribe`-style debug surface; those are
 * expected in shipped builds.
 *
 * Each call is replaced with `;` (an empty statement) rather than the empty
 * string. The empty-string form breaks parsing when the call sits inline on
 * another statement (e.g. `if (cond) console.log(x);`) — the trailing `if`
 * body becomes whitespace-only, which esbuild/TS reject as an unexpected `}`.
 *
 * Whitelist: the central diagnostic logger (`src/management/debug/logger.ts`)
 * routes through `console.*` for DevTools visibility while development-only
 * callers are still active. Stripping the logger module would sever the
 * production diagnostic sink's outbound path. The constant
 * `LOGGER_MODULE_PATH_SUFFIX` is imported from the module itself so the
 * plugin and the codebase cannot drift.
 */
const dropConsoleLogInfoPlugin = (
	loggerWhitelistSuffix: string,
): Plugin => ({
	name: "ty-plus:drop-console-log-info",
	transform(code, id) {
		if (!isProduction) return null;
		if (
			!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(id) ||
			id.includes("/node_modules/")
		) {
			return null;
		}
		// Skip the central logger module: its `console.*` calls are the
		// DevTools-visibility side of the diagnostic sink. The ring buffer
		// itself does not depend on `console.*` — only the dev overlay does.
		if (id.endsWith(loggerWhitelistSuffix)) {
			return null;
		}
		const stripped = code
			.replace(/console\.log\((?:[^()]|\([^()]*\))*\);?/g, ";")
			.replace(/console\.info\((?:[^()]|\([^()]*\))*\);?/g, ";");
		return stripped === code ? null : { code: stripped, map: null };
	},
});

// Read version from package.json for injection at build time
const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as {
	version: string;
};
const APP_VERSION = pkg.version;

/**
 * Release identity for the panel bundle.
 *
 * `TY_PLUS_RELEASE_VERSION` is the full SemVer release identity (e.g.
 * `0.11.0-insider.2`); `APP_VERSION` is the numeric CEP version. The channel
 * is always **derived from the version** rather than read from its own env
 * var: an operator who sets only one of the two cannot then ship an insider
 * build labelled `stable` (which the update client would compare as a
 * downgrade and never offer). An unrecognised suffix is a build error, not a
 * silent fallback.
 */
const releaseVersion = (process.env.TY_PLUS_RELEASE_VERSION ?? "").trim() || APP_VERSION;
const releaseChannelFromVersion =
	/(?:-(beta|insider)\.\d+)?$/.exec(releaseVersion)?.[1] ?? "stable";
const releaseChannelEnv = (process.env.TY_PLUS_RELEASE_CHANNEL ?? "").trim();
if (releaseChannelEnv && releaseChannelEnv !== releaseChannelFromVersion) {
	throw new Error(
		`[vite] TY_PLUS_RELEASE_CHANNEL=${releaseChannelEnv} disagrees with ` +
			`TY_PLUS_RELEASE_VERSION=${releaseVersion} (${releaseChannelFromVersion})`,
	);
}
const releaseChannel = releaseChannelFromVersion;

const devDist = "dist";
/** CEP bundle folder (must match `scripts/cep/install-cep-dev.ts` and packaging scripts). */
const cepDist = "cep-dev";

const root = path.resolve(__dirname, "src");
const outDir = path.resolve(__dirname, "dist", cepDist);

const debugReact = process.env.DEBUG_REACT === "true";
const isProduction = process.env.NODE_ENV === "production";
const isMetaPackage = process.env.ZIP_PACKAGE === "true";
const isPackage = process.env.ZXP_PACKAGE === "true" || isMetaPackage;
const isServe = process.env.SERVE_PANEL === "true";
const isBuildWatch = process.env.VITE_BUILD_WATCH === "true";
const action = process.env.BOLT_ACTION;
const cepDevRedirectHost = (process.env.CEP_DEV_REDIRECT_HOST ?? "").trim();
// Opt-in only: forcing a position can be worse than letting CEP/OS decide default placement.
const enableCepsManifestPosition = /^(1|true|yes)$/i.test(
	String(process.env.CEP_MANIFEST_POSITION ?? ""),
);

// Load root `.env` for `__TY_PLUS_DEV_ENV__` injection.
// `loadEnv` searches `envDir` (set to `__dirname` = repo root) and respects `mode`.
// For production builds, `process.env.NODE_ENV === "production"` means `mode = production`,
// so `.env.production` / `.env.production.local` take priority over `.env`.
const loadedEnv = loadEnv(
	isProduction ? "production" : "development",
	__dirname,
	"",
);

const makeDefines = (): Record<string, string> => {
	// Keys that mirror CepDevEnv (used at runtime by readCepDevEnv()).
	const supabaseUrl = loadedEnv.SUPABASE_URL ?? "";
	const publishableKey =
		loadedEnv.SUPABASE_PUBLISHABLE_KEY?.trim() ||
		loadedEnv.SUPABASE_ANON_KEY?.trim() ||
		"";
	const tyPlusApiBase = loadedEnv.TY_PLUS_API_BASE ?? "";
	const tyPlusMediaBaseUrl = loadedEnv.TY_PLUS_MEDIA_BASE_URL ?? "";

	const cepDevEnv = {
		...(supabaseUrl ? { SUPABASE_URL: supabaseUrl } : {}),
		...(publishableKey ? { SUPABASE_PUBLISHABLE_KEY: publishableKey } : {}),
		...(tyPlusApiBase ? { TY_PLUS_API_BASE: tyPlusApiBase } : {}),
		...(tyPlusMediaBaseUrl
			? { TY_PLUS_MEDIA_BASE_URL: tyPlusMediaBaseUrl }
			: {}),
	};

	return {
		__APP_VERSION__: JSON.stringify(APP_VERSION),
		// Numeric CEP version stays independent of the SemVer GitHub tag.
		// Both release defines are derived here, once, from the same inputs:
		// taking the channel straight from its own env var would let a
		// misconfigured prerelease build silently ship as `stable`.
		__TY_PLUS_RELEASE_VERSION__: JSON.stringify(releaseVersion),
		__TY_PLUS_RELEASE_CHANNEL__: JSON.stringify(releaseChannel),
		__TY_PLUS_DEV_ENV__: JSON.stringify(cepDevEnv),
		// Inline `process.env.NODE_ENV` so the existing production guards
		// (`if (process.env.NODE_ENV === "production") return;`) get folded
		// to unconditional returns by esbuild. Keeps dev logs out of the
		// shipped bundle without per-source-file wrappers.
		"process.env.NODE_ENV": JSON.stringify(
			isProduction ? "production" : "development",
		),
		__TY_PLUS_OPERATION_WORKER_EXPECTED_TRUST_MODE__: JSON.stringify(
			cepConfig.OPERATION_WORKER_EXPECTED_TRUST_MODE,
		),
		// Matches `cepConfig.id`: dev bundles ship `app.ty-plus.dev.*` Extension
		// Ids so they can coexist with a release install (#86).
		__TY_PLUS_EXTENSION_BUNDLE_ID__: JSON.stringify(cepConfig.id),
	};
};

const input: { [key: string]: string } = {};
/**
 * Manifest / `dist/cep-dev` keep shallow `MainPath` (`./panel/`, `./modeless/`).
 * HTML sources live only under `src/management/ae/cep/shell/…` (AE boundary).
 */
const CEP_SHELL_HTML_SOURCE: Record<string, string> = {
	"./panel/index.html": "./management/ae/cep/shell/panel/index.html",
	"./modeless/index.html": "./management/ae/cep/shell/modeless/index.html",
};

// Deduplicate HTML inputs: multiple panels can point to the same MainPath (like Motion Tools Pro).
// Vite/Rollup should only build each HTML page once.
const seenInputs = new Set<string>();

// Separate tracking for HTML entries (panels) and TS/TSX entries (dialog)
const htmlEntries = new Set<string>();

// Add panel HTML entry points first
cepConfig.panels.map((panel) => {
	const sourceMainPath =
		CEP_SHELL_HTML_SOURCE[panel.mainPath] ?? panel.mainPath;
	const resolved = path.resolve(root, sourceMainPath.replace(/^[.][\\/]/, ""));
	if (seenInputs.has(resolved)) return;
	seenInputs.add(resolved);
	htmlEntries.add(resolved);

	const normalized = panel.mainPath
		.replace(/^[.][\\/]/, "")
		.replace(/\\/g, "/");
	const dir = normalized.split("/").slice(0, -1).pop();
	const key = dir && dir.length > 0 ? dir : panel.name;
	input[key] = resolved;
});

// Tailwind CSS entry. Output is renamed to `cep-shell.bundle.css` in
// `assetFileNames` below so the appearance boot can pin the link href.
const SHELL_CSS_ENTRY = "cep-shell";
{
	const shellCssPath = path.resolve(
		root,
		"management/panel/styles/app.css",
	);
	if (!seenInputs.has(shellCssPath)) {
		seenInputs.add(shellCssPath);
		input[SHELL_CSS_ENTRY] = shellCssPath;
	}
}

const config: CepOptions = {
	cepConfig,
	isProduction,
	isPackage,
	isMetaPackage,
	isServe,
	debugReact,
	dir: `${__dirname}/${devDist}`,
	cepDist: cepDist,
	zxpOutput: `${__dirname}/${devDist}/zxp/${cepConfig.id}`,
	zipOutput: `${__dirname}/${devDist}/zip/${cepConfig.displayName}_${cepConfig.version}`,
	packages: cepConfig.installModules || [],
};

if (action) runAction(config, action);

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		Icons({ compiler: "jsx" }),
		inlineOnigurumaWasmPlugin(),
		dropConsoleLogInfoPlugin(LOGGER_MODULE_PATH_SUFFIX),
		cep(config),
		addDataMainToScriptsPlugin({ cepDist }),
		...(!isPackage && cepDevRedirectHost.length > 0
			? [
					ensureCepDevRedirectPlugin({
						cepDist,
						host: cepDevRedirectHost,
						port: cepConfig.port,
					}),
				]
			: []),
		...(isPackage ? [stripCepDevRedirectPlugin({ cepDist })] : []),
		...(enableCepsManifestPosition ? [cepManifestPositionPlugin()] : []),
	],
	envDir: __dirname,
	logLevel: "error",
	define: makeDefines(),
	resolve: {
		extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
		alias: [
			{
				find: /^@\/styled-system\/(.*)$/,
				replacement: path.resolve(__dirname, "styled-system") + "/$1",
			},
			{
				find: /^@styled-system\/(.*)$/,
				replacement: path.resolve(__dirname, "styled-system") + "/$1",
			},
			{ find: "@", replacement: path.resolve(__dirname, "src") },
			{ find: "@esTypes", replacement: path.resolve(__dirname, "src") },
			{ find: "@ui", replacement: path.resolve(__dirname, "src/js/ui") },
			{
				find: "@system",
				replacement: path.resolve(__dirname, "src/js/system"),
			},
			{ find: "@infra", replacement: path.resolve(__dirname, "src/js/infra") },
		],
	},
	root,
	publicDir: path.resolve(__dirname, "public"),
	clearScreen: false,
	server: {
		port: cepConfig.port,
	},
	preview: {
		port: cepConfig.servePort,
	},

	build: {
		sourcemap: isPackage ? cepConfig.zxp.sourceMap : cepConfig.build?.sourceMap,
		// `bun run build` already does `rimraf dist` before running Vite.
		// Keeping this false avoids a race with the ExtendScript rollup output (dist/cep/jsx).
		emptyOutDir: false,
		watch: isBuildWatch ? { include: "src/management/ae/jsx/**" } : undefined,
		chunkSizeWarningLimit: 500,
		// commonjsOptions: {
		//   transformMixedEsModules: true,
		// },
		rollupOptions: {
			input,
			output: {
				// Keep CEP package runtime simple: avoid aggressive manual chunking.
				// Manual chunks can create circular cross-chunk requires in CEP's CommonJS loader.
				manualChunks: undefined,
				// esModule: false,
				preserveModules: false,
				format: "cjs",
				// CEP loads panel entry via CommonJS `require`.
				// Use `.cjs` to keep package-level ESM from affecting bundled entries.
				// Shallow, role-based layout (cf. Motion Tools `assets/`): entries vs shared chunks vs other files.
				// CEP HTML boot references the entry via `data-main`; a stale hash in HTML vs
				// disk (partial copy, interrupted deploy) breaks sync XHR. Keep shell entries stable.
				entryFileNames: (chunkInfo) =>
					chunkInfo.name === "panel" || chunkInfo.name === "modeless"
						? `assets/js/${chunkInfo.name}.entry.cjs`
						: "assets/js/[name].entry.[hash].cjs",
				chunkFileNames: "assets/[name].[hash].cjs",
				assetFileNames: (assetInfo) => {
					const stem = assetInfo.names?.[0] ?? assetInfo.name ?? "";
					if (typeof stem === "string" && stem.endsWith(".css")) {
						// The Tailwind shell bundle is referenced by a fixed name from
						// `panel/appearance-boot.ts`. Keep that contract stable.
						// `originalFileNames[0]` is the source file; `[name]` placeholder
						// resolves to the entry chunk name. Match by the source path tail
						// so the dedicated entry "cep-shell" always emits the fixed name.
						const source = assetInfo.originalFileNames?.[0] ?? "";
						if (source.endsWith("app.css")) {
							return "cep-shell.bundle.css";
						}
						return "assets/css/[name].[hash][extname]";
					}
					return "assets/media/[name].[hash][extname]";
				},
			},
		},
		// CEP hosts may expose older CEF runtimes where class fields are not parsed reliably.
		// Keep target conservative so esbuild downlevels modern syntax in bundled chunks.
		target: "chrome58",
		outDir,
	},
});
