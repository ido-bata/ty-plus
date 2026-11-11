import { describe, expect, it } from "vitest";
import type { PresetRecord } from "../../../management/preset/contract";
import { createInitialSurfaceState } from "../state";
import { mergePresetPlacementIntoState } from "./preset-bus";

const mockPreset = (id: string): PresetRecord => ({
	id,
	type: "preset",
	title: id,
	filePath: `C:/${id}.ffx`,
});

describe("mergePresetPlacementIntoState", () => {
	it("auto-packs new presets and appends surface tiles", () => {
		const base = createInitialSurfaceState({ mode: "static" });
		const cur = {
			...base,
			presets: [mockPreset("p-new")],
		};
		const delta = mergePresetPlacementIntoState(cur, {
			kind: "presetPlacement",
			sourcePanelId: "panel-1",
			targetPanelId: "panel-1",
			presetIds: ["p-new"],
		});
		const next = { ...cur, ...delta };
		expect(next.surfaceTiles.some((t) => t.id === "p-new")).toBe(true);
		const added = next.surfaceTiles.find((t) => t.id === "p-new");
		expect(added?.width).toBeGreaterThanOrEqual(1);
		expect(added?.height).toBeGreaterThanOrEqual(1);
		expect(next.panelPresetIds).toContain("p-new");
	});

	it("keeps existing preset tiles and merges panel preset ids when adding another", () => {
		const base = createInitialSurfaceState({ mode: "static" });
		const cur = {
			...base,
			presets: [mockPreset("p-old"), mockPreset("p-new")],
			surfaceTiles: [
				...base.surfaceTiles,
				{
					id: "p-old",
					x: 0,
					y: 0,
					width: 2,
					height: 2,
				},
			],
			panelPresetIds: ["p-old"],
		};
		const delta = mergePresetPlacementIntoState(cur, {
			kind: "presetPlacement",
			sourcePanelId: "panel-1",
			targetPanelId: "panel-1",
			presetIds: ["p-new"],
		});
		const next = { ...cur, ...delta };
		expect(next.surfaceTiles.some((t) => t.id === "p-old")).toBe(true);
		expect(next.surfaceTiles.some((t) => t.id === "p-new")).toBe(true);
		expect(next.panelPresetIds).toEqual(
			expect.arrayContaining(["p-old", "p-new"]),
		);
	});

	// Issue #146 / Blocker 11 — idempotent merge on presetId.
	// Re-running the same merge (e.g. retrying after a transient failure)
	// MUST NOT produce a duplicate tile for the same presetRefId.
	describe("idempotency (Issue #146 / Blocker 11)", () => {
		it("calling the merge twice with the same presetId appends only one tile", () => {
			const base = createInitialSurfaceState({ mode: "static" });
			const cur = {
				...base,
				presets: [mockPreset("p-dup")],
			};
			const first = mergePresetPlacementIntoState(cur, {
				kind: "presetPlacement",
				sourcePanelId: "panel-1",
				targetPanelId: "panel-1",
				presetIds: ["p-dup"],
			});
			const afterFirst = { ...cur, ...first };
			// Re-run the merge with the same presetRefId against the
			// already-merged surface.
			const second = mergePresetPlacementIntoState(afterFirst, {
				kind: "presetPlacement",
				sourcePanelId: "panel-1",
				targetPanelId: "panel-1",
				presetIds: ["p-dup"],
			});
			const afterSecond = { ...afterFirst, ...second };
			const tilesForId = afterSecond.surfaceTiles.filter(
				(t) => t.id === "p-dup",
			);
			expect(tilesForId).toHaveLength(1);
			expect(
				afterSecond.panelPresetIds.filter((id) => id === "p-dup"),
			).toHaveLength(1);
		});

		it("mixed incoming ids: existing ids are skipped; only NEW ids are placed", () => {
			const base = createInitialSurfaceState({ mode: "static" });
			const cur = {
				...base,
				presets: [
					mockPreset("p-existing"),
					mockPreset("p-new-a"),
					mockPreset("p-new-b"),
				],
				surfaceTiles: [
					...base.surfaceTiles,
					{ id: "p-existing", x: 0, y: 0, width: 2, height: 2 },
				],
				panelPresetIds: ["p-existing"],
			};
			const delta = mergePresetPlacementIntoState(cur, {
				kind: "presetPlacement",
				sourcePanelId: "panel-1",
				targetPanelId: "panel-1",
				presetIds: ["p-existing", "p-new-a", "p-new-b"],
			});
			const next = { ...cur, ...delta };
			// "p-existing" must still appear once (no duplicate).
			expect(
				next.surfaceTiles.filter((t) => t.id === "p-existing"),
			).toHaveLength(1);
			// "p-new-a" and "p-new-b" must both appear once.
			expect(next.surfaceTiles.some((t) => t.id === "p-new-a")).toBe(true);
			expect(next.surfaceTiles.some((t) => t.id === "p-new-b")).toBe(true);
			expect(next.panelPresetIds).toEqual(
				expect.arrayContaining(["p-existing", "p-new-a", "p-new-b"]),
			);
		});

		it("all incoming ids already placed → merge is a no-op for the surface", () => {
			const base = createInitialSurfaceState({ mode: "static" });
			const cur = {
				...base,
				presets: [mockPreset("p-already")],
				surfaceTiles: [
					...base.surfaceTiles,
					{ id: "p-already", x: 1, y: 1, width: 2, height: 2 },
				],
				panelPresetIds: ["p-already"],
			};
			const before = cur.surfaceTiles.length;
			const delta = mergePresetPlacementIntoState(cur, {
				kind: "presetPlacement",
				sourcePanelId: "panel-1",
				targetPanelId: "panel-1",
				presetIds: ["p-already"],
			});
			const next = { ...cur, ...delta };
			// No new tile appended; existing tile coords preserved.
			expect(next.surfaceTiles).toHaveLength(before);
			const tile = next.surfaceTiles.find((t) => t.id === "p-already");
			expect(tile?.x).toBe(1);
			expect(tile?.y).toBe(1);
		});

		it("all incoming ids already placed → merge is a no-op for the surface", () => {
			const base = createInitialSurfaceState({ mode: "static" });
			const cur = {
				...base,
				presets: [mockPreset("p-already")],
				surfaceTiles: [
					...base.surfaceTiles,
					{ id: "p-already", x: 1, y: 1, width: 2, height: 2 },
				],
				panelPresetIds: ["p-already"],
			};
			const before = cur.surfaceTiles.length;
			const delta = mergePresetPlacementIntoState(cur, {
				kind: "presetPlacement",
				sourcePanelId: "panel-1",
				targetPanelId: "panel-1",
				presetIds: ["p-already"],
			});
			const next = { ...cur, ...delta };
			// No new tile appended; existing tile coords preserved.
			expect(next.surfaceTiles).toHaveLength(before);
			const tile = next.surfaceTiles.find((t) => t.id === "p-already");
			expect(tile?.x).toBe(1);
			expect(tile?.y).toBe(1);
		});
	});
});
