import { describe, expect, it } from "vitest";

import {
	contrastRatio,
	flattenOver,
	parseCssColor,
	relativeLuminance,
} from "./color";

describe("parseCssColor", () => {
	it("parses hex colors", () => {
		expect(parseCssColor("#fff")).toEqual({ r: 1, g: 1, b: 1, a: 1 });
		expect(parseCssColor("#1d1d1d")).toEqual({
			r: 29 / 255,
			g: 29 / 255,
			b: 29 / 255,
			a: 1,
		});
	});

	it("parses rgb()/rgba() with numeric and percent channels", () => {
		expect(parseCssColor("rgb(255, 0, 0)")).toEqual({
			r: 1,
			g: 0,
			b: 0,
			a: 1,
		});
		expect(parseCssColor("rgba(100%, 0%, 0%, 0.5)")).toEqual({
			r: 1,
			g: 0,
			b: 0,
			a: 0.5,
		});
		expect(parseCssColor("rgb(29 29 29)")).toEqual({
			r: 29 / 255,
			g: 29 / 255,
			b: 29 / 255,
			a: 1,
		});
		expect(parseCssColor("rgb(255 255 255 / 0.12)")).toEqual({
			r: 1,
			g: 1,
			b: 1,
			a: 0.12,
		});
	});

	it("returns null for unparseable values", () => {
		expect(parseCssColor("transparent")).toBeNull();
		expect(parseCssColor("var(--x)")).toBeNull();
		expect(parseCssColor("")).toBeNull();
	});
});

describe("flattenOver", () => {
	it("composites translucent white over black", () => {
		const result = flattenOver(
			{ r: 1, g: 1, b: 1, a: 0.12 },
			{ r: 0, g: 0, b: 0 },
		);
		expect(result.r).toBeCloseTo(0.12, 5);
		expect(result.g).toBeCloseTo(0.12, 5);
		expect(result.b).toBeCloseTo(0.12, 5);
	});
});

describe("contrastRatio", () => {
	it("is 21:1 for black on white and 1:1 for identical colors", () => {
		const black = { r: 0, g: 0, b: 0 };
		const white = { r: 1, g: 1, b: 1 };
		expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
		expect(contrastRatio(black, black)).toBeCloseTo(1, 5);
	});

	it("matches the WCAG worked example (#777 on white ≈ 4.48:1)", () => {
		const gray = parseCssColor("#777777");
		const white = { r: 1, g: 1, b: 1 };
		if (!gray) throw new Error("unreachable");
		expect(contrastRatio(gray, white)).toBeCloseTo(4.48, 1);
	});

	it("relativeLuminance is order-independent in ratio", () => {
		const a = { r: 0.2, g: 0.4, b: 0.6 };
		const b = { r: 0.9, g: 0.1, b: 0.3 };
		expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
		expect(relativeLuminance(a)).toBeGreaterThan(0);
	});
});
