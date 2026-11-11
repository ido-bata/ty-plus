import { describe, expect, it } from "vitest";
import {
	parseGridCells,
	parseLayoutDocument,
	serializePersistedLayoutDocument,
	toGridCellsJson,
} from "./grid-document";

const SAMPLE_CATALOG_PRESET_ID = "c1111111-1111-4111-8111-111111111111";

describe("parseGridCells", () => {
	it("parses valid layout array", () => {
		const input = [
			{ id: "widget-search", x: 10.4, y: 20.7, width: 100.2, height: 50.9 },
			{ id: "widget-menu", x: 0, y: 0, width: 80, height: 30 },
		];
		const result = parseGridCells(input);
		expect(result).toEqual([
			{ id: "widget-search", x: 10, y: 21, width: 100, height: 51 },
			{ id: "widget-menu", x: 0, y: 0, width: 80, height: 30 },
		]);
	});

	it("returns empty array for non-array input", () => {
		expect(parseGridCells(null)).toEqual([]);
		expect(parseGridCells(undefined)).toEqual([]);
		expect(parseGridCells({})).toEqual([]);
		expect(parseGridCells("string")).toEqual([]);
		expect(parseGridCells(42)).toEqual([]);
	});

	it("drops invalid entries", () => {
		const input = [
			{ id: "valid-widget", x: 10, y: 20, width: 100, height: 50 },
			{ id: null, x: 10, y: 20, width: 100, height: 50 },
			{ id: "missing-coords", x: "a", y: Number.NaN, width: 100, height: 50 },
			{ id: "missing-props" },
			null,
			undefined,
		];
		const result = parseGridCells(input);
		expect(result).toEqual([
			{ id: "valid-widget", x: 10, y: 20, width: 100, height: 50 },
		]);
	});

	it("rounds and clamps numeric values", () => {
		const input = [
			{ id: "rounding", x: 10.6, y: 10.4, width: 10.5, height: 10.4 },
			{ id: "negative-clamp", x: -5, y: -5, width: -10, height: -10 },
			{ id: "zero-clamp", x: 0, y: 0, width: 0.4, height: 0.4 },
		];
		const result = parseGridCells(input);
		expect(result).toEqual([
			{ id: "rounding", x: 11, y: 10, width: 11, height: 10 },
			{ id: "negative-clamp", x: 0, y: 0, width: 1, height: 1 },
			{ id: "zero-clamp", x: 0, y: 0, width: 1, height: 1 },
		]);
	});

	it("trims string id", () => {
		const input = [{ id: "  widget-id  ", x: 0, y: 0, width: 100, height: 50 }];
		const result = parseGridCells(input);
		expect(result[0]?.id).toBe("widget-id");
	});

	it("ignores extra fields on rows (id stays the persisted placement id)", () => {
		const placementId = "ppi:aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
		const input = [
			{
				id: placementId,
				presetRefId: SAMPLE_CATALOG_PRESET_ID,
				x: 0,
				y: 0,
				width: 1,
				height: 1,
			},
		];
		expect(parseGridCells(input)).toEqual([
			{
				id: placementId,
				x: 0,
				y: 0,
				width: 1,
				height: 1,
			},
		]);
		const doc = parseLayoutDocument(input);
		expect(doc.gridCells[0]?.id).toBe(placementId);
		expect("presetPlacements" in doc).toBe(false);
	});
});

describe("toGridCellsJson", () => {
	it("writes a layout document with trailing newline", () => {
		const gridCells = [
			{ id: "widget-search", x: 0, y: 0, width: 100, height: 50 },
			{ id: "widget-menu", x: 10, y: 10, width: 80, height: 30 },
		];
		const result = toGridCellsJson(gridCells);
		const parsed = JSON.parse(result) as {
			gridCells: typeof gridCells;
		};
		expect(parsed).not.toHaveProperty("version");
		expect(parsed.gridCells).toEqual(gridCells);
		expect("presetPlacements" in parsed).toBe(false);
		expect(result.endsWith("\n")).toBe(true);
	});

	it("writes empty gridCells with newline", () => {
		const result = toGridCellsJson([]);
		const parsed = JSON.parse(result) as { gridCells: unknown[] };
		expect(parsed.gridCells).toEqual([]);
		expect(result.endsWith("\n")).toBe(true);
	});
});

describe("serializePersistedLayoutDocument", () => {
	it("outputs only id and geometry for each row", () => {
		const json = serializePersistedLayoutDocument({
			gridCells: [
				{
					id: "aa0e8400-e29b-41d4-a716-446655440099",
					x: 0,
					y: 0,
					width: 1,
					height: 1,
				},
			],
		});
		const parsed = JSON.parse(json) as {
			gridCells: { id: string }[];
		};
		expect(parsed.gridCells[0]).toMatchObject({
			id: "aa0e8400-e29b-41d4-a716-446655440099",
		});
		expect("presetPlacements" in parsed).toBe(false);
		expect("presetLayoutRoster" in parsed).toBe(false);
		expect(json).not.toContain("pinnedRef");
	});
});

describe("parseLayoutDocument presetLayoutRoster", () => {
	it("keeps placement ids in gridCells when presetLayoutRoster is present", () => {
		const placementId = "ppi:aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
		const catId = SAMPLE_CATALOG_PRESET_ID;
		const json = serializePersistedLayoutDocument({
			gridCells: [{ id: placementId, x: 0, y: 0, width: 2, height: 2 }],
			presetLayoutRoster: [{ placementId, presetRefId: catId }],
		});
		const back = parseLayoutDocument(JSON.parse(json));
		expect(back.gridCells[0]?.id).toBe(placementId);
		expect(back.presetLayoutRoster).toEqual([
			{ placementId, presetRefId: catId },
		]);
	});

	it("ignores legacy presetPlacements when presetLayoutRoster is absent", () => {
		const placementId = "ppi:aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
		const doc = {
			version: 2,
			items: [
				{
					id: placementId,
					x: 0,
					y: 0,
					width: 1,
					height: 1,
				},
			],
			presetPlacements: [
				{
					placementId,
					presetRefId: SAMPLE_CATALOG_PRESET_ID,
				},
			],
		};
		const parsed = parseLayoutDocument(doc);
		expect(parsed.gridCells[0]?.id).toBe(placementId);
		expect(parsed.presetLayoutRoster).toBeUndefined();
	});
});
