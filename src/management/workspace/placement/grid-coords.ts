import type { GridSettings } from "@/management/workspace/layout/grid-document";
/**
 * Pure helpers to map viewport client coordinates to workspace grid cell
 * coordinates. The group-panel D&D flow uses this to honor the drop position
 * instead of falling back to the default top-down auto-pack.
 */
import { ATTR_SCROLL } from "@/management/workspace/placement/types";

export type GridCell = { x: number; y: number };

/**
 * Convert a viewport client point to the workspace grid cell coordinate.
 * Returns null when the grid element is missing, the grid is non-positive in
 * stride, or the point is outside the grid rectangle.
 */
export function gridClientPointToCell(
	clientX: number,
	clientY: number,
	gridEl: HTMLElement | null,
	grid: GridSettings,
): GridCell | null {
	if (!gridEl) return null;
	const rect = gridEl.getBoundingClientRect();
	if (clientX < rect.left || clientX > rect.right) return null;
	if (clientY < rect.top || clientY > rect.bottom) return null;
	const scrollEl = gridEl.closest<HTMLElement>(`[${ATTR_SCROLL}]`);
	const scrollLeft = scrollEl?.scrollLeft ?? 0;
	const scrollTop = scrollEl?.scrollTop ?? 0;
	const cellStride = grid.cellSize + grid.gap;
	if (cellStride <= 0) return null;
	const localX = clientX - rect.left + scrollLeft;
	const localY = clientY - rect.top + scrollTop;
	return {
		x: Math.max(0, Math.floor(localX / cellStride)),
		y: Math.max(0, Math.floor(localY / cellStride)),
	};
}
