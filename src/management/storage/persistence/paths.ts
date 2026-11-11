/**
 * Single source of truth for every persistence file path.
 * All callers MUST go through this registry; no string concatenation elsewhere.
 *
 * `root` is always the managed root (…/ty-plus), obtained from managed-root.ts.
 */

export const PATHS = {
	// settings/
	app: (root: string) => `${root}/settings/app.json`,
	paths: (root: string) => `${root}/settings/paths.json`,
	ui: (root: string) => `${root}/settings/ui.json`,
	controlPanel: (root: string) => `${root}/settings/control-panel.json`,

	// catalogs
	presetCatalog: (root: string) => `${root}/presets/presets.json`,
	groupCatalog: (root: string) => `${root}/groups/groups.json`,
	widgetRecords: (root: string) => `${root}/widgets/widgets.json`,
	widgetState: (root: string, name: string) =>
		`${root}/widgets/state/${name}.json`,

	// workspaces/
	workspace: (root: string, i: 1 | 2 | 3 | 4 | 5) =>
		`${root}/workspaces/workspace-${i}.json`,
	workspaceBg: (root: string, i: 1 | 2 | 3 | 4 | 5) =>
		`${root}/workspaces/background/background-${i}.json`,
	snapshots: (root: string) => `${root}/workspaces/history/snapshots.json`,

	// panels/
	panelChrome: (root: string, i: 1 | 2 | 3 | 4 | 5) =>
		`${root}/panels/panel-${i}.json`,

	// clipboard/
	clipboard: (root: string) => `${root}/clipboard/clipboard.json`,

	// tool-handoff/
	toolHandoff: (root: string, extensionId: string) =>
		`${root}/tool-handoff/${extensionId}.json`,

	// cache/
	notifications: (root: string) => `${root}/cache/notifications.json`,
	remotePresets: (root: string) => `${root}/cache/remote-presets.json`,
	publicLinks: (root: string) => `${root}/cache/public-links.json`,
	candidates: (root: string) => `${root}/cache/candidates.json`,
	candidatesChunk: (root: string, id: string) =>
		`${root}/cache/candidates/${id}.json`,
} as const;

export type PersistenceKey = keyof typeof PATHS;
