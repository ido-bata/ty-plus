import { describe, expect, it } from "vitest";
import { buildCurvePointsFromProcedural } from "./procedural-points";

const POINT_FLATNESS_EPS = 1e-4;

describe("buildCurvePointsFromProcedural (bounce/elastic extremes)", () => {
	it("bounce mode at handle (1, 0) — first segment endpoint (points[0].hOut) carries a non-zero y so the AE KeyframeEase slope captures the bounce rise", () => {
		const points = buildCurvePointsFromProcedural("bounce", { x: 1, y: 0 });
		expect(Math.abs(points[0].hOut.y)).toBeGreaterThan(POINT_FLATNESS_EPS);
	});

	it("bounce mode at handle (1, 0) — last segment endpoint (points[last].hIn) carries a non-zero y so the landing matches the procedural curve", () => {
		const points = buildCurvePointsFromProcedural("bounce", { x: 1, y: 0 });
		const lastIdx = points.length - 1;
		expect(Math.abs(points[lastIdx].hIn.y)).toBeGreaterThan(POINT_FLATNESS_EPS);
	});

	it("elastic mode at handle (1, 0) — first segment endpoint (points[0].hOut) carries a non-zero y so elastic oscillation is preserved", () => {
		const points = buildCurvePointsFromProcedural("elastic", { x: 1, y: 0 });
		expect(Math.abs(points[0].hOut.y)).toBeGreaterThan(POINT_FLATNESS_EPS);
	});

	it("elastic mode at handle (1, 0) — last segment endpoint (points[last].hIn) carries a non-zero y so elastic landing is preserved", () => {
		const points = buildCurvePointsFromProcedural("elastic", { x: 1, y: 0 });
		const lastIdx = points.length - 1;
		expect(Math.abs(points[lastIdx].hIn.y)).toBeGreaterThan(POINT_FLATNESS_EPS);
	});

	it("bounce mode at handle (1, 0) — x monotonicity is preserved across all points", () => {
		const points = buildCurvePointsFromProcedural("bounce", { x: 1, y: 0 });
		for (let i = 1; i < points.length; i += 1) {
			expect(points[i].x).toBeGreaterThanOrEqual(points[i - 1].x);
		}
	});

	it("returns stable endpoints regardless of mode (anchor at 0 and 1)", () => {
		for (const mode of ["bounce", "elastic"] as const) {
			const points = buildCurvePointsFromProcedural(mode, { x: 0.4, y: 0.6 });
			expect(points[0].x).toBe(0);
			expect(points[0].y).toBe(0);
			expect(points[points.length - 1].x).toBe(1);
			expect(points[points.length - 1].y).toBe(1);
		}
	});

	it("bounce/elastic endpoint handles are bounded so the visual handle stays inside the chart margin when the user converts to curve", () => {
		// The fits for the first/last segments are unconstrained on one side
		// (the endpoint is not an extremum), so the least-squares solver can
		// push the handle to a y-offset well outside the unit square (e.g.
		// ~0.7 for bounce, ~1.4 for elastic at handle (1, 0)). The editor
		// fits the unit square inside the canvas with a ~40px margin and
		// zooms to that fit, so even a 0.3 offset maps to ~96 px off-point
		// — outside the unit square and into the margin, which the user
		// reads as "the handle flies off-canvas". The endpoints are clamped
		// to a cap that keeps the on-canvas handle inside the chart margin
		// (≤16 px off-point at typical zoom) while still letting the bezier
		// carry a small ease slope at the segment ends.
		const MAX_ENDPOINT_HANDLE_Y = 0.05;
		for (const mode of ["bounce", "elastic"] as const) {
			for (const handle of [
				{ x: 0, y: 0 },
				{ x: 0.5, y: 0.5 },
				{ x: 1, y: 0 },
			]) {
				const points = buildCurvePointsFromProcedural(mode, handle);
				const first = points[0];
				const last = points[points.length - 1];
				expect(Math.abs(first.hOut.y)).toBeLessThanOrEqual(
					MAX_ENDPOINT_HANDLE_Y,
				);
				expect(Math.abs(last.hIn.y)).toBeLessThanOrEqual(MAX_ENDPOINT_HANDLE_Y);
			}
		}
	});

	it("bounce mode at handle (1, 0) — first segment curve y reaches >= 0.5 within x < 0.3 (bounce rises sharply)", () => {
		const points = buildCurvePointsFromProcedural("bounce", { x: 1, y: 0 });
		const firstMid = points[1];
		expect(firstMid).toBeDefined();
		expect(firstMid.x).toBeLessThan(0.3);
		expect(firstMid.y).toBeGreaterThanOrEqual(0.5);
	});
});
