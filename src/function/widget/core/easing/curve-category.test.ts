import { describe, expect, it } from "vitest";
import {
	DEFAULT_CURVE_COLORS,
	detectCurveCategory,
	getColorForCurveCategory,
	mapCategoryToType,
} from "./curve-category";

describe("detectCurveCategory (from bezier control points)", () => {
	it("returns 'linear' for a curve whose handles sit on the diagonal", () => {
		expect(detectCurveCategory(0, 0, 1, 1)).toBe("linear");
		expect(detectCurveCategory(0.25, 0.25, 0.75, 0.75)).toBe("linear");
	});

	it("returns 'hold' when both Y values are near 0", () => {
		expect(detectCurveCategory(0.42, 0, 1, 0)).toBe("hold");
	});

	it("returns 'easeInGentle' for canonical ease-in", () => {
		expect(detectCurveCategory(0.42, 0, 1, 1)).toBe("easeInGentle");
	});

	it("returns 'easeInSharp' when intensity is high for an ease-in shape", () => {
		// y1 = 0, y2 ≈ x2 (still ease-in), but x1 is far from y1 → sharp
		expect(detectCurveCategory(0.7, 0, 1, 0.95)).toBe("easeInSharp");
	});

	it("returns 'easeOutSharp' when intensity is high for an ease-out shape", () => {
		// y1 ≈ x1, y2 = 1 (still ease-out), but x2 is far from y2 → sharp
		expect(detectCurveCategory(0, 0.05, 0.3, 1)).toBe("easeOutSharp");
	});

	it("returns 'easeOutGentle' for canonical ease-out", () => {
		expect(detectCurveCategory(0, 0, 0.58, 1)).toBe("easeOutGentle");
	});

	it("returns 'easeInOut' for canonical ease-in-out", () => {
		expect(detectCurveCategory(0.42, 0, 0.58, 1)).toBe("easeInOut");
	});

	it("returns 'overshoot' when Y values escape the unit range", () => {
		expect(detectCurveCategory(0, 1.2, 1, -0.1)).toBe("overshoot");
	});

	it("returns 'bezier' for arbitrary control points that don't match a preset", () => {
		expect(detectCurveCategory(0.3, 0.7, 0.8, 0.4)).toBe("bezier");
	});
});

describe("getColorForCurveCategory (AE label color mapping)", () => {
	it("exposes a default color for every category", () => {
		const categories: Array<keyof typeof DEFAULT_CURVE_COLORS> = [
			"linear",
			"hold",
			"easeInGentle",
			"easeInSharp",
			"easeOutGentle",
			"easeOutSharp",
			"easeInOut",
			"overshoot",
			"bezier",
		];
		for (const category of categories) {
			const color = DEFAULT_CURVE_COLORS[category];
			expect(color).toBeGreaterThan(0);
			expect(color).toBeLessThanOrEqual(16);
		}
	});

	it("returns a different color for each known category (so apply actually changes)", () => {
		const linearColor = getColorForCurveCategory("linear");
		const easeInColor = getColorForCurveCategory("easeInGentle");
		const easeOutColor = getColorForCurveCategory("easeOutGentle");
		const easeInOutColor = getColorForCurveCategory("easeInOut");
		const colors = new Set([
			linearColor,
			easeInColor,
			easeOutColor,
			easeInOutColor,
		]);
		expect(colors.size).toBeGreaterThan(1);
	});

	it("allows custom color overrides per category", () => {
		const custom = { easeInGentle: 13 } as const;
		expect(getColorForCurveCategory("easeInGentle", custom)).toBe(13);
		expect(getColorForCurveCategory("linear", custom)).toBe(
			DEFAULT_CURVE_COLORS.linear,
		);
	});
});

describe("mapCategoryToType (AE keyframe interpolation type selector)", () => {
	it("maps 'linear' verbatim", () => {
		expect(mapCategoryToType("linear")).toBe("linear");
	});

	it("maps 'hold' verbatim", () => {
		expect(mapCategoryToType("hold")).toBe("hold");
	});

	it("collapses easeInGentle and easeInSharp to 'easeIn'", () => {
		expect(mapCategoryToType("easeInGentle")).toBe("easeIn");
		expect(mapCategoryToType("easeInSharp")).toBe("easeIn");
	});

	it("collapses easeOutGentle and easeOutSharp to 'easeOut'", () => {
		expect(mapCategoryToType("easeOutGentle")).toBe("easeOut");
		expect(mapCategoryToType("easeOutSharp")).toBe("easeOut");
	});

	it("maps 'easeInOut' verbatim", () => {
		expect(mapCategoryToType("easeInOut")).toBe("easeInOut");
	});

	it("falls back to 'bezier' for overshoot and arbitrary bezier", () => {
		expect(mapCategoryToType("overshoot")).toBe("bezier");
		expect(mapCategoryToType("bezier")).toBe("bezier");
	});
});
