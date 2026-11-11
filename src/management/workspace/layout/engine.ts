import type {
	GridSettings,
	Layout,
} from "@/management/workspace/layout/grid-document";

/** Archive explored max(6, …)+4 cols and y up to 2000. CEP uses actual widget bounds + margin for canvas. */
const MIN_COLS = 12;
const MIN_ROWS = 24;
const GRID_MARGIN_CELLS = 2;

export const computeGridTracks = (
	widgets: readonly Pick<Layout, "x" | "y" | "width" | "height">[],
): { cols: number; rows: number } => {
	let cols = MIN_COLS;
	let rows = MIN_ROWS;
	for (const w of widgets) {
		const x2 = w.x + Math.max(1, w.width) + GRID_MARGIN_CELLS;
		const y2 = w.y + Math.max(1, w.height) + GRID_MARGIN_CELLS;
		if (x2 > cols) cols = x2;
		if (y2 > rows) rows = y2;
	}
	return {
		cols,
		rows,
	};
};

/** Grid coord ↁEpixel offset (includes leading gap on each axis) */
const toOffset = (pos: number, g: GridSettings): number =>
	pos * (g.cellSize + g.gap) + g.gap;

/** Grid span ↁEpixel size */
const toPixels = (span: number, g: GridSettings): number =>
	span * g.cellSize + (span - 1) * g.gap;

/** Total pixel dimension for N tracks (including outer gap on both sides) */
export const tracksToPixels = (tracks: number, g: GridSettings): number =>
	tracks * (g.cellSize + g.gap) + g.gap;

export type WidgetRect = {
	left: number;
	top: number;
	width: number;
	height: number;
};

export const getTileRect = (w: Layout, g: GridSettings): WidgetRect => ({
	left: toOffset(w.x, g),
	top: toOffset(w.y, g),
	width: toPixels(w.width, g),
	height: toPixels(w.height, g),
});

/** Pixel offset ↁEnearest grid coordinate */
export const snapPosition = (px: number, g: GridSettings): number =>
	Math.max(0, Math.round((px - g.gap) / (g.cellSize + g.gap)));

/** Pixel size ↁEnearest grid span (min 1) */
export const snapSpan = (px: number, g: GridSettings): number =>
	Math.max(1, Math.round((px + g.gap) / (g.cellSize + g.gap)));

export type PlacementItem = {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
};

/**
 * Placement-aware grid bounds.
 * - Includes max right/bottom of all placements.
 * - Includes visible viewport cell capacity.
 * - Adds tokenized overscan on all sides.
 */
/**
 * Pack all items into a grid starting from top-left (x=0, y=0).
 * Farthest items from origin are moved first toward top-left.
 * Items already close to top-left stay in place.
 * Returns new PlacementItem[] with updated x, y positions; original sizes preserved.
 */
export const packTopLeft = (
	items: PlacementItem[],
	_grid: GridSettings,
): PlacementItem[] => {
	if (items.length === 0) return [];

	// Clone so we don't mutate inputs
	const result: PlacementItem[] = items.map((item) => ({ ...item }));

	// Sort from farthest to closest (process far items first)
	const sorted = [...result].sort((a, b) => {
		const da = a.x * a.x + a.y * a.y;
		const db = b.x * b.x + b.y * b.y;
		if (db !== da) return db - da;
		if (b.y !== a.y) return b.y - a.y;
		if (b.x !== a.x) return b.x - a.x;
		return a.id.localeCompare(b.id);
	});

	// Track occupied cells - initially all items are at their original positions
	const occupied = new Set<string>();
	for (const item of result) {
		for (let cy = item.y; cy < item.y + item.height; cy++) {
			for (let cx = item.x; cx < item.x + item.width; cx++) {
				occupied.add(`${cx},${cy}`);
			}
		}
	}

	const fits = (x: number, y: number, w: number, h: number): boolean => {
		if (x < 0 || y < 0) return false;
		for (let cy = y; cy < y + h; cy++) {
			for (let cx = x; cx < x + w; cx++) {
				if (occupied.has(`${cx},${cy}`)) return false;
			}
		}
		return true;
	};

	// BFS to find nearest available cell from top-left
	const findNearestAvailable = (
		width: number,
		height: number,
	): { x: number; y: number } | null => {
		const visited = new Set<string>();
		const queue: Array<[number, number]> = [[0, 0]];

		while (queue.length > 0) {
			const next = queue.shift();
			if (!next) break;
			const [x, y] = next;
			const key = `${x},${y}`;
			if (visited.has(key)) continue;
			visited.add(key);

			if (fits(x, y, width, height)) {
				return { x, y };
			}

			// Add neighbors for BFS (spiral pattern from top-left)
			const neighbors: Array<[number, number]> = [
				[x + 1, y],
				[x, y + 1],
				[x - 1, y],
				[x, y - 1],
			];
			for (const [nx, ny] of neighbors) {
				if (nx >= 0 && ny >= 0 && ny < 2000) {
					const nkey = `${nx},${ny}`;
					if (!visited.has(nkey)) {
						queue.push([nx, ny]);
					}
				}
			}
		}
		return null;
	};

	// Process items from farthest to closest
	for (const item of sorted) {
		// Free current position temporarily
		for (let cy = item.y; cy < item.y + item.height; cy++) {
			for (let cx = item.x; cx < item.x + item.width; cx++) {
				occupied.delete(`${cx},${cy}`);
			}
		}

		// Find nearest available position from top-left
		const best = findNearestAvailable(item.width, item.height);

		if (best) {
			item.x = best.x;
			item.y = best.y;
		}
		// If no better position found (shouldn't happen), keep original

		// Re-occupy the new position
		for (let cy = item.y; cy < item.y + item.height; cy++) {
			for (let cx = item.x; cx < item.x + item.width; cx++) {
				occupied.add(`${cx},${cy}`);
			}
		}
	}

	// Return in original order
	return result;
};

const _computeGridBounds = (
	placements: readonly PlacementItem[],
	grid: GridSettings,
	viewport: { width: number; height: number },
	overscan: number,
): { cols: number; rows: number } => {
	let cols = MIN_COLS;
	let rows = MIN_ROWS;

	for (const p of placements) {
		const x2 = p.x + Math.max(1, p.width) + GRID_MARGIN_CELLS;
		const y2 = p.y + Math.max(1, p.height) + GRID_MARGIN_CELLS;
		if (x2 > cols) cols = x2;
		if (y2 > rows) rows = y2;
	}

	// Viewport-derived minimum tracks (convert pixel size to grid span)
	const vpCols = snapSpan(viewport.width, grid);
	const vpRows = snapSpan(viewport.height, grid);
	if (vpCols > cols) cols = vpCols;
	if (vpRows > rows) rows = vpRows;

	// Tokenized overscan margin
	const effectiveOverscan = Math.max(0, overscan);
	cols += effectiveOverscan;
	rows += effectiveOverscan;

	return { cols, rows };
};
