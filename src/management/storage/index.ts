/**
 * management/storage/
 *
 * **Ownership:** read-only filesystem access lives under `storage/read/*`;
 * mutations, elevation, and directory creation live under `storage/write/*`.
 * `file` owns path strings only. Domain-specific
 * persistence (catalogs, widget records, UI settings, workspace layout meaning)
 * lives under `management/catalog`, `management/widget`, `management/setting`,
 * `management/workspace`, etc. This barrel re-exports those modules for stable
 * import paths while new code should prefer domain paths directly.
 */

// Re-export workspace UI settings store
export {
	readUiSettings,
	writeUiSettings,
} from "@/management/setting/persistence/workspace-ui-settings-file";
// Re-export cache-store (notifications / remote-presets / public-links)
export { writePublicLinks } from "@/management/storage/cache-store";
// Re-export id utilities for tests
export { isOpaqueInstanceId } from "@/management/storage/ids";
// Re-export text file read
export { readTextFile } from "@/management/storage/read/text-file";
// Re-export persistence gateway types
// Re-export runtime initialization

// Re-export all storage primitives
// Re-export localStorage persistence functions
export {
	clearWorkspacePanelStateFromSettingsJson,
	mergeGroupPresetLayoutIntoSettingsJson,
	movePresetPlacement,
	readPanelPresetIdsFromSettingsJson,
	readPresetsJson,
	readSettings,
	readThemeCss,
	saveControlPanelState,
	writePresetsJson,
	writeSettings,
	writeThemeCss,
} from "@/management/storage/workspace/store";
// Re-export CEP file operations

// Re-export widget record store
export {
	readWidgetRecords,
	upsertWidgetRecords,
	writeWidgetRecords,
} from "@/management/widget/persistence/records-file";
// Re-export workspace layout storage (panel-json-files)
export {
	readBackgroundJson,
	readNJson,
	removeNJson,
	writeBackgroundJson,
	writeNJson,
} from "@/management/workspace/layout/panel-json-files";
// Re-export workspace layout persistence
export {
	clearLayoutNJson,
	indexFromPanelId,
} from "@/management/workspace/layout/persistence";
// Re-export group/widget catalog records
