/**
 * Fallback colors for widget canvas renderers. Canvas 2D cannot resolve
 * `var(--…)`; these are used only when the `--ty-*` custom property read
 * comes back empty (unthemed / test contexts).
 */

export const CANVAS_FALLBACK_TEXT_COLOR = "#fff";
export const CANVAS_FALLBACK_MUTED_COLOR = "#999";
export const CANVAS_FALLBACK_GRID_COLOR = "rgba(255,255,255,0.14)";
export const CANVAS_FALLBACK_SURFACE_COLOR = "#1e1e1e";
export const CANVAS_HOLLOW_DOT_FILL = "rgba(0,0,0,0.6)";
