/**
 * Unit tests for workspace render utilities.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { createInitialSurfaceState } from "../state";
import { computePresetGrid } from "./render";

describe("computePresetGrid", () => {
	it("returns empty items when panelPresetIds is empty", () => {
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
			panelPresetIds: [],
		};

		expect(computePresetGrid(testState, 4).items).toEqual([]);
	});
});
