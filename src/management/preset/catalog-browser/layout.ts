/**
 * Shared layout tokens for preset catalog UI and directory-browser widget
 * (same row grid and icon grid as the preset list dialog).
 */
export const LIST_ROW_GRID =
	"grid grid-cols-[2.25rem_2rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5";

/** Minimum column width at scale 1.0 (rem); effective width is multiplied by icon grid scale. */
export const ICON_CELL_BASE_REM = 5.5;

export const ICON_GRID_CLASS =
	"grid w-full min-w-0 gap-2 grid-cols-[repeat(auto-fill,minmax(var(--preset-icon-cell,5.5rem),1fr))]";

/** localStorage key shared by preset list dialog and directory-browser widget */
export const ICON_GRID_SCALE_LS_KEY = "ty.preset-list.icon-grid-scale";

/** localStorage key for icon tile aspect (square vs wide) */
export const ICON_TILE_ASPECT_LS_KEY = "ty.preset-list.icon-tile-aspect";

export type IconTileAspect = "square" | "wide";

function readIconGridScale(): number {
	if (typeof window === "undefined") {
		return 1;
	}
	try {
		const raw = window.localStorage.getItem(ICON_GRID_SCALE_LS_KEY);
		if (!raw) {
			return 1;
		}
		const n = Number.parseFloat(raw);
		if (!Number.isFinite(n)) {
			return 1;
		}
		return Math.min(1.75, Math.max(0.65, n));
	} catch {
		return 1;
	}
}

function readIconTileAspect(): IconTileAspect {
	if (typeof window === "undefined") {
		return "square";
	}
	try {
		return window.localStorage.getItem(ICON_TILE_ASPECT_LS_KEY) === "wide"
			? "wide"
			: "square";
	} catch {
		return "square";
	}
}

export function iconTileMediaClass(aspect: IconTileAspect): string {
	return aspect === "wide" ? "aspect-video w-full" : "aspect-square w-full";
}
