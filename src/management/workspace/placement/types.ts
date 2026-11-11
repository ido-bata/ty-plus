/**
 * DOM data attributes for the workspace placement surface.
 * Tile role (widget vs preset) is not stored as a generic "kind"; callers resolve ids via `resolve`.
 */

// ---------------------------------------------------------------------------
// Shared data attribute constants
// ---------------------------------------------------------------------------

export const ATTR_SCROLL = "data-workspace-scroll";
export const ATTR_GRID = "data-workspace-grid";
/** Primary shell key: index into `surfaceTiles` (stringified non‑negative int). */
export const ATTR_PLACEMENT_INDEX = "data-workspace-surface-index";
// Note: ATTR_PLACEMENT_ID was an alias kept during refactors — do not re-add
/** Present on widget tiles (shell grid chrome only). */
export const ATTR_WIDGET_TILE = "data-workspace-widget-tile";
/** Present on preset / non-group catalog tiles. */
export const ATTR_PRESET_TILE = "data-workspace-preset-tile";
/** Present on group-preset tiles (drop targets, etc.). */
export const ATTR_GROUP_TILE = "data-workspace-group-tile";
export const ATTR_PRESET_ID = "data-preset-id";
export const ATTR_GROUP_PANEL = "data-workspace-group-panel";
const ATTR_WIDGET_TEXT_STYLE = "data-widget-text-style";
const ATTR_TEXT_FONT_SELECT = "data-text-font-select";
export const ATTR_DRAGGING = "data-dragging";
/** Quick-actions / merged search palette: ties DOM input to `SurfaceState.quickActionSearchByWidgetInstanceId`. */
export const ATTR_WIDGET_INSTANCE_ID = "data-widget-instance-id";

// ---------------------------------------------------------------------------
// Id helper
// ---------------------------------------------------------------------------

/** Returns the surface tile index from a rendered React element or null. */
function getSurfaceIndex(el: Element | null): number | null {
	if (!el) return null;
	const raw = el.getAttribute(ATTR_PLACEMENT_INDEX)?.trim() ?? "";
	if (raw === "") return null;
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) && n >= 0 ? n : null;
}

/** @deprecated Use getSurfaceIndex */
export function getPlacementId(el: Element | null): string | null {
	const i = getSurfaceIndex(el);
	return i === null ? null : String(i);
}
