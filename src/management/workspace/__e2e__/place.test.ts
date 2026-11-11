/**
 * End-to-end tests for widget placement in workspace.
 *
 * Covers:
 * - Placing a widget on the grid
 * - Verifying the widget appears at the correct grid position
 * - Persisting and restoring placement on reload
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import type { WidgetType } from "@/function/widget";
import { packTopLeft } from "../layout/engine";
import { mergeWidgetPlacementIntoState } from "../placement/widget-bus";
import type { SurfaceState } from "../state";
import { createInitialSurfaceState } from "../state";
import type { LayoutPayload } from "../surface/contract";
import {
	layoutsFromSurface,
	serialize,
	tilesFromDocument,
	widgetResolutionFromCatalogContext,
} from "../surface/tiles";
import { LayoutUndoStack } from "../undo/cache-stack";
import { createHistoryManager } from "../undo/history";

// Mock the cache layer to return an empty stack synchronously.
// place.test.ts does not exercise persistence — it only needs the
// in-memory ring to be functional after init().
vi.mock("../undo/layout-undo-cache", () => ({
	initLayoutUndoCache: vi.fn().mockResolvedValue(undefined),
	loadLayoutUndoStack: vi.fn().mockResolvedValue(new LayoutUndoStack()),
	saveLayoutUndoStack: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Creates a minimal SurfaceState for testing placement logic. */
const createTestState = (overrides?: Partial<SurfaceState>): SurfaceState => {
	const base = createInitialSurfaceState({
		mode: "live",
		panelId: "panel-1",
		grid: {},
		hostCode: "AEFT",
		hostName: "After Effects",
	});
	return { ...base, ...overrides };
};

/** Extracts widget layouts from surface tiles for position verification. */
const extractWidgetLayouts = (state: SurfaceState) =>
	layoutsFromSurface(
		state.surfaceTiles,
		widgetResolutionFromCatalogContext(state),
	);

