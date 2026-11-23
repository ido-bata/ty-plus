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
export { PresetTileButton } from "@/management/preset/workspace/PresetTileButton";
export { Tile } from "@/management/preset/workspace/Tile";
