import { describe, expect, it } from "vitest";
import {
	cloneCurvePoints,
	decideReverseAction,
	reverseCurvePoints,
} from "./curve-ops";

describe("reverseCurvePoints", () => {
	it("mirrors endpoints about (0.5, 0.5) so the first point becomes the last and vice versa", () => {
		const points = [
			{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.4, y: 0 } },
			{ x: 1, y: 1, hIn: { x: -0.4, y: 0 }, hOut: { x: 0, y: 0 } },
		];
		const reversed = reverseCurvePoints(points);
		expect(reversed).toEqual([
			{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.4, y: 0 } },
			{ x: 1, y: 1, hIn: { x: -0.4, y: 0 }, hOut: { x: 0, y: 0 } },
		]);
	});

	it("reverses a multi-point procedural bounce series: order flips and every coordinate mirrors about 0.5", () => {
		const points = [
			{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.2, y: 0.3 } },
			{ x: 0.3, y: 0.9, hIn: { x: -0.1, y: -0.2 }, hOut: { x: 0.1, y: 0.2 } },
			{ x: 0.7, y: 0.4, hIn: { x: -0.1, y: 0.1 }, hOut: { x: 0.1, y: -0.1 } },
			{ x: 1, y: 1, hIn: { x: -0.2, y: 0 }, hOut: { x: 0, y: 0 } },
		];
		const reversed = reverseCurvePoints(points);
		expect(reversed).toHaveLength(4);
		// Order is reversed, then each point is mirrored about (0.5, 0.5).
		expect(reversed[0].x).toBeCloseTo(0, 10);
		expect(reversed[0].y).toBeCloseTo(0, 10);
		expect(reversed[0].hIn.x).toBeCloseTo(0, 10);
		expect(reversed[0].hIn.y).toBeCloseTo(0, 10);
		expect(reversed[0].hOut.x).toBeCloseTo(0.2, 10);
		expect(reversed[0].hOut.y).toBeCloseTo(0, 10);
		expect(reversed[1].x).toBeCloseTo(0.3, 10);
		expect(reversed[1].y).toBeCloseTo(0.6, 10);
		expect(reversed[1].hIn.x).toBeCloseTo(-0.1, 10);
		expect(reversed[1].hIn.y).toBeCloseTo(0.1, 10);
		expect(reversed[1].hOut.x).toBeCloseTo(0.1, 10);
		expect(reversed[1].hOut.y).toBeCloseTo(-0.1, 10);
		expect(reversed[2].x).toBeCloseTo(0.7, 10);
		expect(reversed[2].y).toBeCloseTo(0.1, 10);
		expect(reversed[2].hIn.x).toBeCloseTo(-0.1, 10);
		expect(reversed[2].hIn.y).toBeCloseTo(-0.2, 10);
		expect(reversed[2].hOut.x).toBeCloseTo(0.1, 10);
		expect(reversed[2].hOut.y).toBeCloseTo(0.2, 10);
		expect(reversed[3].x).toBeCloseTo(1, 10);
		expect(reversed[3].y).toBeCloseTo(1, 10);
		expect(reversed[3].hIn.x).toBeCloseTo(-0.2, 10);
		expect(reversed[3].hIn.y).toBeCloseTo(-0.3, 10);
		expect(reversed[3].hOut.x).toBeCloseTo(0, 10);
		expect(reversed[3].hOut.y).toBeCloseTo(0, 10);
	});

	it("clamps x to the unit square so floating-point noise never produces 1 - 0.9999999 = 1e-7 escapes", () => {
		const points = [{ x: 1, y: 1, hIn: { x: 0, y: 0 }, hOut: { x: 0, y: 0 } }];
		const reversed = reverseCurvePoints(points);
		expect(reversed[0].x).toBe(0);
		expect(reversed[0].y).toBe(0);
	});

	it("does not mutate the source array (the editor reuses it for state restore)", () => {
		const points = [
			{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.1, y: 0 } },
			{ x: 1, y: 1, hIn: { x: -0.1, y: 0 }, hOut: { x: 0, y: 0 } },
		];
		const snapshot = structuredClone(points);
		reverseCurvePoints(points);
		expect(points).toEqual(snapshot);
	});

	it("is its own inverse: reversing twice returns the original points (modulo clamping)", () => {
		const points = [
			{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.3, y: 0.2 } },
			{ x: 0.4, y: 0.7, hIn: { x: -0.1, y: 0.1 }, hOut: { x: 0.1, y: -0.1 } },
			{ x: 1, y: 1, hIn: { x: -0.2, y: -0.1 }, hOut: { x: 0, y: 0 } },
		];
		const twice = reverseCurvePoints(reverseCurvePoints(points));
		for (let i = 0; i < points.length; i += 1) {
			expect(twice[i].x).toBeCloseTo(points[i].x, 10);
			expect(twice[i].y).toBeCloseTo(points[i].y, 10);
			expect(twice[i].hIn.x).toBeCloseTo(points[i].hIn.x, 10);
			expect(twice[i].hIn.y).toBeCloseTo(points[i].hIn.y, 10);
			expect(twice[i].hOut.x).toBeCloseTo(points[i].hOut.x, 10);
			expect(twice[i].hOut.y).toBeCloseTo(points[i].hOut.y, 10);
		}
	});
});

