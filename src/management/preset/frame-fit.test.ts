import { describe, expect, it } from "vitest";
import {
	fitTextFontPx,
	GLYPH_HOST_MIN_FONT_PX,
	glyphFrameRadiusPx,
	measureTextWidth100,
	resolveFittedTextFont,
} from "./frame-fit";

// `measureTextWidth100` falls back to a per-grapheme em estimate when
// canvas 2D is unavailable (node/jsdom): wide glyphs (CJK, kana) count as
// 1em, everything else ~0.58em — i.e. `units` px at a 100px font.
describe("measureTextWidth100", () => {
	it("estimates wide glyphs at 1em and latin at ~0.58em", () => {
		// "AB": 2 × 58 = 116
		expect(measureTextWidth100("AB", "", "400")).toBe(116);
		// "フェードイン": 6 wide glyphs × 100 = 600
		expect(measureTextWidth100("フェードイン", "", "400")).toBe(600);
	});
});

describe("fitTextFontPx", () => {
	const base = {
		lines: ["AB"],
		boxWidth: 100,
		contentWidth: 98,
		contentHeight: 98,
		preferredPct: 18,
		minFontPx: 8,
		fontFamily: "",
		fontWeight: "500",
	};

	it("keeps the container-query proportion when the text fits", () => {
		// 18% of a 100px frame = 18px; "AB" at 18px is ~21px wide — fits.
		expect(fitTextFontPx(base)).toBeCloseTo(18, 5);
	});

	it("shrinks below the preferred size when a line would overflow the width", () => {
		// "フェードイン" is 600 units at 100px → 6px per px of font.
		// contentWidth 21px → max font ≈ 21 * 0.98 * 100 / 600 ≈ 3.43,
		// but the 5px badge floor (minFontPx) wins, matching clamp().
		const px = fitTextFontPx({
			...base,
			lines: ["フェードイン"],
			boxWidth: 22,
			contentWidth: 21,
			contentHeight: 21,
			preferredPct: 18,
			minFontPx: 5,
		});
		expect(px).toBe(5);
	});

	it("shrinks to fit the height for multi-line glyphs", () => {
		// 3 lines in a 30px content box → height cap ≈ 30 * 0.96 / 3 ≈ 9.6px,
		// below the 13% × 100px = 13px preferred size.
		const px = fitTextFontPx({
			...base,
			lines: ["aaaa", "bbbb", "cccc"],
			contentHeight: 30,
		});
		expect(px).toBeLessThanOrEqual(9.61);
	});

	it("lifts the preferred size to the floor when floorWithinFit still fits", () => {
		// Issue #751: "AB" preferred = 18% × 40px = 7.2px, below the 8px
		// floor — but the width/height caps (~32px / ~36px) leave room,
		// so the soft floor lifts the result to 8px instead of rendering
		// the sub-floor preferred size.
		const px = fitTextFontPx({
			...base,
			lines: ["AB"],
			boxWidth: 40,
			contentWidth: 38,
			contentHeight: 38,
			preferredPct: 18,
			minFontPx: 8,
			floorWithinFit: true,
		});
		expect(px).toBe(8);
	});

	it("caps the floor at the fit size when floorWithinFit is set", () => {
		// Same cramped case as the hard-floor test above: the width cap
		// is ~3.43px, so an 8px floor must yield to the cap — the result
		// is the largest fitting size, never a clipped 8px.
		const px = fitTextFontPx({
			...base,
			lines: ["フェードイン"],
			boxWidth: 22,
			contentWidth: 21,
			contentHeight: 21,
			preferredPct: 18,
			minFontPx: 8,
			floorWithinFit: true,
		});
		expect(px).toBeCloseTo(3.43, 1);
	});

	it("applies the minimum floor and the 96px cap like clamp()", () => {
		expect(fitTextFontPx({ ...base, boxWidth: 10, contentWidth: 9 })).toBe(8);
		expect(
			fitTextFontPx({
				...base,
				boxWidth: 2000,
				contentWidth: 1998,
				contentHeight: 1998,
			}),
		).toBe(96);
	});
});

describe("resolveFittedTextFont", () => {
	it("passes sizes at or above the host floor through unscaled", () => {
		expect(resolveFittedTextFont(18)).toEqual({ fontPx: 18, scale: 1 });
		expect(resolveFittedTextFont(GLYPH_HOST_MIN_FONT_PX)).toEqual({
			fontPx: GLYPH_HOST_MIN_FONT_PX,
			scale: 1,
		});
	});

	it("renders sub-floor sizes at the floor and scales them down", () => {
		// CEF clamps font-size below ~10px, so a 3.43px fit must paint at
		// 10px and shrink visually to the same effective size (#704).
		const result = resolveFittedTextFont(3.43);
		expect(result.fontPx).toBe(GLYPH_HOST_MIN_FONT_PX);
		expect(result.scale).toBeCloseTo(0.343, 3);
		expect(result.fontPx * result.scale).toBeCloseTo(3.43, 5);
	});
});

describe("glyphFrameRadiusPx", () => {
	it("matches the old min(12px, 15cqi) radius", () => {
		expect(glyphFrameRadiusPx(22)).toBeCloseTo(3.3, 5);
		expect(glyphFrameRadiusPx(32)).toBeCloseTo(4.8, 5);
		expect(glyphFrameRadiusPx(200)).toBe(12);
	});
});
