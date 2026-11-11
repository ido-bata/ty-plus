/**
 * The environment `cargo test` must run under on this repository.
 *
 * `ty-plus-host-filesystem` walks an app root with `O_NOFOLLOW`, so it refuses
 * to traverse a symlinked path component — otherwise a component could be
 * swapped mid-scan. macOS puts `TMPDIR` (and the `/tmp` fallback) under
 * `/var -> /private/var`, which is exactly such a component, so every fixture
 * built from a temp directory died at `open_app_root` with `ELOOP` before
 * reaching a single assertion.
 *
 * The remote gate already points `TMPDIR` at a directory inside the workspace;
 * sharing that here gives local runs the same fixture root, so `bun run ci`
 * does not depend on where the runner happens to put temp files. It lives in
 * its own module because two scripts (`check-rust-workspace`,
 * `check-rust-test`) run `cargo test` and either one drifting back to the
 * inherited value would reintroduce the failure for half the gate
 * (Issue #189).
 *
 * Only the temp root for tests moves. Whether a *product* scan rooted under a
 * symlinked path should fail outright is a separate question about the
 * `O_NOFOLLOW` rule and is not answered here (Issue #197).
 */

import { mkdirSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Resolve a candidate directory into a fixture root with no symlinked
 * ancestor, or `undefined` on a host that does not need one.
 *
 * Exported for the regression test, which injects a symlinked ancestor and
 * asserts the returned root has none.
 */
export const resolveFixtureTempRoot = (
	candidate: string,
	platform: NodeJS.Platform,
): string | undefined => {
	if (platform !== "darwin") return undefined;
	mkdirSync(candidate, { recursive: true });
	return realpathSync(candidate);
};

/** Environment for `cargo test`, with a symlink-free temp root on macOS. */
export const rustFixtureEnv = (
	platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv => {
	const tempRoot = resolveFixtureTempRoot(
		resolve(repoRoot, ".tmp", "rust-tests"),
		platform,
	);
	return tempRoot === undefined
		? process.env
		: { ...process.env, TMPDIR: tempRoot };
};
