/**
 * Resolve the on-disk path to the ty-plus Rust CLI binary for the current
 * platform, and the staging path inside `dist/cep-dev/bin/<platform>/` that
 * the Vite plugin and ZXP packager copy to.
 *
 * Used by:
 *   - `vite.config.ts` (via a Vite plugin — to be added) to copy the binary
 *     into `dist/cep-dev/bin/<platform>/` after `bun run build:cep`.
 *   - `scripts/package/package-cep-archive.ts` for the ZXP packager.
 *
 * The CLI binary is **not** built by Vite. It is built separately by
 * `scripts/build/build-cli.ts` and staged under
 * `tools/ty-plus-cli/dist/<platform>/`. This module only resolves paths.
 */

import { existsSync } from "node:fs";
import path from "node:path";

export type Platform = "Win" | "Mac";

const CLI_DIST = path.resolve("tools", "ty-plus-cli", "dist");

const BIN_NAME: Record<Platform, string> = {
	Win: "ty-plus.exe",
	Mac: "ty-plus",
};

/**
 * Path to the staged CLI binary for the given platform. Returns
 * `null` when the binary has not been built yet — the caller is expected
 * to surface that to the developer rather than silently falling back.
 */
export const resolveStagedCliBinary = (platform: Platform): string | null => {
	const p = path.join(CLI_DIST, platform, BIN_NAME[platform]);
	return existsSync(p) ? p : null;
};
