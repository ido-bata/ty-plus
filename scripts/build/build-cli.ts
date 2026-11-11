/**
 * Compatibility entry point for the operation-worker build command.
 *
 * Worker artifacts are no longer built from the legacy CLI crate. The
 * distribution boundary lives in build-operation-worker.ts.
 */

import { runOperationWorkerBuildCli } from "./build-operation-worker";

export const main = runOperationWorkerBuildCli;

if (import.meta.main) {
	await main();
}
