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
	it("preserves a stored channel and rejects invalid values", () => {
		expect(
			coerceSettings({ ui: { updateChannel: "insider" } }).ui.updateChannel,
		).toBe("insider");
		expect(
			coerceSettings({ ui: { updateChannel: "unknown" } }).ui.updateChannel,
		).toBe("stable");
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

describe("mergeSettings", () => {
	it("preserves sibling ui fields when a patch updates one field", () => {
		// A partial `ui` patch must not reset theme/language: the settings file
		// is the only durable copy, so a dropped field looks like data loss.
		const current = coerceSettings({
			version: 2,
			core: { paths: { supportRoot: "/support" } },
			ui: { language: "ja", theme: "dark" },
		});
		const merged = mergeSettings(current, {
			ui: { updateChannel: "insider" },
		});
		expect(merged.ui.updateChannel).toBe("insider");
		expect(merged.ui.theme).toBe("dark");
		expect(merged.ui.language).toBe("ja");
		expect(merged.core.paths.supportRoot).toBe("/support");
	});

	it("ignores undefined values instead of erasing the current setting", () => {
		const merged = mergeSettings(DEFAULT_SETTINGS, {
			ui: { theme: undefined, updateChannel: "beta" },
		});
		expect(merged.ui.theme).toBe(DEFAULT_SETTINGS.ui.theme);
		expect(merged.ui.updateChannel).toBe("beta");
	});

	it("falls back to the build channel when a stored channel is unknown", () => {
		for (const value of ["nightly", "", 0, null, true]) {
			const coerced = coerceSettings({ ui: { updateChannel: value } });
			expect(["stable", "beta", "insider"]).toContain(coerced.ui.updateChannel);
		}
	});

	it("preserves keys that settings.json shares with the workspace layer", () => {
		// `settings/app.json` is written by both layers. `workspacePanels` and
		// `snapshots` hold group/preset placement and named layouts; a coercion
		// that kept only DEFAULT_SETTINGS keys would delete them on the next
		// settings save — including a save caused by changing the update channel.
		const coerced = coerceSettings({
			version: 2,
			core: { paths: { supportRoot: "/support" } },
			workspace: {
				grid: { cellSize: 96, gap: 8, radius: 12 },
				workspacePanels: { "panel-1": { presetIds: ["a", "b"] } },
				snapshots: { "panel-1": [{ id: "s1" }] },
			},
			controlPanel: { position: "right", orientation: "vertical" },
		});
		const workspace = coerced.workspace as unknown as Record<string, unknown>;
		expect(workspace.workspacePanels).toEqual({
			"panel-1": { presetIds: ["a", "b"] },
		});
		expect(workspace.snapshots).toEqual({ "panel-1": [{ id: "s1" }] });
		expect(
			(coerced as unknown as Record<string, unknown>).controlPanel,
		).toEqual({
			position: "right",
			orientation: "vertical",
		});
	});

	it("keeps workspace layout data through a channel change", () => {
		const stored = coerceSettings({
			version: 2,
			core: { paths: { supportRoot: "/support" } },
			ui: { language: "en", theme: "dark" },
			workspace: {
				workspacePanels: { "panel-1": { presetIds: ["a"] } },
			},
		});
		const afterChannelChange = mergeSettings(stored, {
			ui: { updateChannel: "insider" },
		});
		expect(afterChannelChange.ui.updateChannel).toBe("insider");
		expect(
			(afterChannelChange.workspace as unknown as Record<string, unknown>)
				.workspacePanels,
		).toEqual({ "panel-1": { presetIds: ["a"] } });
	});

	it("lets a patch introduce a key with no default", () => {
		// `workspace.background` is optional and absent from DEFAULT_SETTINGS,
		// so a one-way merge silently dropped it.
		const merged = mergeSettings(DEFAULT_SETTINGS, {
			workspace: { background: { type: "color", value: "#000" } },
		});
		expect(merged.workspace.background).toEqual({
			type: "color",
			value: "#000",
		});
	});
});
