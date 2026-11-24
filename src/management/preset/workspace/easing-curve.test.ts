import { describe, expect, it } from "vitest";

import {
	type CubicParams,
	easingCurveBounds,
	easingCurveSegments,
	type MultiPointParams,
} from "./easing-curve";

const sampleCubic = (
	v0: number,
	v1: number,
	v2: number,
	v3: number,
	t: number,
): number => {
	const u = 1 - t;
	return (
		u * u * u * v0 + 3 * u * u * t * v1 + 3 * u * t * t * v2 + t * t * t * v3
	);
};

const sampleSegments = (
	cubic?: CubicParams,
	points?: MultiPointParams,
): { x: number; y: number }[] => {
	const samples: { x: number; y: number }[] = [];
	const segments = easingCurveSegments(cubic, points);
	for (const seg of segments) {
		for (let i = 0; i <= 512; i += 1) {
			const t = i / 512;
			samples.push({
				x: sampleCubic(seg.xs[0], seg.xs[1], seg.xs[2], seg.xs[3], t),
				y: sampleCubic(seg.ys[0], seg.ys[1], seg.ys[2], seg.ys[3], t),
			});
		}
	}
	return samples;
};

describe("easingCurveBounds", () => {
	it("keeps an in-range cubic on the unit square", () => {
		const bounds = easingCurveBounds(easingCurveSegments([0.42, 0, 0.58, 1]));
		expect(bounds.minX).toBeCloseTo(0, 6);
		expect(bounds.maxX).toBeCloseTo(1, 6);
		expect(bounds.minY).toBeCloseTo(0, 6);
		expect(bounds.maxY).toBeCloseTo(1, 6);
	});

	it("captures overshoot above 1 for pop easings", () => {
		// "Pop In" demo preset: the curve peaks above y = 1.
		const bounds = easingCurveBounds(
			easingCurveSegments([0.34, 1.56, 0.64, 1]),
		);
		expect(bounds.maxY).toBeGreaterThan(1);
		expect(bounds.minY).toBeCloseTo(0, 6);
	});

	it("captures undershoot below 0 for slide easings", () => {
		// "Slide In" demo preset: control points pull the curve below y = 0
		// and above y = 1 on both ends.
		const bounds = easingCurveBounds(
			easingCurveSegments([0.68, -0.55, 0.27, 1.55]),
		);
		expect(bounds.minY).toBeLessThan(0);
		expect(bounds.maxY).toBeGreaterThan(1);
	});

	it("captures x overshoot as well as y overshoot", () => {
		// Control points outside [0, 1] on the x axis push the curve past
		// both horizontal edges.
		const bounds = easingCurveBounds(
			easingCurveSegments([-0.5, 0.5, 1.5, 0.5]),
		);
		expect(bounds.minX).toBeLessThan(0);
		expect(bounds.maxX).toBeGreaterThan(1);
	});

	it("bounds every sampled point of multi-segment curves", () => {
		const points: MultiPointParams = [
			[0, 0, 0, 0, 0.2, 0],
			[0.5, 0.6, 0.3, 0, 0.2, 0],
			[1, 1, 0, 0, 0, 0],
		];
		const bounds = easingCurveBounds(easingCurveSegments(undefined, points));
		for (const p of sampleSegments(undefined, points)) {
			expect(p.x).toBeGreaterThanOrEqual(bounds.minX - 1e-6);
			expect(p.x).toBeLessThanOrEqual(bounds.maxX + 1e-6);
			expect(p.y).toBeGreaterThanOrEqual(bounds.minY - 1e-6);
			expect(p.y).toBeLessThanOrEqual(bounds.maxY + 1e-6);
		}
	});

	it("bounds every sampled point of single-cubic curves", () => {
		const cubic: CubicParams = [0.36, 0, 0.66, -0.56];
		const bounds = easingCurveBounds(easingCurveSegments(cubic));
		expect(bounds.minY).toBeLessThan(0);
		for (const p of sampleSegments(cubic)) {
			expect(p.x).toBeGreaterThanOrEqual(bounds.minX - 1e-6);
			expect(p.x).toBeLessThanOrEqual(bounds.maxX + 1e-6);
			expect(p.y).toBeGreaterThanOrEqual(bounds.minY - 1e-6);
			expect(p.y).toBeLessThanOrEqual(bounds.maxY + 1e-6);
		}
	});

	it("returns empty segments when neither payload is usable", () => {
		expect(easingCurveSegments()).toEqual([]);
		expect(easingCurveSegments(undefined, [[0, 0, 0, 0, 0, 0]])).toEqual([]);
	});
});
