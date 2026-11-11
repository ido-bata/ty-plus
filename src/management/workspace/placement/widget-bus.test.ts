import { describe, expect, it } from "vitest";
import { createInitialSurfaceState } from "../state";
import { mergeWidgetPlacementIntoState } from "./widget-bus";

describe("mergeWidgetPlacementIntoState", () => {
	it("auto-packs moved widgets (ignores source x/y)", () => {
		const base = createInitialSurfaceState({
			mode: "static",
			panelId: "panel-2",
		});
		const cur = {
			...base,
			surfaceTiles: [],
			widgetInstanceTypes: {},
		};
		const delta = mergeWidgetPlacementIntoState(cur, {
			kind: "widgetPlacement",
			sourcePanelId: "panel-1",
			targetPanelId: "panel-2",
			tiles: [{ id: "w-in", x: 50, y: 50, width: 2, height: 2 }],
			widgetTypes: { "w-in": "menu" },
		});
		const next = { ...cur, ...delta };
		const placed = next.surfaceTiles.find((t) => t.id === "w-in");
		expect(placed).toBeDefined();
		expect(placed?.x).toBe(0);
		expect(placed?.y).toBe(0);
		expect(next.widgetInstanceTypes["w-in"]).toBe("menu");
	});

	it("packs after existing preset rects", () => {
		const base = createInitialSurfaceState({
			mode: "static",
			panelId: "panel-2",
		});
		const cur = {
			...base,
			surfaceTiles: [
				{
					id: "p-block",
					x: 0,
					y: 0,
					width: 1,
					height: 1,
				},
			],
			presets: [
				{
					id: "p-block",
					type: "preset" as const,
					title: "Block",
					filePath: "C:/block.ffx",
				},
			],
			widgetInstanceTypes: {},
		};
		const delta = mergeWidgetPlacementIntoState(cur, {
			kind: "widgetPlacement",
			sourcePanelId: "panel-1",
			targetPanelId: "panel-2",
			tiles: [{ id: "w-in", x: 0, y: 0, width: 1, height: 1 }],
			widgetTypes: { "w-in": "menu" },
		});
		const next = { ...cur, ...delta };
		expect(next.surfaceTiles).toHaveLength(2);
		const placed = next.surfaceTiles.find((t) => t.id === "w-in");
		expect(placed).toBeDefined();
		expect(placed?.x === 0 && placed?.y === 0).toBe(false);
	});

	// Issue #146 / Round-6 / Blocker 15 — idempotent merge on widget tile
	// id. Re-running the same cross-panel move (after a transient failure
	// or a manual retry) MUST NOT produce a duplicate tile for the same
	// widget id. This is the widget-bus equivalent of round-4's
	// `mergePresetPlacementIntoState` dedup (Blocker 11).
	describe("idempotency (Issue #146 / Round-6 / Blocker 15)", () => {
		it("W.5 / Test X.2 — calling the merge twice with the same widget id appends only one tile", () => {
			const base = createInitialSurfaceState({
				mode: "static",
				panelId: "panel-2",
			});
			const cur = {
				...base,
				surfaceTiles: [],
				widgetInstanceTypes: {},
			};
			const first = mergeWidgetPlacementIntoState(cur, {
				kind: "widgetPlacement",
				sourcePanelId: "panel-1",
				targetPanelId: "panel-2",
				tiles: [{ id: "w-dup", x: 0, y: 0, width: 1, height: 1 }],
				widgetTypes: { "w-dup": "menu" },
			});
			const afterFirst = { ...cur, ...first };
			// Re-run the merge with the same widget id against the
			// already-merged surface — this simulates a retry of the
			// same cross-panel move.
			const second = mergeWidgetPlacementIntoState(afterFirst, {
				kind: "widgetPlacement",
				sourcePanelId: "panel-1",
				targetPanelId: "panel-2",
				tiles: [{ id: "w-dup", x: 0, y: 0, width: 1, height: 1 }],
				widgetTypes: { "w-dup": "menu" },
			});
			const afterSecond = { ...afterFirst, ...second };
			const tilesForId = afterSecond.surfaceTiles.filter(
				(t) => t.id === "w-dup",
			);
			expect(tilesForId).toHaveLength(1);
			// widgetInstanceTypes remains a single entry (idempotent).
			expect(Object.keys(afterSecond.widgetInstanceTypes)).toEqual(["w-dup"]);
		});

		it("mixed incoming widget ids: existing ids are skipped; only NEW ids are placed", () => {
			const base = createInitialSurfaceState({
				mode: "static",
				panelId: "panel-2",
			});
			const cur = {
				...base,
				surfaceTiles: [
					...base.surfaceTiles,
					{ id: "w-existing", x: 0, y: 0, width: 2, height: 2 },
				],
				widgetInstanceTypes: { "w-existing": "menu" as const },
			};
			const delta = mergeWidgetPlacementIntoState(cur, {
				kind: "widgetPlacement",
				sourcePanelId: "panel-1",
				targetPanelId: "panel-2",
				tiles: [
					{ id: "w-existing", x: 0, y: 0, width: 2, height: 2 },
					{ id: "w-new-a", x: 0, y: 0, width: 1, height: 1 },
					{ id: "w-new-b", x: 0, y: 0, width: 1, height: 1 },
				],
				widgetTypes: {
					"w-existing": "menu",
					"w-new-a": "menu",
					"w-new-b": "menu",
				},
			});
			const next = { ...cur, ...delta };
			// "w-existing" must still appear once (no duplicate).
			expect(
				next.surfaceTiles.filter((t) => t.id === "w-existing"),
			).toHaveLength(1);
			// "w-new-a" and "w-new-b" must both appear once.
			expect(next.surfaceTiles.some((t) => t.id === "w-new-a")).toBe(true);
			expect(next.surfaceTiles.some((t) => t.id === "w-new-b")).toBe(true);
		});

		it("all incoming widget ids already placed → merge is a no-op for the surface", () => {
			const base = createInitialSurfaceState({
				mode: "static",
				panelId: "panel-2",
			});
			const cur = {
				...base,
				surfaceTiles: [
					...base.surfaceTiles,
					{ id: "w-already", x: 1, y: 1, width: 2, height: 2 },
				],
				widgetInstanceTypes: { "w-already": "menu" as const },
			};
			const before = cur.surfaceTiles.length;
			const delta = mergeWidgetPlacementIntoState(cur, {
				kind: "widgetPlacement",
				sourcePanelId: "panel-1",
				targetPanelId: "panel-2",
				tiles: [{ id: "w-already", x: 0, y: 0, width: 2, height: 2 }],
				widgetTypes: { "w-already": "menu" },
			});
			const next = { ...cur, ...delta };
			// No new tile appended; existing tile coords preserved.
			expect(next.surfaceTiles).toHaveLength(before);
			const tile = next.surfaceTiles.find((t) => t.id === "w-already");
			expect(tile?.x).toBe(1);
			expect(tile?.y).toBe(1);
		});
	});
});
