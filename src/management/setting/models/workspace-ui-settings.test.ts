import { describe, expect, it } from "vitest";
import {
	DEFAULT_UI_SETTINGS,
	type DisplaySettings,
	parseUiSettings,
	serializeUiSettings,
} from "./workspace-ui-settings";

describe("DisplaySettings type", () => {
	it("has correct shape", () => {
		const settings: DisplaySettings = {
			version: 1,
			showGridOverlay: true,
			showPresetLabels: false,
			selectedFont: "Arial",
		};
		expect(settings.version).toBe(1);
		expect(settings.showGridOverlay).toBe(true);
		expect(settings.showPresetLabels).toBe(false);
		expect(settings.selectedFont).toBe("Arial");
	});
});

describe("DEFAULT_UI_SETTINGS", () => {
	it("has version 1", () => {
		expect(DEFAULT_UI_SETTINGS.version).toBe(1);
	});

	it("has grid overlay enabled by default", () => {
		expect(DEFAULT_UI_SETTINGS.showGridOverlay).toBe(true);
	});

	it("has preset labels enabled by default", () => {
		expect(DEFAULT_UI_SETTINGS.showPresetLabels).toBe(true);
	});

	it("has empty selected font by default", () => {
		expect(DEFAULT_UI_SETTINGS.selectedFont).toBe("");
	});
});

describe("parseUiSettings", () => {
	it("returns defaults for null", () => {
		const result = parseUiSettings(null);
		expect(result).toEqual(DEFAULT_UI_SETTINGS);
	});

	it("returns defaults for undefined", () => {
		const result = parseUiSettings(undefined);
		expect(result).toEqual(DEFAULT_UI_SETTINGS);
	});

	it("returns defaults for non-object (string)", () => {
		const result = parseUiSettings("not an object");
		expect(result).toEqual(DEFAULT_UI_SETTINGS);
	});

	it("returns defaults for non-object (number)", () => {
		const result = parseUiSettings(42);
		expect(result).toEqual(DEFAULT_UI_SETTINGS);
	});

	it("returns defaults for non-object (array)", () => {
		const result = parseUiSettings([1, 2, 3]);
		expect(result).toEqual(DEFAULT_UI_SETTINGS);
	});

	it("returns defaults for unknown version", () => {
		const result = parseUiSettings({ version: 2 });
		expect(result).toEqual(DEFAULT_UI_SETTINGS);
	});

	it("returns defaults for version 0", () => {
		const result = parseUiSettings({ version: 0 });
		expect(result).toEqual(DEFAULT_UI_SETTINGS);
	});

	it("parses valid settings", () => {
		const input = {
			version: 1,
			showGridOverlay: false,
			showPresetLabels: true,
			selectedFont: "Helvetica",
		};
		const result = parseUiSettings(input);
		expect(result.showGridOverlay).toBe(false);
		expect(result.showPresetLabels).toBe(true);
		expect(result.selectedFont).toBe("Helvetica");
	});

	it("falls back to defaults for missing boolean fields", () => {
		const input = {
			version: 1,
			showGridOverlay: false,
		};
		const result = parseUiSettings(input);
		expect(result.showGridOverlay).toBe(false);
		expect(result.showPresetLabels).toBe(DEFAULT_UI_SETTINGS.showPresetLabels);
		expect(result.selectedFont).toBe(DEFAULT_UI_SETTINGS.selectedFont);
	});

	it("falls back to defaults for wrong types", () => {
		const input = {
			version: 1,
			showGridOverlay: "yes",
			showPresetLabels: 1,
			selectedFont: 123,
		};
		const result = parseUiSettings(input);
		expect(result.showGridOverlay).toBe(DEFAULT_UI_SETTINGS.showGridOverlay);
		expect(result.showPresetLabels).toBe(DEFAULT_UI_SETTINGS.showPresetLabels);
		expect(result.selectedFont).toBe(DEFAULT_UI_SETTINGS.selectedFont);
	});

	it("parses partial input with defaults for rest", () => {
		const input = {
			version: 1,
			selectedFont: "Times New Roman",
		};
		const result = parseUiSettings(input);
		expect(result.selectedFont).toBe("Times New Roman");
		expect(result.showGridOverlay).toBe(DEFAULT_UI_SETTINGS.showGridOverlay);
		expect(result.showPresetLabels).toBe(DEFAULT_UI_SETTINGS.showPresetLabels);
	});
});

describe("serializeUiSettings", () => {
	it("serializes full settings", () => {
		const settings: DisplaySettings = {
			version: 1,
			showGridOverlay: false,
			showPresetLabels: true,
			selectedFont: "Courier",
		};
		const result = serializeUiSettings(settings);
		expect(result).toEqual({
			version: 1,
			showGridOverlay: false,
			showPresetLabels: true,
			selectedFont: "Courier",
		});
	});

	it("serializes default settings", () => {
		const result = serializeUiSettings(DEFAULT_UI_SETTINGS);
		expect(result).toEqual({
			version: 1,
			showGridOverlay: true,
			showPresetLabels: true,
			selectedFont: "",
		});
	});

	it("serializes empty font string", () => {
		const settings: DisplaySettings = {
			...DEFAULT_UI_SETTINGS,
			selectedFont: "",
		};
		const result = serializeUiSettings(settings);
		expect(result.selectedFont).toBe("");
	});
});
