/**
 * Workspace file path contracts.
 * Workspace-owned layout/background paths, built on the shared `joinPath`
 * from the storage layer.
 *
 * NOTE: Infrastructure constants (ty-plus folder, data/settings dirs) are NOT
 * defined here. They are provided by the host/settings layer and passed as
 * parameters to path resolution functions.
 *
 * `joinPath` is imported rather than copied: this file used to carry its own
 * regex clone of it, and a second copy of the Issue #216 path bug is exactly
 * the kind of drift that hides a data-loss defect (the clone fed `fs.watch`
 * relative layout/background paths on POSIX).
 */

import { joinPath } from "@/management/storage/file";

// ── Workspace-only constants ─────────────────────────────────────────────────

const WORKSPACES_DIR = "workspaces";
const BACKGROUNDS_SUBDIR = "background";

// ── Workspace panel paths ─────────────────────────────────────────────────────

/**
 * Returns the path to workspaces/workspace-N.json (1-5)
 */
export const resolvePanelJsonPath = (
	supportRoot: string,
	index: 1 | 2 | 3 | 4 | 5,
): string => joinPath(supportRoot, WORKSPACES_DIR, `workspace-${index}.json`);

/**
 * Returns the path to workspaces/background/background-N.json (1-5)
 */
export const resolveBackgroundPath = (
	supportRoot: string,
	index: 1 | 2 | 3 | 4 | 5,
): string =>
	joinPath(
		supportRoot,
		WORKSPACES_DIR,
		BACKGROUNDS_SUBDIR,
		`background-${index}.json`,
	);
