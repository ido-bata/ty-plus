/**
 * Trace preset / group catalog tile display path
 * (workspace emit → preset receive → icon resolve).
 * Filter devtools: `[ty-plus:catalog-tile-display]`.
 */
export type CatalogTileDisplayLane = "emit" | "receive" | "icon-resolve";

// Disabled: too noisy in production
export function logCatalogTileDisplay(
	_lane: CatalogTileDisplayLane,
	_phase: string,
	_detail?: unknown,
): void {
	// noop
}
