import { describe, expect, it } from "vitest";
import type { PresetRecord } from "../../management/preset/contract";
import {
	coercePresetCatalogIcon,
	presetIconEmoji,
	presetIconImage,
	presetIconText,
} from "./contract";

import {
	coercePersistedPresetIcon,
	defaultPresetIconForKind,
	ensurePresetIconForPersistence,
	normalizePresets,
	normalizeRecordCatalogIds,
	tryParsePresetIconValue,
} from "./icon-data";

describe("icon-data", () => {
	it("defaultPresetIconForKind returns type-based text", () => {
		expect(defaultPresetIconForKind("script")).toEqual(
			presetIconText("SCRIPT"),
		);
		expect(defaultPresetIconForKind(undefined)).toEqual(presetIconText("PRE"));
	});

	it("tryParsePresetIconValue parses structured JSON string", () => {
		const raw = JSON.stringify({ type: "text", value: "ABC" });
		expect(tryParsePresetIconValue(raw)).toEqual(presetIconText("ABC"));
	});

	it("tryParsePresetIconValue maps lucide string to text abbreviation", () => {
		expect(tryParsePresetIconValue("lucide:align-center")).toEqual(
			presetIconText("AC"),
		);
	});

	it("coercePresetCatalogIcon maps text param.value to canonical text", () => {
		expect(
			coercePresetCatalogIcon({ type: "text", param: { value: "XY" } }),
		).toEqual(presetIconText("XY"));
	});

	it("coercePresetCatalogIcon preserves emoji backgroundColor", () => {
		expect(
			coercePresetCatalogIcon({
				type: "emoji",
				param: { emoji: "⭐", backgroundColor: "#112233" },
			}),
		).toEqual(presetIconEmoji("⭐", { backgroundColor: "#112233" }));
	});

	// Catalog APIs often return icons in a flattened shape (e.g. a Notion
	// row that surfaced `text` / `emoji` / `src` at the top level instead of
	// nested under `param`). The coercion must accept all of these so the
	// actual catalog icon survives the round trip — otherwise the gateway
	// falls back to the type-based default ("FFX" / "SCRIPT") and the user
	// sees a generic glyph instead of the real one.
	it("coercePresetCatalogIcon accepts top-level text field", () => {
		expect(coercePresetCatalogIcon({ type: "text", text: "CAM" })).toEqual(
			presetIconText("CAM"),
		);
	});

	it("coercePresetCatalogIcon accepts top-level label field with color", () => {
		expect(
			coercePresetCatalogIcon({
				type: "text",
				label: "GRP",
				color: "#ff0000",
			}),
		).toEqual(presetIconText("GRP", { color: "#ff0000" }));
	});

	it("coercePresetCatalogIcon accepts top-level emoji field with backgroundColor", () => {
		expect(
			coercePresetCatalogIcon({
				type: "emoji",
				emoji: "🎬",
				backgroundColor: "#222222",
			}),
		).toEqual(presetIconEmoji("🎬", { backgroundColor: "#222222" }));
	});

	it("coercePresetCatalogIcon accepts top-level image src", () => {
		expect(
			coercePresetCatalogIcon({
				type: "image",
				src: "https://cdn.example.com/icons/x.png",
			}),
		).toEqual(presetIconImage("https://cdn.example.com/icons/x.png"));
	});

	it("coercePresetCatalogIcon accepts top-level image url", () => {
		expect(
			coercePresetCatalogIcon({
				type: "image",
				url: "https://cdn.example.com/icons/x.png",
			}),
		).toEqual(presetIconImage("https://cdn.example.com/icons/x.png"));
	});

	it("coercePresetCatalogIcon accepts top-level lucide name", () => {
		expect(
			coercePresetCatalogIcon({ type: "lucide", name: "align-center" }),
		).toEqual(presetIconText("AC"));
	});

	it("coercePersistedPresetIcon fills missing icon from type", () => {
		expect(coercePersistedPresetIcon("footage", undefined)).toEqual(
			presetIconText("MEDIA"),
		);
	});

	it("ensurePresetIconForPersistence keeps valid object icons", () => {
		const row: PresetRecord = {
			id: "p1",
			type: "script",
			title: "Easing",
			filePath: "C:/scripts/script.jsx",
			icon: presetIconEmoji("⭐"),
		};
		expect(ensurePresetIconForPersistence(row).icon).toEqual(
			presetIconEmoji("⭐"),
		);
	});

	it("normalizePresets applies to all rows", () => {
		const rows: PresetRecord[] = [
			{
				id: "a",
				type: "script",
				title: "A",
				filePath: "C:/a.jsx",
			},
			{
				id: "b",
				type: "preset",
				title: "B",
				filePath: "C:/b.ffx",
				icon: presetIconText("GRP"),
			},
		];
		const next = normalizePresets(rows);
		expect(next[0]?.icon).toEqual(presetIconText("SCRIPT"));
		expect(next[1]?.icon).toEqual(presetIconText("GRP"));
	});

	it("normalizeRecordCatalogIds strips legacy preset row id", () => {
		const row: PresetRecord = {
			id: "ppi:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			type: "script",
			title: "X",
			filePath: "C:/x.jsx",
		};
		expect(normalizeRecordCatalogIds(row).id).toBe(
			"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		);
	});

	it("normalizePresets tolerates minimal preset rows", () => {
		const row: PresetRecord = {
			id: "orphan-row",
			type: "preset",
			title: "Orphan",
			filePath: "C:/orphan.ffx",
		};
		expect(() => normalizePresets([row])).not.toThrow();
		const next = normalizePresets([row]);
		expect(next[0]?.id).toBe("orphan-row");
		expect(next[0]?.type).toBe("preset");
	});
});
