/**
 * Round-trip tests for the preset catalog JSON I/O. These exist because the
 * serializer/parser are the boundary that determines what actually lands on
 * disk and what is reconstructed on read.
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";

import {
	PresetCatalogParseError,
	parsePresetCatalogJsonText,
	parsePresetCatalogJsonTextStrict,
	serializePresetCatalogJsonText,
} from "@/management/preset/catalog-json-text";
import type { Preset } from "@/management/preset/contract";

const basePreset: Preset = {
	id: "round-trip-1",
	type: "preset",
	title: "Round Trip",
	filePath: "/path/to/preset.ffx",
	icon: { type: "text", param: { text: "RT" } },
};

describe("catalog-json-text round trip", () => {
	it("preserves description through serialize → parse", () => {
		const preset: Preset = {
			...basePreset,
			description: "Hello world",
		};
		const text = serializePresetCatalogJsonText([preset]);
		const parsed = parsePresetCatalogJsonText(text);
		expect(parsed[0]?.description).toBe("Hello world");
	});

	it("preserves descriptionImage through serialize → parse", () => {
		const preset: Preset = {
			...basePreset,
			descriptionImage: "/path/to/image.png",
		};
		const text = serializePresetCatalogJsonText([preset]);
		const parsed = parsePresetCatalogJsonText(text);
		expect(parsed[0]?.descriptionImage).toBe("/path/to/image.png");
	});

	it("preserves both description and descriptionImage", () => {
		const preset: Preset = {
			...basePreset,
			description: "Some markdown **bold** text",
			descriptionImage: "/img.png",
		};
		const text = serializePresetCatalogJsonText([preset]);
		const parsed = parsePresetCatalogJsonText(text);
		expect(parsed[0]?.description).toBe("Some markdown **bold** text");
		expect(parsed[0]?.descriptionImage).toBe("/img.png");
	});

	it("omits empty description and descriptionImage on serialize", () => {
		const text = serializePresetCatalogJsonText([basePreset]);
		const json = JSON.parse(text) as {
			presets: Array<Record<string, unknown>>;
		};
		expect(json.presets[0]).not.toHaveProperty("description");
		expect(json.presets[0]).not.toHaveProperty("descriptionImage");
	});

	it("preserves parentId through serialize → parse (duplicate marker)", () => {
		// Issue #82 acceptance criterion: a duplicate preset must remember its
		// source preset id across an on-disk save/load round trip so downstream
		// consumers can recognize it as a derivative of `source`.
		const duplicate: Preset = {
			...basePreset,
			id: "duplicate-1",
			parentId: "source-1",
		};
		const text = serializePresetCatalogJsonText([duplicate]);
		const parsed = parsePresetCatalogJsonText(text);
		expect(parsed[0]?.parentId).toBe("source-1");
	});

	it("omits parentId on serialize when not set", () => {
		const text = serializePresetCatalogJsonText([basePreset]);
		const json = JSON.parse(text) as {
			presets: Array<Record<string, unknown>>;
		};
		expect(json.presets[0]).not.toHaveProperty("parentId");
	});

	it("preserves parentId through full I/O round trip with description and icon", () => {
		const duplicate: Preset = {
			...basePreset,
			id: "duplicate-full",
			parentId: "source-full",
			description: "derived from source",
			icon: { type: "emoji", param: { emoji: "🧬" } },
		};
		const text1 = serializePresetCatalogJsonText([duplicate]);
		const obj = JSON.parse(text1) as object;
		const text2 = `${JSON.stringify(obj, null, 2)}\n`;
		const reSerialized = JSON.stringify(JSON.parse(text2));
		const parsed = parsePresetCatalogJsonText(reSerialized);
		expect(parsed[0]?.parentId).toBe("source-full");
		expect(parsed[0]?.description).toBe("derived from source");
		expect(parsed[0]?.icon).toEqual({ type: "emoji", param: { emoji: "🧬" } });
	});

	it("preserves a preset with empty file in the on-disk round trip", () => {
		// Simulates the actual writeJson → readJson path: serialize,
		// JSON.parse → JSON.stringify, then JSON.parse → parse.
		const preset: Preset = {
			...basePreset,
			description: "Survives full I/O",
			descriptionImage: "/img.png",
		};
		const text1 = serializePresetCatalogJsonText([preset]);
		const obj = JSON.parse(text1) as object;
		const text2 = `${JSON.stringify(obj, null, 2)}\n`;
		const reSerialized = JSON.stringify(JSON.parse(text2));
		const parsed = parsePresetCatalogJsonText(reSerialized);
		expect(parsed[0]?.description).toBe("Survives full I/O");
		expect(parsed[0]?.descriptionImage).toBe("/img.png");
	});
});

/**
 * Round-5 (PR #156) — strict parser contract for the local catalog fallback.
 *
 * The lenient `parsePresetCatalogJsonText` swallows corrupt input to `[]`.
 * The strict `parsePresetCatalogJsonTextStrict` throws
 * `PresetCatalogParseError` with a structured `reason`. The local fallback
 * in `append-preset-from-dialog-disk.ts` uses the strict variant so a
 * corrupt `presets/presets.json` REJECTS (Blocker 13) instead of silently
 * demoting to an empty catalog.
 */
