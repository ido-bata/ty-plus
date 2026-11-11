import { describe, expect, it } from "vitest";
import { autoPlaceRequestsOnGrid } from "./gateway";

describe("autoPlaceRequestsOnGrid", () => {
	it("treats existing preset rects as blocking cells", () => {
		const placed = autoPlaceRequestsOnGrid({
			widgetLayouts: [],
			existingPresetRects: [{ x: 0, y: 0, width: 2, height: 2 }],
			presetRequests: [{ presetRefId: "a" }],
			auto: { axis: -1 },
			defaultTile: { width: 2, height: 2 },
		});
		expect(placed).toHaveLength(1);
		expect(placed[0]?.x).toBeGreaterThanOrEqual(0);
		expect(placed[0]?.presetRefId).toBe("a");
		const overlaps =
			placed[0] &&
			placed[0].x < 2 &&
			placed[0].x + placed[0].width > 0 &&
			placed[0].y < 2 &&
			placed[0].y + placed[0].height > 0;
		expect(overlaps).toBe(false);
	});
});
