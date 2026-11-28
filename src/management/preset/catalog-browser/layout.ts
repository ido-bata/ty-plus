import { css } from "@/styled-system/css";

/**
 * Shared layout tokens for preset catalog UI and directory-browser widget
 * (same row grid and icon grid as the preset list dialog).
 *
 * These must stay PandaCSS `css()` recipes: raw Tailwind utility strings
 * generate zero CSS in the Panda-only bundle (Issue #127/#143).
 */
export const LIST_ROW_GRID = css({
	display: "grid",
	gridTemplateColumns: "2.25rem 2rem minmax(0,1fr) 4.75rem",
	alignItems: "center",
	columnGap: "2",
	rowGap: "0.5",
});

/** Minimum column width at scale 1.0 (rem); effective width is multiplied by icon grid scale. */
export const ICON_CELL_BASE_REM = 5.5;

export const ICON_GRID_CLASS = css({
	display: "grid",
	width: "full",
	minWidth: 0,
	gap: "2",
	gridTemplateColumns:
		"[repeat(auto-fill,minmax(var(--preset-icon-cell,5.5rem),1fr))]",
});

const iconTileMediaSquare = css({
	width: "full",
	aspectRatio: "[1/1]",
});

const iconTileMediaWide = css({
	width: "full",
	aspectRatio: "[16/9]",
});

/** localStorage key shared by preset list dialog and directory-browser widget */
export const ICON_GRID_SCALE_LS_KEY = "ty.preset-list.icon-grid-scale";

/** localStorage key for icon tile aspect (square vs wide) */
export const ICON_TILE_ASPECT_LS_KEY = "ty.preset-list.icon-tile-aspect";

export type IconTileAspect = "square" | "wide";

export function iconTileMediaClass(aspect: IconTileAspect): string {
	return aspect === "wide" ? iconTileMediaWide : iconTileMediaSquare;
}
