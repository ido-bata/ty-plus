/**
 * Host-free preset workspace surface.
 *
 * This barrel is the explicit entry point for non-CEP consumers (the
 * official Web LP demo today; future online preset surfaces later).
 * Everything exported here must render without After Effects, CEP,
 * ExtendScript, the filesystem, or panel storage — host-backed lookups
 * (`PresetGlyphById`, `use-cases`, catalog repositories) deliberately stay
 * out of this module. `apps/web` may only import product UI through the
 * entry points enforced by its boundary contract test.
 */

export type { Preset } from "@/management/preset/contract";
export {
	DEFAULT_EMOJI_CLASS,
	frameBase,
	framedTextClass,
	glyphBoxCompactClass,
	glyphBoxCompactPadClass,
	glyphBoxFillClass,
	glyphBoxFlushClass,
	glyphEmojiProminentClass,
} from "@/management/preset/workspace/glyph/classes";
export type {
	FramedPresetGlyphProps,
	PresetCatalogGlyphHostProps,
} from "@/management/preset/workspace/glyph/WorkspaceGlyph";
export {
	FramedPresetGlyph,
	PresetCatalogGlyphHost,
	WorkspacePresetGlyph,
} from "@/management/preset/workspace/glyph/WorkspaceGlyph";
export type { PresetTileButtonProps } from "@/management/preset/workspace/PresetTileButton";
export { PresetTileButton } from "@/management/preset/workspace/PresetTileButton";
export { Tile } from "@/management/preset/workspace/Tile";
export type { WorkspaceTileFrameProps } from "@/management/workspace/surface/TileFrame";
export { WorkspaceTileFrame } from "@/management/workspace/surface/TileFrame";
