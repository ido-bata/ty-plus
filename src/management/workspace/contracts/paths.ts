/**
 * Workspace file path contracts.
 * Self-contained within workspace/ — storage layer uses these through domain APIs.
 *
 * NOTE: Infrastructure constants (ty-plus folder, data/settings dirs) are NOT
 * defined here. They are provided by the host/settings layer and passed as
 * parameters to path resolution functions.
 */

// ── Workspace-only constants ─────────────────────────────────────────────────

const WORKSPACES_DIR = "workspaces";
const BACKGROUNDS_SUBDIR = "background";

// ── Path helper ───────────────────────────────────────────────────────────────

const joinPath = (...parts: string[]): string => {
	const normalized = parts.map((p) =>
		p.replace(/[\\/]+$/, "").replace(/^[\\/]+/, ""),
	);
	return normalized.filter(Boolean).join("/");
};

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