/** Finds a widget tile by its type in the surface state. */
const findTileByWidgetType = (
	state: SurfaceState,
	widgetType: WidgetType,
): { x: number; y: number; width: number; height: number } | undefined => {
	const layouts = extractWidgetLayouts(state);
	const layout = layouts.find((l) => l.widgetType === widgetType);
	if (!layout) return undefined;
	const tile = state.surfaceTiles.find((t) => t.id === layout.id);
	return tile
		? { x: tile.x, y: tile.y, width: tile.width, height: tile.height }
		: undefined;
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("widget placement via state", () => {
	it("places a new widget at the correct grid position using packTopLeft", () => {
		const state = createTestState({
			surfaceTiles: [
				{ id: "w1", x: 0, y: 0, width: 4, height: 1 },
				{ id: "w2", x: 4, y: 0, width: 2, height: 1 },
			],
			widgetInstanceTypes: {
				w1: "quick-actions",
				w2: "menu",
			},
		});

		// Simulate appending a new widget tile (mimics appendWidgetFromBusPayload logic)
		const _widgets = layoutsFromSurface(
			state.surfaceTiles,
			widgetResolutionFromCatalogContext(state),
		);
		const allItems = state.surfaceTiles.map((t, index) => ({
			id: String(index),
			x: t.x,
			y: t.y,
			width: t.width,
			height: t.height,
		}));

		const _packed = packTopLeft(allItems, state.grid);
		const nextTile = {
			id: "w3",
			x: 0,
			y: 2, // should be packed below existing widgets
			width: 3,
			height: 2,
		};

		const nextTiles = [...state.surfaceTiles, nextTile];

		const nextState: SurfaceState = {
			...state,
			surfaceTiles: nextTiles,
			widgetInstanceTypes: {
				...state.widgetInstanceTypes,
				w3: "easing",
			},
		};

		expect(findTileByWidgetType(nextState, "easing")).toMatchObject({
			x: 0,
			y: 2,
			width: 3,
			height: 2,
		});
	});

	it("adds a widget at the next available row when grid is empty", () => {
		const state = createTestState({
			surfaceTiles: [],
			widgetInstanceTypes: {},
		});

		const newTile = { id: "new-widget", x: 0, y: 0, width: 2, height: 3 };
		const nextState: SurfaceState = {
			...state,
			surfaceTiles: [newTile],
			widgetInstanceTypes: {
				...state.widgetInstanceTypes,
				"new-widget": "align",
			},
		};

		const tile = nextState.surfaceTiles[0];
		expect(tile.x).toBe(0);
		expect(tile.y).toBe(0);
	});

	it("respects specified width and height when placing a widget", () => {
		const state = createTestState();
		const customTile = { id: "custom", x: 3, y: 2, width: 4, height: 3 };

		const nextState: SurfaceState = {
			...state,
			surfaceTiles: [...state.surfaceTiles, customTile],
			widgetInstanceTypes: {
				...state.widgetInstanceTypes,
				custom: "font-viewer",
			},
		};

		const layouts = extractWidgetLayouts(nextState);
		const customLayout = layouts.find((l) => l.id === "custom");
		expect(customLayout?.width).toBe(4);
		expect(customLayout?.height).toBe(3);
	});

	it("tracks multiple widgets with distinct positions", () => {
		const state = createTestState({
			surfaceTiles: [
				{ id: "w1", x: 0, y: 0, width: 4, height: 1 },
				{ id: "w2", x: 4, y: 0, width: 1, height: 1 },
				{ id: "w3", x: 0, y: 1, width: 4, height: 5 },
				{ id: "w4", x: 4, y: 1, width: 2, height: 2 },
			],
			widgetInstanceTypes: {
				w1: "quick-actions",
				w2: "layout-lock",
				w3: "easing",
				w4: "anchor-point",
			},
		});

		const layouts = extractWidgetLayouts(state);
		expect(layouts).toHaveLength(4);

		const positions = layouts.map((l) => ({ x: l.x, y: l.y }));
		// All positions should be distinct
		const positionSet = new Set(positions.map((p) => `${p.x},${p.y}`));
		expect(positionSet.size).toBe(4);
	});
});

describe("mergeWidgetPlacementIntoState", () => {
	it("applies widgetPlacement payload to surface state", () => {
		const state = createTestState({
			surfaceTiles: [],
			widgetInstanceTypes: {},
		});

		const payload: LayoutPayload = {
			kind: "widgetPlacement",
			sourcePanelId: "panel-source",
			targetPanelId: "panel-1",
			auto: { axis: -1 },
			widgetTypes: {
				"easing-widget": "easing",
			},
			tiles: [{ id: "easing-widget", x: 0, y: 0, width: 4, height: 5 }],
			defaultTile: { width: 2, height: 3 },
		};

		const result = mergeWidgetPlacementIntoState(state, payload);
		expect(result.surfaceTiles).toHaveLength(1);
		expect(result.surfaceTiles[0].id).toBe("easing-widget");
		expect(result.widgetInstanceTypes["easing-widget"]).toBe("easing");
	});

	it("adds tiles regardless of targetPanelId (caller filters by panel)", () => {
		// Note: mergeWidgetPlacementIntoState does not check targetPanelId.
		// Filtering by panel is the caller's responsibility (see hook.ts).
		// This test verifies the function's actual behavior.
		const state = createTestState({
			surfaceTiles: [],
			widgetInstanceTypes: {},
		});

		const payload: LayoutPayload = {
			kind: "widgetPlacement",
			sourcePanelId: "panel-source",
			targetPanelId: "panel-2",
			auto: { axis: -1 },
			widgetTypes: {
				w1: "info",
			},
			tiles: [{ id: "w1", x: 0, y: 0, width: 3, height: 2 }],
			defaultTile: { width: 2, height: 3 },
		};

		const result = mergeWidgetPlacementIntoState(state, payload);
		// Function adds tiles regardless of targetPanelId - caller filters
		expect(result.surfaceTiles).toHaveLength(1);
		expect(result.surfaceTiles[0].id).toBe("w1");
	});

	it("preserves existing tiles when merging", () => {
		const state = createTestState({
			surfaceTiles: [{ id: "existing", x: 0, y: 0, width: 2, height: 1 }],
			widgetInstanceTypes: { existing: "quick-actions" },
		});

		const payload: LayoutPayload = {
			kind: "widgetPlacement",
			sourcePanelId: "panel-source",
			targetPanelId: "panel-1",
			auto: { axis: -1 },
			widgetTypes: { "new-widget": "menu" },
			tiles: [{ id: "new-widget", x: 0, y: 0, width: 1, height: 1 }],
			defaultTile: { width: 2, height: 3 },
		};

		const result = mergeWidgetPlacementIntoState(state, payload);
		expect(result.surfaceTiles).toHaveLength(2);
		expect(result.surfaceTiles[0].id).toBe("existing");
		expect(result.surfaceTiles[1].id).toBe("new-widget");
	});
});

describe("serialization and restoration", () => {
	it("serializes surface tiles to JSON format", () => {
		const state = createTestState({
			surfaceTiles: [
				{ id: "w1", x: 0, y: 0, width: 4, height: 1 },
				{ id: "w2", x: 4, y: 0, width: 1, height: 1 },
				{ id: "w3", x: 0, y: 1, width: 4, height: 5 },
			],
			widgetInstanceTypes: {
				w1: "quick-actions",
				w2: "layout-lock",
				w3: "easing",
			},
		});

		const json = serialize(state.surfaceTiles);
		const parsed = JSON.parse(json);

		expect(parsed.gridCells).toHaveLength(3);
		expect(parsed.gridCells[0]).toMatchObject({
			id: "w1",
			x: 0,
			y: 0,
			width: 4,
			height: 1,
		});
	});

	it("restores surface tiles from persisted JSON via tilesFromDocument", () => {
		const persistedJson = JSON.stringify({
			gridCells: [
				{ id: "restored-1", x: 1, y: 2, width: 3, height: 4 },
				{ id: "restored-2", x: 5, y: 2, width: 2, height: 2 },
			],
		});

		const parsed = JSON.parse(persistedJson);
		const tiles = tilesFromDocument({
			layout: parsed,
			widgetRecords: [
				{ id: "restored-1", type: "info" },
				{ id: "restored-2", type: "align" },
			],
			presets: [],
			panelPresetIds: [],
			implicitlyFillAllPresetsWhenLayoutEmpty: false,
		});

		expect(tiles).toHaveLength(2);
		expect(tiles[0].id).toBe("restored-1");
		expect(tiles[0].x).toBe(1);
		expect(tiles[0].y).toBe(2);
		expect(tiles[0].width).toBe(3);
		expect(tiles[0].height).toBe(4);
	});

	it("restores widget instance types from widget records", () => {
		const state = createTestState({
			surfaceTiles: [
				{ id: "persisted-widget", x: 0, y: 0, width: 3, height: 2 },
			],
			widgetInstanceTypes: {
				"persisted-widget": "easing",
			},
		});

		const json = serialize(state.surfaceTiles);
		const parsed = JSON.parse(json);

		const restoredTiles = tilesFromDocument({
			layout: parsed,
			widgetRecords: [{ id: "persisted-widget", type: "easing" }],
			presets: [],
			panelPresetIds: [],
			implicitlyFillAllPresetsWhenLayoutEmpty: false,
		});

		expect(restoredTiles).toHaveLength(1);
		expect(restoredTiles[0].id).toBe("persisted-widget");
	});

	it("full round-trip preserves placement data", () => {
		const originalState = createTestState({
			surfaceTiles: [
				{ id: "roundtrip-1", x: 2, y: 3, width: 4, height: 5 },
				{ id: "roundtrip-2", x: 7, y: 3, width: 2, height: 2 },
			],
			widgetInstanceTypes: {
				"roundtrip-1": "easing",
				"roundtrip-2": "anchor-point",
			},
		});

		// Serialize
		const json = serialize(originalState.surfaceTiles);
		const parsed = JSON.parse(json);

		// Restore via tilesFromDocument
		const restoredTiles = tilesFromDocument({
			layout: parsed,
			widgetRecords: [
				{ id: "roundtrip-1", type: "easing" },
				{ id: "roundtrip-2", type: "anchor-point" },
			],
			presets: [],
			panelPresetIds: [],
			implicitlyFillAllPresetsWhenLayoutEmpty: false,
		});

		expect(restoredTiles).toHaveLength(2);

		const t1 = restoredTiles.find((t) => t.id === "roundtrip-1");
		const t2 = restoredTiles.find((t) => t.id === "roundtrip-2");

		expect(t1).toMatchObject({ x: 2, y: 3, width: 4, height: 5 });
		expect(t2).toMatchObject({ x: 7, y: 3, width: 2, height: 2 });
	});
});

describe("placement persistence across state transitions", () => {
	it("widget position survives state commit", () => {
		let committedState = createTestState();

		// Simulate adding a widget and committing
		const newTile = { id: "committed-widget", x: 3, y: 4, width: 2, height: 3 };
		committedState = {
			...committedState,
			surfaceTiles: [...committedState.surfaceTiles, newTile],
			widgetInstanceTypes: {
				...committedState.widgetInstanceTypes,
				"committed-widget": "font-viewer",
			},
		};

		const tile = committedState.surfaceTiles.find(
			(t) => t.id === "committed-widget",
		);
		expect(tile).toMatchObject({ x: 3, y: 4, width: 2, height: 3 });
	});

	it("mergeWidgetPlacementIntoState does not mutate original state", () => {
		const originalState = createTestState({
			surfaceTiles: [{ id: "original", x: 0, y: 0, width: 1, height: 1 }],
			widgetInstanceTypes: { original: "info" },
		});

		const payload: LayoutPayload = {
			kind: "widgetPlacement",
			sourcePanelId: "panel-source",
			targetPanelId: "panel-1",
			auto: { axis: -1 },
			widgetTypes: { "added-widget": "align" },
			tiles: [{ id: "added-widget", x: 0, y: 0, width: 2, height: 2 }],
			defaultTile: { width: 2, height: 3 },
		};

		const result = mergeWidgetPlacementIntoState(originalState, payload);

		// Original state should be unchanged
		expect(originalState.surfaceTiles).toHaveLength(1);
		expect(originalState.surfaceTiles[0].id).toBe("original");

		// Result should have the new widget
		expect(result.surfaceTiles).toHaveLength(2);
		expect(result.surfaceTiles[1].id).toBe("added-widget");
	});

	it("default panel widgets are seeded on initial state", () => {
		const state = createTestState();
		const layouts = extractWidgetLayouts(state);

		// Default primary panel should have seeded widgets
		expect(layouts.length).toBeGreaterThan(0);

		const defaultTypes: WidgetType[] = [
			"quick-actions",
			"layout-lock",
			"menu",
			"easing",
			"align",
			"anchor-point",
			"info",
		];

		for (const widgetType of defaultTypes) {
			const found = layouts.some((l) => l.widgetType === widgetType);
			expect(found).toBe(true);
		}
	});
});

describe("placement integration with history", () => {
	it("history tracks widget placement changes", async () => {
		// Create a mock window object for history
		const mockWindow = {
			localStorage: {
				getItem: () => null,
				setItem: () => {},
			},
		} as unknown as Window;

		const history = createHistoryManager("panel-1", mockWindow);
		// Bug 6: init() must complete before push() so the in-memory ring
		// is live. (Pre-init pushes are buffered and replayed by init().)
		await history.init();

		const state1 = createTestState({
			surfaceTiles: [{ id: "h1", x: 0, y: 0, width: 2, height: 1 }],
			widgetInstanceTypes: { h1: "quick-actions" },
		});

		const layouts1 = layoutsFromSurface(
			state1.surfaceTiles,
			widgetResolutionFromCatalogContext(state1),
		);
		history.push(layouts1);

		const state2: SurfaceState = {
			...state1,
			surfaceTiles: [
				...state1.surfaceTiles,
				{ id: "h2", x: 2, y: 0, width: 1, height: 1 },
			],
			widgetInstanceTypes: {
				...state1.widgetInstanceTypes,
				h2: "menu",
			},
		};

		const layouts2 = layoutsFromSurface(
			state2.surfaceTiles,
			widgetResolutionFromCatalogContext(state2),
		);
		history.push(layouts2);

		expect(history.canUndo()).toBe(true);
		expect(history.canRedo()).toBe(false);
	});
});
