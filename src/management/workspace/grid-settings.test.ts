import { describe, expect, it } from "vitest";
import {
	gridSettingsFromSettingsJson,
	gridSettingsFromThemeOverrides,
} from "./grid-settings";

/**
 * Issue #95 — settings.workspace.grid → workspace state.grid bridge.
 */

describe("gridSettingsFromSettingsJson", () => {
	it("extracts workspace.grid from settings/app.json", () => {
		const json = JSON.stringify({
			version: 2,
			workspace: { grid: { cellSize: 96, gap: 12, radius: 9 } },
		});
		expect(gridSettingsFromSettingsJson(json)).toEqual({
			cellSize: 96,
			gap: 12,
			radius: 9,
		});
	});

	it("returns null for missing/invalid input", () => {
		expect(gridSettingsFromSettingsJson(null)).toBeNull();
		expect(gridSettingsFromSettingsJson("")).toBeNull();
		expect(gridSettingsFromSettingsJson("not json")).toBeNull();
		expect(gridSettingsFromSettingsJson("{}")).toBeNull();
		expect(
			gridSettingsFromSettingsJson(
				JSON.stringify({ workspace: { grid: { cellSize: "x" } } }),
			),
		).toBeNull();
	});
});

describe("gridSettingsFromThemeOverrides", () => {
	it("parses the three grid tokens from a themeLive payload", () => {
		expect(
			gridSettingsFromThemeOverrides({
				"ty-ws-cell": "80px",
				"ty-ws-grid-gap": "6px",
				"ty-ws-grid-radius": "4px",
			}),
		).toEqual({ cellSize: 80, gap: 6, radius: 4 });
	});

	it("returns null unless all three tokens are present and valid", () => {
		expect(
			gridSettingsFromThemeOverrides({ "ty-ws-cell": "80px" }),
		).toBeNull();
		expect(
			gridSettingsFromThemeOverrides({
				"ty-ws-cell": "80px",
				"ty-ws-grid-gap": "6px",
				"ty-ws-grid-radius": "4px",
				"ty-ws-other": "1px",
			}),
		).toEqual({ cellSize: 80, gap: 6, radius: 4 });
		expect(gridSettingsFromThemeOverrides(null)).toBeNull();
		expect(
			gridSettingsFromThemeOverrides({
				"ty-ws-cell": "abc",
				"ty-ws-grid-gap": "6px",
				"ty-ws-grid-radius": "4px",
			}),
		).toBeNull();
	});
});
