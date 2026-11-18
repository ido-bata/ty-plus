import { describe, expect, it } from "vitest";

import {
	boxesOverlap,
	boxHasArea,
	boxWithin,
	type LayoutBox,
	overlapArea,
} from "./layout";

const box = (
	x: number,
	y: number,
	width: number,
	height: number,
): LayoutBox => ({
	x,
	y,
	width,
	height,
});

describe("boxesOverlap", () => {
	it("detects positive-area intersection", () => {
		expect(boxesOverlap(box(0, 0, 10, 10), box(5, 5, 10, 10))).toBe(true);
	});

	it("treats edge contact as non-overlap", () => {
		expect(boxesOverlap(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBe(false);
		expect(boxesOverlap(box(0, 0, 10, 10), box(0, 10, 10, 10))).toBe(false);
	});

	it("rejects disjoint and contained-without-crossing boxes", () => {
		expect(boxesOverlap(box(0, 0, 10, 10), box(20, 20, 5, 5))).toBe(false);
		// containment still intersects — overlap is symmetric area, not crossing.
		expect(boxesOverlap(box(0, 0, 10, 10), box(2, 2, 4, 4))).toBe(true);
	});
});

describe("overlapArea", () => {
	it("computes intersection area", () => {
		expect(overlapArea(box(0, 0, 10, 10), box(5, 0, 10, 10))).toBe(50);
	});

	it("returns 0 for disjoint boxes", () => {
		expect(overlapArea(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBe(0);
	});
});

describe("boxWithin", () => {
	const outer = box(0, 0, 100, 100);

	it("accepts a fully contained box", () => {
		expect(boxWithin(box(10, 10, 50, 50), outer)).toBe(true);
	});

	it("accepts edge-aligned boxes", () => {
		expect(boxWithin(box(0, 0, 100, 100), outer)).toBe(true);
	});

	it("rejects boxes escaping any side", () => {
		expect(boxWithin(box(-1, 10, 50, 50), outer)).toBe(false);
		expect(boxWithin(box(10, -1, 50, 50), outer)).toBe(false);
		expect(boxWithin(box(60, 10, 50, 50), outer)).toBe(false);
		expect(boxWithin(box(10, 60, 50, 50), outer)).toBe(false);
	});

	it("honours tolerance for sub-pixel overflow", () => {
		expect(boxWithin(box(-0.4, 10, 50, 50), outer, 0.5)).toBe(true);
		expect(boxWithin(box(-1, 10, 50, 50), outer, 0.5)).toBe(false);
	});
});

describe("boxHasArea", () => {
	it("requires strictly positive dimensions", () => {
		expect(boxHasArea(box(0, 0, 10, 10))).toBe(true);
		expect(boxHasArea(box(0, 0, 0, 10))).toBe(false);
		expect(boxHasArea(box(0, 0, 10, 0))).toBe(false);
	});
});
