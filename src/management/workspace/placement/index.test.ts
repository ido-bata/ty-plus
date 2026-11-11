/**
 * Unit tests for workspace placement derivation.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { createInitialSurfaceState } from "../state";
import { deriveCells } from "./index";
import { presetRecordForCatalogRef } from "./resolve";

describe("deriveCells", () => {
	it("returns one cell per surface tile with id String(index)", () => {
		const state = createInitialSurfaceState({
			mode: "live",
			panelId: "panel-1",
		});
		const testState = {
			...state,
			presets: [
				{
					id: "preset-1",
					type: "preset" as const,
					title: "Preset 1",
					filePath: "C:/preset-1.ffx",
				},
				{
					id: "preset-2",
					type: "preset" as const,
					title: "Preset 2",
					filePath: "C:/preset-2.ffx",
				},
			],
			surfaceTiles: [
				...state.surfaceTiles,
				{
					id: "preset-1",
					x: 0,
					y: 20,
					width: 2,
					height: 2,
				},
			],
			panelPresetIds: [],
		};

		const cells = deriveCells(testState);
		expect(cells).toHaveLength(testState.surfaceTiles.length);
		for (let i = 0; i < cells.length; i++) {
			expect(cells[i]?.id).toBe(String(i));
		}
	});
});

describe("presetRecordForCatalogRef", () => {
	it("resolves preset when tile catalog ref uses legacy pcl prefix", () => {
		const bare = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
		const state = {
			...createInitialSurfaceState({
				mode: "live",
				panelId: "panel-1",
			}),
			presets: [
				{
					id: bare,
					type: "script" as const,
					title: "X",
					filePath: "C:/x.jsx",
				},
			],
		};
		expect(presetRecordForCatalogRef(state, `pcl:${bare}`)?.id).toBe(bare);
	});
});
