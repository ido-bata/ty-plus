/**
 * Preset management public API
 */

export {
	AuthoringField,
	AuthoringGrid,
	AuthoringSection,
	AuthoringSegment,
} from "@/management/preset/authoring-layout";
export { readUserHomeOrFallback } from "@/management/preset/catalog-add/browse-start-dir";
export { PathDialog } from "@/management/preset/catalog-add/PathDialog";
export {
	ICON_CELL_BASE_REM,
	ICON_GRID_CLASS,
	ICON_GRID_SCALE_LS_KEY,
	ICON_TILE_ASPECT_LS_KEY,
	type IconTileAspect,
	iconTileMediaClass,
	LIST_ROW_GRID,
} from "@/management/preset/catalog-browser/layout";
export { CatalogBrowserShell } from "@/management/preset/catalog-browser/shell";
export * from "@/management/preset/contract";
export { GroupDialog } from "@/management/preset/group/Dialog";
export { coercePersistedPresetIcon } from "@/management/preset/icon/normalize";
export { ImportDialog } from "@/management/preset/import/Dialog";
export { Dialog as ToolDialog } from "@/management/preset/tool-shell/Dialog";
export {
	getPreset,
	removeLocalPreset,
	upsertLocalPreset,
} from "@/management/preset/use-cases";
export { WorkspacePresetGlyph } from "@/management/preset/workspace/glyph";
export { PresetGlyphById } from "@/management/preset/workspace/glyph-by-id";
export {
	glyphBoxCompactClass,
	glyphBoxCompactPadClass,
	glyphBoxFillClass,
	glyphBoxFlushClass,
	glyphEmojiProminentClass,
} from "@/management/preset/workspace/glyph-classes";
