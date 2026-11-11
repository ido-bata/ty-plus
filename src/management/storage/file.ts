/**
 * Workspace file management path utilities.
 * Centralizes path construction for workspace data, settings, and locator files.
 */

const MANAGED_SUBFOLDER = "ty-plus";
const LOCATOR_FILE_NAME = "ty-plus-init.json";
const THEME_CSS_FILE_NAME = "theme.css";

// New managed tree constants
const SETTINGS_SUBDIR = "settings";
const WORKSPACES_SUBDIR = "workspaces";
const PRESETS_SUBDIR = "presets";
const GROUPS_SUBDIR = "groups";
const WIDGETS_SUBDIR = "widgets";
const WIDGET_STATE_DIR = "state";
const HISTORY_SUBDIR = "history";
const STYLES_SUBDIR = "styles";
const STYLES_WORKSPACES_SUBDIR = "workspaces";
const PANELS_SUBDIR = "panels";
const LOGS_SUBDIR = "logs";

// New file names
const APP_JSON = "app.json";
const PATHS_JSON = "paths.json";
const UI_JSON = "ui.json";
const CONTROL_PANEL_JSON = "control-panel.json";
const PRESETS_JSON = "presets.json";
const GROUPS_JSON = "groups.json";
const WIDGETS_JSON = "widgets.json";
const SNAPSHOTS_JSON = "snapshots.json";
const LOG_FILE_NAME = "ty-plus.log";
const WORKSPACE_CSS_PREFIX = "workspace-";
const WORKSPACE_CSS_SUFFIX = ".css";

const joinPath = (...parts: string[]): string => {
	const normalized = parts.map((p) =>
		p.replace(/[\\/]+$/, "").replace(/^[\\/]+/, ""),
	);
	return normalized.filter(Boolean).join("/");
};

/**
 * Returns the managed root (ty-plus subfolder) for a given base root.
 * Does NOT append ty-plus if the path already ends with it.
 */
export const resolveManagedRoot = (baseRoot: string): string => {
	const normalized = baseRoot.replace(/[\\/]+$/, "");
	if (/[\\/]ty-plus$/i.test(normalized)) {
		return normalized;
	}
	return joinPath(normalized, MANAGED_SUBFOLDER);
};

/**
 * Returns the browse root (parent folder) for a workspace managed root.
 * Strips trailing /ty-plus (case-insensitive) to return the host root.
 */
export const resolveBrowseRoot = (managedRoot: string): string => {
	const normalized = managedRoot.replace(/[\\/]+$/, "");
	return normalized.replace(/[\\/]ty-plus$/i, "");
};

/**
 * Returns the path to the support-root locator file.
 */
export const resolveLocatorPathFromAppRoot = (appRoot: string): string =>
	joinPath(appRoot, LOCATOR_FILE_NAME);

// ── New managed tree path utilities ─────────────────────────────────────────

// `supportRoot` is the managed product root (…/ty-plus). Paths are relative to it.

/**
 * Returns the path to settings/app.json
 */
export const resolveSettingsAppJsonPath = (supportRoot: string): string =>
	joinPath(supportRoot, SETTINGS_SUBDIR, APP_JSON);

/**
 * Returns the path to settings/paths.json
 */
export const resolveSettingsPathsJsonPath = (supportRoot: string): string =>
	joinPath(supportRoot, SETTINGS_SUBDIR, PATHS_JSON);

/**
 * Returns the path to settings/ui.json
 */
export const resolveSettingsUiJsonPath = (supportRoot: string): string =>
	joinPath(supportRoot, SETTINGS_SUBDIR, UI_JSON);

/**
 * Returns the path to settings/control-panel.json
 */
export const resolveControlPanelJsonPath = (supportRoot: string): string =>
	joinPath(supportRoot, SETTINGS_SUBDIR, CONTROL_PANEL_JSON);

/**
 * Returns `panels/panel-N.json` under the managed ty-plus root (layout chrome per surface).
 */
export const resolvePanelChromeJsonPath = (
	managedRoot: string,
	panelIndex: 1 | 2 | 3 | 4 | 5,
): string => joinPath(managedRoot, PANELS_SUBDIR, `panel-${panelIndex}.json`);

/**
 * Returns the path to workspaces/workspace-N.json (1-5)
 */
export const resolvePanelJsonPath = (
	supportRoot: string,
	index: 1 | 2 | 3 | 4 | 5,
): string =>
	joinPath(supportRoot, WORKSPACES_SUBDIR, `workspace-${index}.json`);

/**
 * Returns the path to presets/presets.json
 */
export const resolvePresetsJsonPath = (supportRoot: string): string =>
	joinPath(supportRoot, PRESETS_SUBDIR, PRESETS_JSON);

/**
 * Returns the path to groups/groups.json
 */
export const resolveGroupsJsonPath = (supportRoot: string): string =>
	joinPath(supportRoot, GROUPS_SUBDIR, GROUPS_JSON);

/**
 * Returns the path to widgets/widgets.json
 */
export const resolveWidgetsJsonPath = (supportRoot: string): string =>
	joinPath(supportRoot, WIDGETS_SUBDIR, WIDGETS_JSON);

/**
 * Returns the path to widgets/state/<stateName>.json
 */
export const resolveWidgetStateJsonPath = (
	supportRoot: string,
	stateName: string,
): string =>
	joinPath(supportRoot, WIDGETS_SUBDIR, WIDGET_STATE_DIR, `${stateName}.json`);

/**
 * Returns the path to history/snapshots.json (shared across all panels)
 */
export const resolveSnapshotsJsonPath = (supportRoot: string): string =>
	joinPath(supportRoot, WORKSPACES_SUBDIR, HISTORY_SUBDIR, SNAPSHOTS_JSON);

/**
 * Returns the path to styles/theme.css
 */
export const resolveStylesThemeCssPath = (supportRoot: string): string =>
	joinPath(supportRoot, STYLES_SUBDIR, THEME_CSS_FILE_NAME);

/**
 * Returns the path to styles/workspaces/workspace-N.css (1-5)
 */
export const resolveCssPath = (
	supportRoot: string,
	index: 1 | 2 | 3 | 4 | 5,
): string =>
	joinPath(
		supportRoot,
		STYLES_SUBDIR,
		STYLES_WORKSPACES_SUBDIR,
		`${WORKSPACE_CSS_PREFIX}${index}${WORKSPACE_CSS_SUFFIX}`,
	);

/**
 * Returns the path to logs/ty-plus.log
 */
export const resolveLogPath = (supportRoot: string): string =>
	joinPath(supportRoot, LOGS_SUBDIR, LOG_FILE_NAME);
