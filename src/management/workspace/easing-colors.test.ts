import { describe, expect, it } from "vitest";
import {
	DEFAULT_EASING_CURVE_COLORS,
	DEFAULT_EASING_LABEL_PREFERENCES,
	EASING_COLOR_SETTING_ROWS,
	getCurveCategory,
	getEasingLabelColor,
	readWorkspaceLabelPreferences,
} from "./easing-colors";

describe("readWorkspaceLabelPreferences", () => {
	it("returns defaults when input is undefined", () => {
		const result = readWorkspaceLabelPreferences(undefined);
		expect(result).toEqual(DEFAULT_EASING_LABEL_PREFERENCES);
		expect(result[0]?.name).toBe("None");
		expect(result[1]?.name).toBe("Red");
		expect(result[16]?.name).toBe("Dark Green");
	});

	it("returns defaults when input is null", () => {
		const result = readWorkspaceLabelPreferences(null);
		expect(result).toEqual(DEFAULT_EASING_LABEL_PREFERENCES);
	});

	it("parses a JSON string", () => {
		const json = JSON.stringify({
			1: { val: "#FF0000", name: "Custom Red" },
			5: { val: "#00FF00", name: "Custom Green" },
		});
		const result = readWorkspaceLabelPreferences(json);
		expect(result[1]).toEqual({ val: "#FF0000", name: "Custom Red" });
		expect(result[5]).toEqual({ val: "#00FF00", name: "Custom Green" });
	});

	it("returns an empty object for malformed JSON string", () => {
		const result = readWorkspaceLabelPreferences("not-valid-json{");
		expect(result).toEqual({});
	});

	it("normalizes object input into a typed record", () => {
		const result = readWorkspaceLabelPreferences({
			1: { val: "#FF0000", name: "Red" },
			2: { val: "#00FF00", name: "Green" },
		});
		expect(result[1]).toEqual({ val: "#FF0000", name: "Red" });
		expect(result[2]).toEqual({ val: "#00FF00", name: "Green" });
	});

	it("skips entries with non-string val or name", () => {
		const result = readWorkspaceLabelPreferences({
			1: { val: 123, name: "Red" },
			2: { val: "#00FF00", name: 42 },
			3: { val: "#0000FF", name: "Blue" },
		});
		expect(result[1]).toBeUndefined();
		expect(result[2]).toBeUndefined();
		expect(result[3]).toEqual({ val: "#0000FF", name: "Blue" });
	});

	it("skips entries with non-numeric keys", () => {
		const result = readWorkspaceLabelPreferences({
			foo: { val: "#FF0000", name: "Red" },
			NaN: { val: "#00FF00", name: "Green" },
			1: { val: "#0000FF", name: "Blue" },
		});
		expect(Object.hasOwn(result, "foo")).toBe(false);
		expect(Object.hasOwn(result, "NaN")).toBe(false);
		expect(result[1]).toEqual({ val: "#0000FF", name: "Blue" });
	});
});

describe("getCurveCategory", () => {
	it("detects linear", () => {
		expect(getCurveCategory(0, 0, 1, 1)).toBe("linear");
		expect(getCurveCategory(0.05, 0.05, 0.95, 0.95)).toBe("linear");
	});

	it("detects hold", () => {
		expect(getCurveCategory(0.1, 0, 0.9, 0)).toBe("hold");
		expect(getCurveCategory(0.1, 0.01, 0.9, 0.01)).toBe("hold");
	});

	it("detects easeInGentle vs easeInSharp", () => {
		expect(getCurveCategory(0.42, 0, 1, 1)).toBe("easeInGentle");
		expect(getCurveCategory(0.95, 0, 1, 1)).toBe("easeInSharp");
	});

	it("detects easeOutGentle vs easeOutSharp", () => {
		expect(getCurveCategory(0, 0, 0.58, 1)).toBe("easeOutGentle");
		expect(getCurveCategory(0, 0, 0.05, 1)).toBe("easeOutSharp");
	});

	it("detects easeInOut", () => {
		expect(getCurveCategory(0, 0, 1, 1)).toBe("linear");
		expect(getCurveCategory(0.42, 0, 0.58, 1)).toBe("easeInOut");
	});

	it("detects overshoot", () => {
		expect(getCurveCategory(0, 1.2, 1, 1)).toBe("overshoot");
		expect(getCurveCategory(0, 0, 1, -0.5)).toBe("overshoot");
	});

	it("falls back to bezier for arbitrary control points", () => {
		expect(getCurveCategory(0.3, 0.1, 0.7, 0.9)).toBe("bezier");
	});
});

describe("getEasingLabelColor", () => {
	it("uses the default color for each canonical category", () => {
		expect(getEasingLabelColor({ x1: 0, y1: 0, x2: 1, y2: 1 }, {})).toBe(
			DEFAULT_EASING_CURVE_COLORS.linear,
		);
		expect(getEasingLabelColor({ x1: 0.1, y1: 0, x2: 0.9, y2: 0 }, {})).toBe(
			DEFAULT_EASING_CURVE_COLORS.hold,
		);
		expect(getEasingLabelColor({ x1: 0, y1: 0, x2: 1, y2: 1 }, {})).toBe(
			DEFAULT_EASING_CURVE_COLORS.linear,
		);
	});

	it("respects customColors override", () => {
		const curve = { x1: 0, y1: 0, x2: 1, y2: 1 };
		expect(getEasingLabelColor(curve, { linear: 16 })).toBe(16);
	});

	it("clamps negative results to 0", () => {
		expect(
			getEasingLabelColor({ x1: 0, y1: 0, x2: 1, y2: 1 }, { linear: -5 }),
		).toBe(0);
	});

	it("rounds fractional results", () => {
		const curve = { x1: 0, y1: 0, x2: 1, y2: 1 };
		expect(getEasingLabelColor(curve, { linear: 4.6 })).toBe(5);
		expect(getEasingLabelColor(curve, { linear: 4.4 })).toBe(4);
	});

	it("uses the bezier default for curves that fall through to bezier", () => {
		const custom: Record<string, number> = { bezier: 5 };
		expect(
			getEasingLabelColor({ x1: 0.3, y1: 0.1, x2: 0.7, y2: 0.9 }, custom),
		).toBe(5);
	});
});

describe("EASING_COLOR_SETTING_ROWS", () => {
	it("contains the 9 canonical categories", () => {
		expect(EASING_COLOR_SETTING_ROWS).toHaveLength(9);
		const keys = EASING_COLOR_SETTING_ROWS.map((row) => row.key);
		expect(keys).toEqual([
			"linear",
			"hold",
			"easeInGentle",
			"easeInSharp",
			"easeOutGentle",
			"easeOutSharp",
			"easeInOut",
			"overshoot",
			"bezier",
		]);
	});

	it("includes a non-empty human label for each row", () => {
		for (const row of EASING_COLOR_SETTING_ROWS) {
			expect(row.label.length).toBeGreaterThan(0);
		}
	});
});
