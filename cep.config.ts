import type { CEP_Config } from "vite-cep-plugin";
import { version } from "./package.json" with { type: "json" };
import {
	CEP_PANEL_FRAME,
	MODELESS_MAX_SIZE,
	MODELESS_MIN_SIZE,
	SHELL_MODELESS_FRAME,
} from "./src/management/panel/setting/geometry.js";

const startingDebugPort = Number(process.env.CEP_DEBUG_BASE ?? 8970);
const disableGpu = /^(1|true|yes)$/i.test(
	String(process.env.CEP_DISABLE_GPU ?? ""),
);
const extraCefFlags = String(process.env.CEP_CEF_EXTRA ?? "")
	.split(/\s+/)
	.map((s) => s.trim())
	.filter(Boolean);

const baseCefFlags = [
	"--v=0",
	"--enable-nodejs",
	"--mixed-context",
	"--allow-file-access-from-files",
	"--allow-file-access",
	"--enable-viewport-meta",
] as CEP_Config["parameters"];

/** Dist uses shallow `MainPath` (`./panel/`, `./modeless/`); sources are under `management/ae/cep/shell/` (see `vite.config.ts`). */
const CEP_PANEL_MAIN = "./panel/index.html";
const CEP_HOST_SCRIPT = "./jsx/ty-plus-host.jsx";
const CEP_PANEL_HTML_BY_NUMBER = {
	1: CEP_PANEL_MAIN,
	2: CEP_PANEL_MAIN,
	3: CEP_PANEL_MAIN,
	4: CEP_PANEL_MAIN,
	5: CEP_PANEL_MAIN,
} as const;
const CEP_MODELESS_HTML = "./modeless/index.html";

const DEVELOPMENT_UNSIGNED_TRUST_MODE = "development-unsigned" as const;
const RELEASE_TRUST_MODE = "release" as const;
export const OPERATION_WORKER_EXPECTED_TRUST_MODE =
	process.env.TY_PLUS_CEP_BUILD_MODE === "development" ||
	process.env.NODE_ENV !== "production"
		? DEVELOPMENT_UNSIGNED_TRUST_MODE
		: RELEASE_TRUST_MODE;

/**
 * Resolve the ZXP signing password from the canonical Infisical env var.
 *
 * Called lazily from the `zxp.password` getter below, so the "missing password
 * is fatal" rule only applies to the ZXP packaging path that actually reads it.
 * In production, a missing password is fatal: an empty password would be
 * forwarded to the ZXP signer and produce a confusing downstream failure.
 * In development, fall back to an empty string and warn — matching the
 * pattern in `scripts/package/sign-zxp.ts`.
 */
function resolveZxpCertPassword(): string {
	const password = process.env.ZXP_CERT_PASSWORD;
	if (password && password.length > 0) return password;
	if (process.env.NODE_ENV === "production") {
		throw new Error(
			"ZXP_CERT_PASSWORD is required when building a production ZXP. " +
				"Pull it from the ty-plus Infisical project (scripts/infisical/setup.ts) " +
				"or set it in your CI secret store.",
		);
	}
	console.warn(
		"[cep.config] ZXP_CERT_PASSWORD is not set; ZXP signing will use an empty password and likely fail. " +
			"Run `bun run secrets:setup` to inject it from Infisical.",
	);
	return "";
}

/** Manifest `<MinSize>` / `<MaxSize>` so the host allows resizing the modeless frame (AE/CEP). */
const modelessGeometry = {
	minWidth: MODELESS_MIN_SIZE.width,
	minHeight: MODELESS_MIN_SIZE.height,
	maxWidth: MODELESS_MAX_SIZE.width,
	maxHeight: MODELESS_MAX_SIZE.height,
} as const;

const optionalCefFlags = [
	...(disableGpu
		? [
				"--disable-gpu",
				"--disable-gpu-compositing",
				"--disable-direct-composition",
			]
		: []),
	...extraCefFlags,
] as unknown as CEP_Config["parameters"];

