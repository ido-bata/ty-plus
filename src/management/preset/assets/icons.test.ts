import { describe, expect, it } from "vitest";

import {
	hasCustomPresetIcon,
	resolveWorkspaceGlyphIconVisual,
} from "@/management/preset/assets/icons";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";

const basePreset = (over: Partial<Preset>): Preset => ({
	id: "p1",
	title: "My Preset",
	type: "preset",
	filePath: "/presets/My Preset.ffx",
	...over,
});

describe("hasCustomPresetIcon", () => {
	it("is false for the materialized type-default icon", () => {
		const p = basePreset({ type: "preset", icon: presetIconText("FFX") });
		expect(hasCustomPresetIcon(p)).toBe(false);
	});

	it("is false when no icon is persisted", () => {
		expect(hasCustomPresetIcon(basePreset({ icon: undefined }))).toBe(false);
	});

	it("is true for a user-set text icon", () => {
		const p = basePreset({ icon: presetIconText("CUSTOM") });
		expect(hasCustomPresetIcon(p)).toBe(true);
	});

	it("is true for an image icon (e.g. sibling persisted at import)", () => {
		const p = basePreset({
			icon: { type: "image", param: { src: "/presets/My Preset.png" } },
		});
		expect(hasCustomPresetIcon(p)).toBe(true);
	});
});

describe("resolveWorkspaceGlyphIconVisual", () => {
	it("prefers a custom icon over descriptionImage and sibling", () => {
		const visual = resolveWorkspaceGlyphIconVisual(
			basePreset({
				icon: presetIconText("USER"),
				descriptionImage: "/presets/detail.png",
			}),
			{ siblingImageSrc: "/presets/My Preset.png" },
		);
		expect(visual).toEqual({ kind: "text", value: "USER" });
	});

	it("prefers descriptionImage over a derived sibling image", () => {
		const visual = resolveWorkspaceGlyphIconVisual(
			basePreset({ descriptionImage: "/presets/detail.png" }),
			{ siblingImageSrc: "/presets/My Preset.png" },
		);
		expect(visual).toEqual({
			kind: "image",
			value: "/presets/detail.png",
		});
	});

	it("uses the derived sibling image when no custom icon or descriptionImage exists", () => {
		const visual = resolveWorkspaceGlyphIconVisual(
			basePreset({ icon: presetIconText("FFX") }),
			{ siblingImageSrc: "/presets/My Preset.png" },
		);
		expect(visual).toEqual({
			kind: "image",
			value: "/presets/My Preset.png",
		});
	});

	it("falls back to the persisted default icon when no derived source exists", () => {
		const visual = resolveWorkspaceGlyphIconVisual(
			basePreset({ icon: presetIconText("FFX") }),
		);
		expect(visual).toEqual({ kind: "text", value: "FFX" });
	});

	it("falls back to the type label when nothing is persisted", () => {
		const visual = resolveWorkspaceGlyphIconVisual(
			basePreset({ icon: undefined }),
		);
		expect(visual.kind).toBe("text");
	});
});
