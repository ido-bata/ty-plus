/**
 * Deterministic auto-placement: 6-cell-wide vertical bands, each band uses rows 0..29,
 * then the next band starts at x += 6 (infinite bands horizontally, infinite items).
 */

export const COLUMN_BAND_WIDTH_CELLS = 6;
export const COLUMN_BAND_MAX_ROW = 30;

export type CellRect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

const rectsOverlap = (a: CellRect, b: CellRect): boolean =>
	!(
		a.x + a.width <= b.x ||
		b.x + b.width <= a.x ||
		a.y + a.height <= b.y ||
		b.y + b.height <= a.y
	);

const anyOverlap = (occupied: readonly CellRect[], rect: CellRect): boolean =>
	occupied.some((o) => rectsOverlap(o, rect));

const cloneOccupied = (occupied: readonly CellRect[]): CellRect[] =>
	occupied.map((r) => ({ ...r }));

/**
 * Pack rectangles into column bands without overlapping `occupiedInput`.
 * Each band is [band*6, band*6+6) in x and y in [0, COLUMN_BAND_MAX_ROW) for **placement**
 * (an item may not extend past y === COLUMN_BAND_MAX_ROW).
 */
export const packRectsInColumnBands = (
	occupiedInput: readonly CellRect[],
	items: ReadonlyArray<Pick<CellRect, "width" | "height">>,
): CellRect[] => {
	const occupied = cloneOccupied(occupiedInput);
	const placed: CellRect[] = [];

	for (const raw of items) {
		const w = Math.max(1, Math.round(raw.width));
		const h = Math.max(1, Math.round(raw.height));

		let found: CellRect | null = null;

		for (let band = 0; band < 1_000_000 && !found; band++) {
			const bandX = band * COLUMN_BAND_WIDTH_CELLS;
			const xMaxExclusive = bandX + COLUMN_BAND_WIDTH_CELLS;
			if (w > COLUMN_BAND_WIDTH_CELLS) {
				break;
			}
			for (let y = 0; y + h <= COLUMN_BAND_MAX_ROW && !found; y++) {
				for (let x = bandX; x + w <= xMaxExclusive && !found; x++) {
					const candidate: CellRect = { x, y, width: w, height: h };
					if (!anyOverlap(occupied, candidate)) {
						found = candidate;
					}
				}
			}
		}

		if (!found) {
			let y = 0;
			let x = 0;
			for (let guard = 0; guard < 50_000_000; guard++) {
				const candidate: CellRect = { x, y, width: w, height: h };
				if (!anyOverlap(occupied, candidate)) {
					found = candidate;
					break;
				}
				x++;
				if (x > 25_000) {
					x = 0;
					y++;
				}
			}
		}

		if (!found) {
			found = { x: 0, y: 0, width: w, height: h };
		}

		occupied.push(found);
		placed.push(found);
	}

	return placed;
};

/**
 * When items are wider than a single band, pack them below all occupied space using a
 * simple row scan (still overlap-free). Used as fallback from the gateway.
 */
export const packRectsInOverflowScan = (
	occupiedInput: readonly CellRect[],
	items: ReadonlyArray<Pick<CellRect, "width" | "height">>,
): CellRect[] => {
	const occupied = cloneOccupied(occupiedInput);
	const placed: CellRect[] = [];

	for (const raw of items) {
		const w = Math.max(1, Math.round(raw.width));
		const h = Math.max(1, Math.round(raw.height));
		let found: CellRect | null = null;
		for (let y = 0; y < 20_000 && !found; y++) {
			for (let x = 0; x < 20_000 && !found; x++) {
				const candidate: CellRect = { x, y, width: w, height: h };
				if (!anyOverlap(occupied, candidate)) {
					found = candidate;
				}
			}
		}
		if (!found) {
			found = { x: 0, y: 0, width: w, height: h };
		}
		occupied.push(found);
		placed.push(found);
	}

	return placed;
};

/**
 * Place near an anchor: expanding rings from `anchor`, tie-break by axis priority
 * (0 = prefer horizontal alignment first, 1 = prefer vertical alignment first).
 */
export const packRectsNearAnchor = (
	occupiedInput: readonly CellRect[],
	items: ReadonlyArray<Pick<CellRect, "width" | "height">>,
	anchor: { x: number; y: number },
	axisPriority: 0 | 1,
): CellRect[] => {
	const occupied = cloneOccupied(occupiedInput);
	const placed: CellRect[] = [];
	const ax = Math.max(0, Math.round(anchor.x));
	const ay = Math.max(0, Math.round(anchor.y));

	for (const raw of items) {
		const w = Math.max(1, Math.round(raw.width));
		const h = Math.max(1, Math.round(raw.height));
		let found: CellRect | null = null;

		for (let radius = 0; radius < 5_000 && !found; radius++) {
			const candidates: CellRect[] = [];
			for (let dy = -radius; dy <= radius; dy++) {
				for (let dx = -radius; dx <= radius; dx++) {
					if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
						continue;
					}
					const x = ax + dx;
					const y = ay + dy;
					if (x < 0 || y < 0) {
						continue;
					}
					candidates.push({ x, y, width: w, height: h });
				}
			}
			candidates.sort((a, b) => {
				const da = Math.abs(a.x - ax) + Math.abs(a.y - ay);
				const db = Math.abs(b.x - ax) + Math.abs(b.y - ay);
				if (da !== db) {
					return da - db;
				}
				if (axisPriority === 0) {
					if (a.y !== b.y) {
						return a.y - b.y;
					}
					return a.x - b.x;
				}
				if (a.x !== b.x) {
					return a.x - b.x;
				}
				return a.y - b.y;
			});

			for (const candidate of candidates) {
				if (!anyOverlap(occupied, candidate)) {
					found = candidate;
					break;
				}
			}
		}

		if (!found) {
			found = packRectsInOverflowScan(occupied, [{ width: w, height: h }])[0];
		}

		occupied.push(found);
		placed.push(found);
	}

	return placed;
};
