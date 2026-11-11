import {
	snapPosition,
	tracksToPixels,
} from "@/management/workspace/layout/engine";
import type { GridSettings } from "@/management/workspace/layout/grid-document";
import type { Tile } from "@/management/workspace/surface/tiles";

const RING_CELLS = 1;

const gridOffset = (pos: number, g: GridSettings): number =>
	pos * (g.cellSize + g.gap) + g.gap;

const gridSpanPx = (span: number, g: GridSettings): number =>
	span * g.cellSize + (span - 1) * g.gap;

export type GroupPanelFrame = {
	left: number;
	top: number;
	width: number;
	height: number;
	innerWidthPx: number;
	itemStridePx: number;
	innerCols: number;
	innerRows: number;
	/** Member grid columns = container width + ring on each side (`tile.width + 2`). */
	memberGridCols: number;
};

export function computeGroupPanelFrame(
	tile: Pick<Tile, "x" | "y" | "width" | "height">,
	grid: GridSettings,
	viewCols: number,
	viewRows: number,
): GroupPanelFrame {
	const outerW = tile.width + RING_CELLS * 2;
	const outerH = tile.height + RING_CELLS * 2;
	let startCol = tile.x - RING_CELLS;
	let startRow = tile.y - RING_CELLS;
	const maxStartCol = Math.max(0, viewCols - outerW);
	const maxStartRow = Math.max(0, viewRows - outerH);
	if (startCol < 0) startCol = 0;
	if (startRow < 0) startRow = 0;
	if (startCol > maxStartCol) startCol = maxStartCol;
	if (startRow > maxStartRow) startRow = maxStartRow;

	const itemStridePx = grid.cellSize + grid.gap;
	const memberGridCols = outerW;

	return {
		left: gridOffset(startCol, grid) - grid.gap - 1,
		top: gridOffset(startRow, grid) - grid.gap - 1,
		width: tracksToPixels(outerW, grid) + 2,
		height: tracksToPixels(outerH, grid) + 2,
		innerWidthPx: gridSpanPx(memberGridCols, grid),
		itemStridePx,
		innerCols: tile.width,
		innerRows: tile.height,
		memberGridCols,
	};
}

function memberIndexFromPanelPoint(
	localX: number,
	localY: number,
	cols: number,
	itemStridePx: number,
	memberCount: number,
): number {
	if (memberCount <= 0) return 0;
	const n = Math.max(1, Math.trunc(cols));
	const stride = Math.max(1, itemStridePx);
	const col = Math.min(
		n - 1,
		Math.max(0, Math.floor(Math.max(0, localX) / stride)),
	);
	const row = Math.max(0, Math.floor(Math.max(0, localY) / stride));
	const idx = row * n + col;
	return Math.min(memberCount - 1, idx);
}

function workspaceCellFromClientPoint(
	scrollEl: Element,
	gridEl: Element,
	clientX: number,
	clientY: number,
	offsetX: number,
	offsetY: number,
	grid: GridSettings,
): { x: number; y: number } {
	const gridRect = gridEl.getBoundingClientRect();
	const localX = clientX - offsetX - gridRect.left + scrollEl.scrollLeft;
	const localY = clientY - offsetY - gridRect.top + scrollEl.scrollTop;
	return {
		x: snapPosition(localX, grid),
		y: snapPosition(localY, grid),
	};
}
