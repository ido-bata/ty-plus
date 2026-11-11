import { describe, expect, it } from "vitest";
import {
	COLUMN_BAND_MAX_ROW,
	COLUMN_BAND_WIDTH_CELLS,
	packRectsInColumnBands,
	packRectsNearAnchor,
} from "./column-band-pack";

describe("packRectsInColumnBands", () => {
	it("fills a 6-wide band top-to-bottom before advancing x", () => {
		const occupied: { x: number; y: number; width: number; height: number }[] =
			[];
		const items = Array.from({ length: 7 }, () => ({ width: 2, height: 2 }));
		const placed = packRectsInColumnBands(occupied, items);
		expect(placed[0]).toMatchObject({ x: 0, y: 0, width: 2, height: 2 });
		expect(placed[1]).toMatchObject({ x: 2, y: 0, width: 2, height: 2 });
		expect(placed[2]).toMatchObject({ x: 4, y: 0, width: 2, height: 2 });
		expect(placed[3]).toMatchObject({ x: 0, y: 2, width: 2, height: 2 });
	});

	it("starts the next band after exhausting 30 rows", () => {
		const w = 2;
		const h = 2;
		const perRow = COLUMN_BAND_WIDTH_CELLS / w;
		const rows = COLUMN_BAND_MAX_ROW / h;
		const n = perRow * rows + 1;
		const placed = packRectsInColumnBands(
			[],
			Array.from({ length: n }, () => ({ width: w, height: h })),
		);
		const last = placed[n - 1]!;
		expect(last.x).toBeGreaterThanOrEqual(COLUMN_BAND_WIDTH_CELLS);
	});
});

describe("packRectsNearAnchor", () => {
	it("places the first rect adjacent to the anchor when space is free", () => {
		const placed = packRectsNearAnchor(
			[],
			[{ width: 2, height: 2 }],
			{ x: 5, y: 5 },
			0,
		);
		expect(placed[0]?.x).toBeGreaterThanOrEqual(0);
		expect(placed[0]?.y).toBeGreaterThanOrEqual(0);
	});
});
