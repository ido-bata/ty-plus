import { describe, expect, it } from "vitest";
import { coerceSettings, DEFAULT_SETTINGS, mergeSettings } from "./settings";

describe("coerceSettings", () => {
	it("fills missing top-level groups from defaults", () => {
		const result = coerceSettings({
			version: 2,
			core: {
				paths: {
					supportRoot: "C:/support",
				},
			},
		});

		expect(result.core.paths.supportRoot).toBe("C:/support");
		expect(result.core.paths.presetRoot).toBe("");
		expect(result.core.paths.scriptRoot).toBe("");
		expect(result.core.paths.pluginRoot).toBe("");
		expect(result.ui.language).toBe(DEFAULT_SETTINGS.ui.language);
		expect(result.workspace.grid).toEqual(DEFAULT_SETTINGS.workspace.grid);
		expect(result.gestures).toEqual(DEFAULT_SETTINGS.gestures);
	});

	it("preserves onboarding path roots when present in JSON", () => {
		const result = coerceSettings({
			version: 2,
			core: {
				paths: {
					supportRoot: "D:/TyPlus",
					presetRoot: "D:/TyPlus/Presets",
					scriptRoot: "D:/TyPlus/Scripts",
					pluginRoot: "D:/TyPlus/Plug-ins",
				},
			},
		});

		expect(result.core.paths.presetRoot).toBe("D:/TyPlus/Presets");
		expect(result.core.paths.scriptRoot).toBe("D:/TyPlus/Scripts");
		expect(result.core.paths.pluginRoot).toBe("D:/TyPlus/Plug-ins");
	});

	it("fills missing nested values from defaults", () => {
		const result = coerceSettings({
			version: 2,
			core: {
				paths: {
					supportRoot: "C:/support",
				},
			},
			ui: {
				language: "ja",
			},
			workspace: {},
		});

		expect(result.ui.language).toBe("ja");
		expect(result.ui.theme).toBe(DEFAULT_SETTINGS.ui.theme);
		expect(result.ui.widget).toEqual(DEFAULT_SETTINGS.ui.widget);
		expect(result.workspace.grid).toEqual(DEFAULT_SETTINGS.workspace.grid);
	});

	it("fills missing gestures group from defaults when older JSON omits it", () => {
		// Settings JSON written before Issue #78 has no `gestures` key. After
		// a reset, defaults take over; no version bump or migration shim is
		// expected (project policy: no backward-compat shims in demo phase).
		const result = coerceSettings({
			version: 2,
			core: {
				paths: {
					supportRoot: "C:/support",
				},
			},
		});

		expect(result.gestures).toEqual({ anchorPoint: true, alignment: true });
	});

	it("preserves explicit gesture flags when present in JSON", () => {
		const result = coerceSettings({
			version: 2,
			core: {
				paths: {
					supportRoot: "C:/support",
				},
			},
			gestures: {
				anchorPoint: false,
				alignment: true,
			},
		});

		expect(result.gestures).toEqual({ anchorPoint: false, alignment: true });
	});
});

describe("mergeSettings", () => {
	it("preserves nested defaults when applying a partial group patch", () => {
		const result = mergeSettings(DEFAULT_SETTINGS, {
			ui: {
				...DEFAULT_SETTINGS.ui,
				language: "ja",
			},
		});

		expect(result.ui.language).toBe("ja");
		expect(result.ui.theme).toBe(DEFAULT_SETTINGS.ui.theme);
		expect(result.core).toEqual(DEFAULT_SETTINGS.core);
		expect(result.workspace).toEqual(DEFAULT_SETTINGS.workspace);
		expect(result.gestures).toEqual(DEFAULT_SETTINGS.gestures);
	});

	it("applies a gestures patch while preserving defaults for missing keys", () => {
		const result = mergeSettings(DEFAULT_SETTINGS, {
			gestures: {
				...DEFAULT_SETTINGS.gestures,
				anchorPoint: false,
			},
		});

		expect(result.gestures.anchorPoint).toBe(false);
		expect(result.gestures.alignment).toBe(DEFAULT_SETTINGS.gestures.alignment);
		expect(result.ui).toEqual(DEFAULT_SETTINGS.ui);
	});
});
