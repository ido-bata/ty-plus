import { describe, expect, it } from "vitest";

import {
	mapCategoryToType,
	resolveDownloadFileLayout,
	sanitizeFileName,
} from "./download-detection";

describe("sanitizeFileName", () => {
	it("strips filesystem-hostile characters", () => {
		// The Windows + macOS reserved set: `<>:"/\\|?*` plus a stray newline.
		expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe(
			"a_b_c_d_e_f_g_h_i_j",
		);
	});

	it("collapses whitespace and trims", () => {
		expect(sanitizeFileName("  My   Preset  ")).toBe("My Preset");
	});

	it("collapses runs of hostile characters to a single underscore", () => {
		expect(sanitizeFileName("///***")).toBe("_");
	});
});

describe("mapCategoryToType", () => {
	it("maps the catalog category premise to PresetType", () => {
		expect(mapCategoryToType("script")).toBe("script");
		expect(mapCategoryToType("effect")).toBe("plugin");
		expect(mapCategoryToType("plugin")).toBe("plugin");
		expect(mapCategoryToType("footage")).toBe("footage");
		expect(mapCategoryToType("preset")).toBe("preset");
	});

	it("is case-insensitive and tolerant of surrounding whitespace", () => {
		expect(mapCategoryToType("  Script ")).toBe("script");
		expect(mapCategoryToType("EFFECT")).toBe("plugin");
	});

	it("returns undefined for unknown or missing categories", () => {
		expect(mapCategoryToType(undefined)).toBeUndefined();
		expect(mapCategoryToType("")).toBeUndefined();
		expect(mapCategoryToType("unknown")).toBeUndefined();
	});
});

describe("resolveDownloadFileLayout", () => {
	const isMacOS = false;
	const presetId = "preset.cloud.example";

	it("uses the sanitized catalog title as the base name", () => {
		const layout = resolveDownloadFileLayout({
			info: { title: "  My  Preset " },
			presetId,
			isMacOS,
		});
		expect(layout.baseName).toBe("My Preset");
	});

	it("falls back to the presetId when no title is present", () => {
		const layout = resolveDownloadFileLayout({
			info: {},
			presetId,
			isMacOS,
		});
		expect(layout.baseName).toBe(presetId);
	});

	it("maps script category to .jsx", () => {
		const layout = resolveDownloadFileLayout({
			info: { title: "My Preset", category: "script" },
			presetId,
			isMacOS,
		});
		expect(layout).toEqual({ ext: ".jsx", baseName: "My Preset" });
	});

	it("maps effect/plugin category to .aex on Windows and .plugin on Mac", () => {
		const win = resolveDownloadFileLayout({
			info: { title: "FX", category: "effect" },
			presetId,
			isMacOS: false,
		});
		expect(win.ext).toBe(".aex");
		const mac = resolveDownloadFileLayout({
			info: { title: "FX", category: "plugin" },
			presetId,
			isMacOS: true,
		});
		expect(mac.ext).toBe(".plugin");
	});

	it("falls back to info.type when the category is unhelpful", () => {
		const layout = resolveDownloadFileLayout({
			info: { title: "Helper", type: "script" },
			presetId,
			isMacOS,
		});
		expect(layout.ext).toBe(".jsx");
	});

	it("uses .ffx as the last resort", () => {
		const layout = resolveDownloadFileLayout({
			info: { title: "Mystery" },
			presetId,
			isMacOS,
		});
		expect(layout.ext).toBe(".ffx");
	});
});
