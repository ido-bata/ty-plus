import { describe, expect, it } from "vitest";
import { parseGridCells } from "../layout/grid-document";
import { clipSelection, serialize, tilesFromDocument } from "./tiles";

describe("clipSelection", () => {
	it("drops out-of-range, non-finite, and duplicate indices", () => {
		expect(clipSelection([0, 1, 99, -1, Number.NaN, 1], 3)).toEqual([0, 1]);
	});

	it("returns empty when length is zero", () => {
		expect(clipSelection([0, 1], 0)).toEqual([]);
	});
});

describe("surface layout JSON round-trip", () => {
	it("round-trips geometry-only cells through serialize", () => {
		const tiles = parseGridCells([
			{ id: "wsi:test", x: 0, y: 0, width: 1, height: 1 },
			{ id: "preset-a", x: 2, y: 0, width: 1, height: 1 },
		]);
		const json = serialize(tiles);
		const doc = JSON.parse(json) as { gridCells: unknown[] };
		expect(doc).not.toHaveProperty("version");
		expect(parseGridCells(doc)).toEqual(tiles);
	});
});

describe("tilesFromDocument", () => {
	it("preserves geometry rows when preset catalog is empty (container-first)", () => {
		const tiles = tilesFromDocument({
			layout: {
				gridCells: [
					{ id: "opaque-placement-1", x: 0, y: 0, width: 2, height: 2 },
					{ id: "missing-preset-id", x: 3, y: 0, width: 1, height: 1 },
				],
			},
			widgetRecords: [],
			presets: [],
			panelPresetIds: [],
		});
		expect(tiles).toHaveLength(2);
		expect(tiles.map((t) => t.id)).toEqual([
			"opaque-placement-1",
			"missing-preset-id",
		]);
		expect(tiles[0]).toMatchObject({ x: 0, y: 0, width: 2, height: 2 });
	});

	it("does not stack every preset on auxiliary panels when layout and filter are empty", () => {
		const tiles = tilesFromDocument({
			layout: { gridCells: [] },
			widgetRecords: [],
			presets: [
				{ id: "p-a", type: "preset", title: "A", filePath: "C:/a.ffx" },
				{ id: "p-b", type: "preset", title: "B", filePath: "C:/b.ffx" },
			],
			panelPresetIds: [],
			implicitlyFillAllPresetsWhenLayoutEmpty: false,
		});
		expect(tiles).toHaveLength(0);
	});

	it("stacks every preset on primary panel when layout is empty (implicit fill recovery)", () => {
		const tiles = tilesFromDocument({
			layout: { gridCells: [] },
			widgetRecords: [],
			presets: [
				{ id: "p-a", type: "preset", title: "A", filePath: "C:/a.ffx" },
				{ id: "p-b", type: "preset", title: "B", filePath: "C:/b.ffx" },
			],
			panelPresetIds: [],
			implicitlyFillAllPresetsWhenLayoutEmpty: true,
		});
		expect(tiles.map((t) => t.id)).toEqual(["p-a", "p-b"]);
	});

	it("presetLayoutRoster maps opaque placement ids to catalog preset ids on tiles", () => {
		const catId = "c1111111-1111-4111-8111-111111111111";
		const placementId = "ppi:aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
		const tiles = tilesFromDocument({
			layout: {
				gridCells: [{ id: placementId, x: 0, y: 0, width: 1, height: 1 }],
				presetLayoutRoster: [{ placementId, presetRefId: catId }],
			},
			widgetRecords: [],
			presets: [
				{ id: catId, type: "preset", title: "X", filePath: "C:/x.ffx" },
			],
			panelPresetIds: [],
		});
		expect(tiles).toHaveLength(1);
		expect(tiles[0]?.id).toBe(catId);
	});
});
