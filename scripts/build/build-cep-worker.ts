/**
 * Produce the operation-worker artifact the quality gate inspects.
 *
 * `dist/cep-dev/worker/manifest.json` and the content-addressed binary behind
 * it exist only when `buildDevelopmentWorker()` runs, and the only caller of
 * that used to be `build:cep:dev` — a step nothing in the gate invoked.
 * `ci:static` ran `build`, then `verify:online-gateway:package` looked for a
 * file `build` had never produced, so a fresh checkout failed on Windows and
 * macOS while Linux stayed green: the probes are gated on the same platform
 * condition and SKIP there (Issue #191).
 *
 * The skip is reported with its reason rather than taken silently, because a
 * gate that quietly does nothing on the host it is running on is the failure
 * mode this repository has already hit twice (#175, #179).
 */

import { buildDevelopmentWorker } from "../cep/operation-worker-update";

/** Hosts `build-operation-worker` can target; everywhere else is out of scope. */
const NATIVE_HOSTS: ReadonlySet<NodeJS.Platform> = new Set(["win32", "darwin"]);

export const buildGateOperationWorker = async (
	platform: NodeJS.Platform = process.platform,
): Promise<"built" | "skipped"> => {
	if (!NATIVE_HOSTS.has(platform)) {
		console.log(
			`[cep-worker] skipped: operation-worker artifacts are produced on Windows and macOS only (host=${platform}). ` +
				`verify:online-gateway:package records SKIP for the same reason, and check:rust-workspace compiles only the host-independent crates here.`,
		);
		return "skipped";
	}
	await buildDevelopmentWorker();
	return "built";
};

if (import.meta.main) {
	await buildGateOperationWorker();
}
