import { describe, expect, it } from "vitest";

import { presetIconCanvas, presetIconText } from "@/management/preset/contract";

import { resolveWorkspaceGlyphIconVisual } from "./icons";

const preset = {
	id: "preset-1",
	title: "Bounce In",
	type: "preset" as const,
};

describe("resolveWorkspaceGlyphIconVisual canvas fallback (Issue #325)", () => {
	it("resolves a content-free factory-default canvas icon to the preset name", () => {
		const visual = resolveWorkspaceGlyphIconVisual({
			...preset,
			icon: presetIconCanvas({ cubic: [0.25, 0.1, 0.25, 1] }),
		});
		expect(visual).toEqual({ kind: "text", value: "Bounce" });
	});

	it("resolves a canvas icon without cubic or paint to the preset name", () => {
		const visual = resolveWorkspaceGlyphIconVisual({
			...preset,
			icon: presetIconCanvas({}),
		});
		expect(visual).toEqual({ kind: "text", value: "Bounce" });
	});

	it("keeps a canvas icon with a non-default cubic", () => {
		const visual = resolveWorkspaceGlyphIconVisual({
			...preset,
			icon: presetIconCanvas({ cubic: [0.42, 0, 0.58, 1] }),
		});
		expect(visual).toMatchObject({
			kind: "canvas",
			cubic: [0.42, 0, 0.58, 1],
		});
	});

	it("keeps a factory-default cubic when the icon carries paint", () => {
		const visual = resolveWorkspaceGlyphIconVisual({
			...preset,
			icon: presetIconCanvas({
				cubic: [0.25, 0.1, 0.25, 1],
				color: "#ff0000",
			}),
		});
		expect(visual).toMatchObject({ kind: "canvas", color: "#ff0000" });
	});

	it("keeps a factory-default cubic when multi-point data is present", () => {
		const visual = resolveWorkspaceGlyphIconVisual({
			...preset,
			icon: presetIconCanvas({
				cubic: [0.25, 0.1, 0.25, 1],
				points: [[0, 0, 0.1, 0.2, 0.3, 0.4]],
			}),
		});
		expect(visual.kind).toBe("canvas");
	});

	it("still resolves explicit text icons", () => {
		const visual = resolveWorkspaceGlyphIconVisual({
			...preset,
			icon: presetIconText("FFX"),
		});
		expect(visual).toEqual({
			kind: "text",
			value: "FFX",
			color: undefined,
			backgroundColor: undefined,
		});
	});
});