describe("cloneCurvePoints", () => {
	it("produces a deep copy so the caller's list is not mutated", () => {
		const points = [
			{ x: 0.2, y: 0.3, hIn: { x: -0.1, y: 0 }, hOut: { x: 0.1, y: 0.2 } },
		];
		const clone = cloneCurvePoints(points);
		expect(clone).toEqual(points);
		expect(clone[0]).not.toBe(points[0]);
		expect(clone[0].hIn).not.toBe(points[0].hIn);
		expect(clone[0].hOut).not.toBe(points[0].hOut);
	});
});

describe("decideReverseAction (the editor's Reverse button)", () => {
	// The "reverse" action means two different things depending on the
	// source mode. Capturing both branches in the same describe block
	// keeps the contrast visible: bouncing/elastic must NOT flip, but
	// an existing curve MUST flip and stay flippable on repeat clicks.

	const aCurve = (): Array<{
		x: number;
		y: number;
		hIn: Point;
		hOut: Point;
	}> => [
		{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.2, y: 0.1 } },
		{ x: 1, y: 1, hIn: { x: -0.2, y: -0.1 }, hOut: { x: 0, y: 0 } },
	];
	// A bounce preview is a list of points; the editor computes it via
	// buildCurvePointsFromProcedural. We pass a stand-in here so the
	// decision logic itself can be tested without that dependency.
	type Pt = { x: number; y: number; hIn: Point; hOut: Point };
	const bouncePreview = (): Pt[] => [
		{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.1, y: 0.5 } },
		{ x: 0.4, y: 0.95, hIn: { x: -0.05, y: -0.1 }, hOut: { x: 0.05, y: 0.1 } },
		{ x: 1, y: 1, hIn: { x: -0.1, y: 0 }, hOut: { x: 0, y: 0 } },
	];
	const elasticPreview = bouncePreview;

	it("promotes a bounce preview to a curve WITHOUT mirroring it (the bounce shape stays intact)", () => {
		const preview = bouncePreview();
		const result = decideReverseAction("bounce", [], preview);
		expect(result.mode).toBe("curve");
		// A copy of the preview, NOT a reversed preview.
		expect(result.points).toEqual(preview);
		expect(result.points).not.toBe(preview);
	});

	it("promotes an elastic preview to a curve WITHOUT mirroring it", () => {
		const preview = elasticPreview();
		const result = decideReverseAction("elastic", [], preview);
		expect(result.mode).toBe("curve");
		expect(result.points).toEqual(preview);
	});

	it("mirrors an existing curve so a click on the Reverse button actually flips it", () => {
		const curve = aCurve();
		const result = decideReverseAction("curve", curve, []);
		expect(result.mode).toBe("curve");
		// The mirror changes the order: first point becomes the second.
		expect(result.points[0].x).toBeCloseTo(0, 10);
		expect(result.points[0].y).toBeCloseTo(0, 10);
		expect(result.points[1].x).toBeCloseTo(1, 10);
		expect(result.points[1].y).toBeCloseTo(1, 10);
		// And the handle directions are negated: the first point's outgoing
		// handle was (0.2, 0.1), which becomes the second point's incoming
		// handle after the flip — negated.
		expect(result.points[0].hOut.x).toBeCloseTo(0.2, 10);
		expect(result.points[0].hOut.y).toBeCloseTo(0.1, 10);
	});

	it("actually changes the handles on a deliberately asymmetric curve (the symmetric aCurve is self-mirroring and would pass a broken implementation)", () => {
		// aCurve's point 0 hOut (0.2, 0.1) is the exact mirror of point 1 hIn
		// (-0.2, -0.1), so the reversed curve is identical to the input. A
		// broken mirror that forgot to swap handles would still pass. Here
		// the handles are intentionally non-mirrored so the reversed curve
		// must differ from the input.
		const curve: Pt[] = [
			{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.3, y: 0.4 } },
			{ x: 1, y: 1, hIn: { x: -0.5, y: -0.1 }, hOut: { x: 0, y: 0 } },
		];
		const result = decideReverseAction("curve", curve, []);
		// The new first point's outgoing handle is the negation of the
		// original last point's incoming handle.
		expect(result.points[0].hOut.x).toBeCloseTo(0.5, 10);
		expect(result.points[0].hOut.y).toBeCloseTo(0.1, 10);
		// The new last point's incoming handle is the negation of the
		// original first point's outgoing handle.
		expect(result.points[1].hIn.x).toBeCloseTo(-0.3, 10);
		expect(result.points[1].hIn.y).toBeCloseTo(-0.4, 10);
		// And the resulting curve is not deep-equal to the input.
		expect(result.points).not.toEqual(curve);
	});

	it("mirrors a 3-point curve (aCurve is 2-point and would not catch a broken mid-segment handle swap)", () => {
		const curve: Pt[] = [
			{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.2, y: 0.3 } },
			{ x: 0.5, y: 0.7, hIn: { x: -0.1, y: 0.05 }, hOut: { x: 0.1, y: -0.05 } },
			{ x: 1, y: 1, hIn: { x: -0.3, y: -0.2 }, hOut: { x: 0, y: 0 } },
		];
		const result = decideReverseAction("curve", curve, []);
		// Order flips: original point 2 → new point 0 (x mirrored to 0).
		expect(result.points[0].x).toBeCloseTo(0, 10);
		expect(result.points[0].y).toBeCloseTo(0, 10);
		// Original point 0 → new point 2 (x mirrored to 1).
		expect(result.points[2].x).toBeCloseTo(1, 10);
		expect(result.points[2].y).toBeCloseTo(1, 10);
		// Middle point's x stays at 0.5; y mirrors to 0.3.
		expect(result.points[1].x).toBeCloseTo(0.5, 10);
		expect(result.points[1].y).toBeCloseTo(0.3, 10);
		// Middle point's handles are negated.
		expect(result.points[1].hIn.x).toBeCloseTo(-0.1, 10);
		expect(result.points[1].hIn.y).toBeCloseTo(0.05, 10);
		expect(result.points[1].hOut.x).toBeCloseTo(0.1, 10);
		expect(result.points[1].hOut.y).toBeCloseTo(-0.05, 10);
	});

	it("is its own inverse on a curve: clicking reverse on an already-reversed curve returns to the original", () => {
		const curve = aCurve();
		const once = decideReverseAction("curve", curve, []);
		const twice = decideReverseAction("curve", once.points, []);
		for (let i = 0; i < curve.length; i += 1) {
			expect(twice.points[i].x).toBeCloseTo(curve[i].x, 10);
			expect(twice.points[i].y).toBeCloseTo(curve[i].y, 10);
			expect(twice.points[i].hIn.x).toBeCloseTo(curve[i].hIn.x, 10);
			expect(twice.points[i].hIn.y).toBeCloseTo(curve[i].hIn.y, 10);
			expect(twice.points[i].hOut.x).toBeCloseTo(curve[i].hOut.x, 10);
			expect(twice.points[i].hOut.y).toBeCloseTo(curve[i].hOut.y, 10);
		}
	});

	it("is its own inverse on an asymmetric curve (regression: double-reverse returns to input)", () => {
		const curve: Pt[] = [
			{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.3, y: 0.4 } },
			{ x: 1, y: 1, hIn: { x: -0.5, y: -0.1 }, hOut: { x: 0, y: 0 } },
		];
		const once = decideReverseAction("curve", curve, []);
		const twice = decideReverseAction("curve", once.points, []);
		for (let i = 0; i < curve.length; i += 1) {
			expect(twice.points[i].x).toBeCloseTo(curve[i].x, 10);
			expect(twice.points[i].y).toBeCloseTo(curve[i].y, 10);
			expect(twice.points[i].hIn.x).toBeCloseTo(curve[i].hIn.x, 10);
			expect(twice.points[i].hIn.y).toBeCloseTo(curve[i].hIn.y, 10);
			expect(twice.points[i].hOut.x).toBeCloseTo(curve[i].hOut.x, 10);
			expect(twice.points[i].hOut.y).toBeCloseTo(curve[i].hOut.y, 10);
		}
	});

	it("does not mutate the source curve (a second click would otherwise see a flipped copy)", () => {
		const curve = aCurve();
		const snapshot = structuredClone(curve);
		decideReverseAction("curve", curve, []);
		expect(curve).toEqual(snapshot);
	});

	it("treats loop mode as a curve for reverse so the single-cycle template mirrors, not promotes", () => {
		// Loop mode's underlying data is the single-cycle curve template.
		// Reverse must mirror that template (the same as curve mode) so
		// the next loop-apply replicates a reversed shape. Promoting to a
		// procedural preview here would silently drop the user's edits.
		const curve: Pt[] = [
			{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.3, y: 0.4 } },
			{ x: 1, y: 1, hIn: { x: -0.5, y: -0.1 }, hOut: { x: 0, y: 0 } },
		];
		const result = decideReverseAction("loop", curve, []);
		expect(result.mode).toBe("curve");
		// The mirrored curve's first point's outgoing handle is the
		// negation of the input's last point's incoming handle.
		expect(result.points[0].hOut.x).toBeCloseTo(0.5, 10);
		expect(result.points[0].hOut.y).toBeCloseTo(0.1, 10);
		expect(result.points[1].hIn.x).toBeCloseTo(-0.3, 10);
		expect(result.points[1].hIn.y).toBeCloseTo(-0.4, 10);
	});
});

type Point = { x: number; y: number };
