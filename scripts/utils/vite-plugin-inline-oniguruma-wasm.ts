import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/**
 * Inline the vscode-oniguruma WASM as a base64 string at build time.
 *
 * Vite's `?url` produces an absolute path that fails to fetch in CEP's
 * `file://` origin, and `?raw` decodes the binary as UTF-8 and mangles
 * bytes >= 0x80 (e.g. 0xB8 becomes U+FFFD). Base64 round-trips all 256
 * byte values intact. The plugin matches the bare import path used by
 * `src/management/preset/editor/textmate.ts`; subsequent imports are
 * served from Vite's module cache.
 *
 * This plugin has no CEP-specific dependency — it only reads a file
 * and base64-encodes it. Both the CEP build (`vite.config.ts`) and
 * Storybook (`.storybook/main.ts`) load it.
 */
const ONIG_WASM_PATH_SEGMENT = "vscode-oniguruma/release/onig.wasm";

export function inlineOnigurumaWasmPlugin(): Plugin {
	return {
		name: "ty-plus:inline-oniguruma-wasm",
		enforce: "pre",
		load(id) {
			if (!id.includes(ONIG_WASM_PATH_SEGMENT)) return;
			const cleanPath = id.split("?")[0]?.split("\0")[0];
			if (!cleanPath) return;
			const buffer = readFileSync(cleanPath);
			return `export default ${JSON.stringify(buffer.toString("base64"))};`;
		},
	};
}