const config: CEP_Config = {
	version,
	id: "app.ty-plus",
	displayName: "ty-plus",
	symlink: "local",
	port: 3000,
	servePort: 5000,
	startingDebugPort,
	extensionManifestVersion: 6.0,
	// Match shipping multi-panel CEP extensions (e.g. Motion Tools Pro): CSXS 6.0+.
	// Aux panels with AutoVisible=false have correlated with blank host-menu opens in AE.
	requiredRuntimeVersion: 6.0,
	hosts: [{ name: "AEFT", version: "[17.0,99.9]" }],

	type: "Panel",
	iconDarkNormal: "./src/assets/light-icon.png",
	iconNormal: "./src/assets/dark-icon.png",
	iconDarkNormalRollOver: "./src/assets/light-icon.png",
	iconNormalRollOver: "./src/assets/dark-icon.png",
	parameters: [...baseCefFlags, ...optionalCefFlags],
	width: CEP_PANEL_FRAME.width,
	height: CEP_PANEL_FRAME.height,

	panels: [
		{
			mainPath: CEP_PANEL_HTML_BY_NUMBER[1],
			scriptPath: CEP_HOST_SCRIPT,
			name: "panel1",
			panelDisplayName: "ty-plus",
			autoVisible: true,
			type: "Panel",
			width: CEP_PANEL_FRAME.width,
			height: CEP_PANEL_FRAME.height,
		},
		...([2, 3, 4, 5] as const).map((panelNumber) => ({
			mainPath: CEP_PANEL_HTML_BY_NUMBER[panelNumber],
			scriptPath: CEP_HOST_SCRIPT,
			name: `panel${panelNumber}`,
			panelDisplayName: `ty-plus panel ${panelNumber}`,
			// Must stay true: AE/CEF often leaves aux panels blank from the Window menu when false
			// (Motion Tools Pro uses true for every panel row; see docs/no-use/decisions.md).
			autoVisible: true,
			type: "Panel" as const,
			width: CEP_PANEL_FRAME.width,
			height: CEP_PANEL_FRAME.height,
		})),
		{
			mainPath: CEP_MODELESS_HTML,
			scriptPath: CEP_HOST_SCRIPT,
			name: "dialog",
			panelDisplayName: "",
			autoVisible: false,
			type: "Modeless",
			width: SHELL_MODELESS_FRAME.width,
			height: SHELL_MODELESS_FRAME.height,
			...modelessGeometry,
		},
		{
			mainPath: CEP_MODELESS_HTML,
			scriptPath: CEP_HOST_SCRIPT,
			name: "dialog-preset-add",
			panelDisplayName: "",
			autoVisible: false,
			type: "Modeless",
			width: SHELL_MODELESS_FRAME.width,
			height: SHELL_MODELESS_FRAME.height,
			...modelessGeometry,
		},
		// Extra Modeless rows: same bundle as `dialog-preset-add`, distinct Extension Id for multi-open.
		...Array.from({ length: 7 }, (_, slot) => ({
			mainPath: CEP_MODELESS_HTML,
			scriptPath: CEP_HOST_SCRIPT,
			name: `dialog-preset-add-${slot + 2}`,
			panelDisplayName: "",
			autoVisible: false,
			type: "Modeless" as const,
			width: SHELL_MODELESS_FRAME.width,
			height: SHELL_MODELESS_FRAME.height,
			...modelessGeometry,
		})),
		{
			mainPath: CEP_MODELESS_HTML,
			scriptPath: CEP_HOST_SCRIPT,
			name: "dialog-preset-edit",
			panelDisplayName: "",
			autoVisible: false,
			type: "Modeless",
			width: SHELL_MODELESS_FRAME.width,
			height: SHELL_MODELESS_FRAME.height,
			...modelessGeometry,
		},
		{
			mainPath: CEP_MODELESS_HTML,
			scriptPath: CEP_HOST_SCRIPT,
			name: "debug-console",
			panelDisplayName: "",
			autoVisible: false,
			type: "Modeless",
			width: SHELL_MODELESS_FRAME.width,
			height: SHELL_MODELESS_FRAME.height,
			...modelessGeometry,
		},
		// Status bar / shell: Extension Id = `${id}.${name}` → app.ty-plus.dialog-presets 等
		{
			mainPath: CEP_MODELESS_HTML,
			scriptPath: CEP_HOST_SCRIPT,
			name: "dialog-presets",
			panelDisplayName: "",
			autoVisible: false,
			type: "Modeless",
			width: SHELL_MODELESS_FRAME.width,
			height: SHELL_MODELESS_FRAME.height,
			...modelessGeometry,
		},
		{
			mainPath: CEP_MODELESS_HTML,
			scriptPath: CEP_HOST_SCRIPT,
			name: "dialog-preset-library",
			panelDisplayName: "",
			autoVisible: false,
			type: "Modeless",
			width: SHELL_MODELESS_FRAME.width,
			height: SHELL_MODELESS_FRAME.height,
			...modelessGeometry,
		},
		{
			mainPath: CEP_MODELESS_HTML,
			scriptPath: CEP_HOST_SCRIPT,
			name: "dialog-messages",
			panelDisplayName: "",
			autoVisible: false,
			type: "Modeless",
			width: SHELL_MODELESS_FRAME.width,
			height: SHELL_MODELESS_FRAME.height,
			...modelessGeometry,
		},
		{
			mainPath: CEP_MODELESS_HTML,
			scriptPath: CEP_HOST_SCRIPT,
			name: "dialog-settings",
			panelDisplayName: "",
			autoVisible: false,
			type: "Modeless",
			width: SHELL_MODELESS_FRAME.width,
			height: SHELL_MODELESS_FRAME.height,
			...modelessGeometry,
		},
		{
			mainPath: CEP_MODELESS_HTML,
			scriptPath: CEP_HOST_SCRIPT,
			name: "dialog-widget-selector",
			panelDisplayName: "",
			autoVisible: false,
			type: "Modeless",
			width: SHELL_MODELESS_FRAME.width,
			height: SHELL_MODELESS_FRAME.height,
			...modelessGeometry,
		},
		{
			mainPath: CEP_MODELESS_HTML,
			scriptPath: CEP_HOST_SCRIPT,
			name: "dialog-background-panel",
			panelDisplayName: "",
			autoVisible: false,
			type: "Modeless",
			width: SHELL_MODELESS_FRAME.width,
			height: SHELL_MODELESS_FRAME.height,
			...modelessGeometry,
		},
	],
	build: {
		jsxBin: "off",
		sourceMap: true,
	},
	zxp: {
		country: "JP",
		province: "CA",
		org: "ty-plus",
		// Resolved lazily, on first read. `cep.config.ts` is evaluated by every
		// `vite build` — including the plain production build in `bun run ci` —
		// but only ZXP packaging reads this field (`signZXP` in
		// vite-cep-plugin, reached via `--action`). Resolving it at module scope
		// made an ordinary build require the *signing* password, so `bun run ci`
		// failed on any machine where the secret is not injected, even though
		// the build it performs is unsigned.
		get password(): string {
			return resolveZxpCertPassword();
		},
		tsa: ["http://timestamp.digicert.com/", "http://timestamp.apple.com/ts01"],
		allowSkipTSA: false,
		sourceMap: false,
		jsxBin: "off",
	},
	installModules: [],
	copyAssets: [],
	copyZipAssets: [],
};
export default config;