describe("parsePresetCatalogJsonTextStrict (Round-5 / Blocker 13)", () => {
	it("empty-but-valid JSON `{ presets: [] }` → returns [] (no throw)", () => {
		const result = parsePresetCatalogJsonTextStrict(
			JSON.stringify({ presets: [] }),
		);
		expect(result).toEqual([]);
	});

	it("partial-valid JSON (some rows invalid) → returns the valid rows; no throw", () => {
		const text = JSON.stringify({
			presets: [
				{
					id: "good",
					type: "preset",
					title: "Good",
					filePath: "/x/good.ffx",
				},
				// invalid: missing id + missing filePath → filtered
				{ id: "", type: "preset", title: "Bad", filePath: "" },
				// invalid: not an object
				"not-a-row",
			],
		});
		const result = parsePresetCatalogJsonTextStrict(text);
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("good");
	});

	it("corrupt JSON → throws PresetCatalogParseError with reason=json-parse-failed", () => {
		expect(() => parsePresetCatalogJsonTextStrict("not-valid-json{{")).toThrow(
			PresetCatalogParseError,
		);
		try {
			parsePresetCatalogJsonTextStrict("not-valid-json{{");
			expect.fail("expected to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(PresetCatalogParseError);
			const e = error as PresetCatalogParseError;
			expect(e.reason).toBe("json-parse-failed");
		}
	});

	it("top-level `presets` is not an array → throws with reason=root-not-array", () => {
		expect(() =>
			parsePresetCatalogJsonTextStrict(
				JSON.stringify({ presets: { not: "an array" } }),
			),
		).toThrow(PresetCatalogParseError);
		try {
			parsePresetCatalogJsonTextStrict(JSON.stringify({ presets: "oops" }));
			expect.fail("expected to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(PresetCatalogParseError);
			const e = error as PresetCatalogParseError;
			expect(e.reason).toBe("root-not-array");
		}
	});

	it("null input → throws with reason=json-parse-failed", () => {
		expect(() => parsePresetCatalogJsonTextStrict(null)).toThrow(
			PresetCatalogParseError,
		);
	});

	it("empty/whitespace input → throws with reason=json-parse-failed", () => {
		expect(() => parsePresetCatalogJsonTextStrict("")).toThrow(
			PresetCatalogParseError,
		);
		expect(() => parsePresetCatalogJsonTextStrict("   \n  ")).toThrow(
			PresetCatalogParseError,
		);
	});

	it("all rows invalid → throws with reason=all-rows-invalid", () => {
		const text = JSON.stringify({
			presets: [
				{ id: "", filePath: "" }, // missing id + filePath
				"not-a-row",
				null,
			],
		});
		expect(() => parsePresetCatalogJsonTextStrict(text)).toThrow(
			PresetCatalogParseError,
		);
		try {
			parsePresetCatalogJsonTextStrict(text);
			expect.fail("expected to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(PresetCatalogParseError);
			const e = error as PresetCatalogParseError;
			expect(e.reason).toBe("all-rows-invalid");
		}
	});

	it("lenient parsePresetCatalogJsonText still swallows errors to [] (back-compat)", () => {
		// services.ts and catalog-root-pinned.ts rely on the lenient
		// behavior; the strict variant is additive.
		expect(parsePresetCatalogJsonText("not-valid-json{{")).toEqual([]);
		expect(
			parsePresetCatalogJsonText(JSON.stringify({ presets: { not: "array" } })),
		).toEqual([]);
		expect(parsePresetCatalogJsonText(null)).toEqual([]);
	});
});
