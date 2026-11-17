import { describe, expect, it } from "vitest";
import {
	computeCamera,
	handleDotScreenPos,
} from "@/function/widget/core/easing/camera";
import {
	applyMirror,
	findNearestDragTarget,
	isPointOrHandleHit,
	resolveHandleMove,
	resolvePullOutHandle,
} from "@/function/widget/core/easing/gestures";

describe("applyMirror", () => {
	it("returns the 180° mirror of a non-zero vector", () => {
		expect(applyMirror({ x: 0.3, y: 0.5 })).toEqual({ x: -0.3, y: -0.5 });
	});

	it("returns a zero vector unchanged", () => {
		const result = applyMirror({ x: 0, y: 0 });
		// applyMirror applies unary minus, yielding -0 for 0. Normalize with `+ 0`
		// so the assertion treats -0 and 0 as mathematically equal.
		expect(result.x + 0).toBe(0);
		expect(result.y + 0).toBe(0);
	});

	it("mirrors a negative vector to positive", () => {
		expect(applyMirror({ x: -0.2, y: -0.4 })).toEqual({ x: 0.2, y: 0.4 });
	});
});

describe("resolveHandleMove", () => {
	const initial = { hIn: { x: -0.3, y: 0 }, hOut: { x: 0.3, y: 0 } };
	const next = { x: -0.4, y: 0.2 };

	it("with neither flag: writes dragged handle and mirrors the opposite", () => {
		const result = resolveHandleMove({
			hIn: initial.hIn,
			hOut: initial.hOut,
			side: "hIn",
			next,
			altHeld: false,
			mirrorHeld: false,
		});
		expect(result.hIn).toEqual(next);
		expect(result.hOut).toEqual({ x: 0.4, y: -0.2 });
	});

	it("with altHeld=true: writes dragged handle, leaves opposite unchanged", () => {
		const result = resolveHandleMove({
			hIn: initial.hIn,
			hOut: initial.hOut,
			side: "hOut",
			next: { x: 0.5, y: 0.1 },
			altHeld: true,
			mirrorHeld: false,
		});
		expect(result.hOut).toEqual({ x: 0.5, y: 0.1 });
		expect(result.hIn).toEqual(initial.hIn);
	});

	it("with mirrorHeld=true: writes dragged handle, forces opposite to 180° mirror", () => {
		const result = resolveHandleMove({
			hIn: initial.hIn,
			hOut: initial.hOut,
			side: "hIn",
			next: { x: -0.5, y: 0.3 },
			altHeld: false,
			mirrorHeld: true,
		});
		expect(result.hIn).toEqual({ x: -0.5, y: 0.3 });
		expect(result.hOut).toEqual({ x: 0.5, y: -0.3 });
	});

	it("mirror takes priority when both flags are true", () => {
		const result = resolveHandleMove({
			hIn: initial.hIn,
			hOut: initial.hOut,
			side: "hOut",
			next: { x: 0.4, y: 0.2 },
			altHeld: true,
			mirrorHeld: true,
		});
		expect(result.hOut).toEqual({ x: 0.4, y: 0.2 });
		expect(result.hIn).toEqual({ x: -0.4, y: -0.2 });
	});
});

describe("resolvePullOutHandle", () => {
	const keyframe = { x: 0.5, y: 0.5 };

	it("click to the right of keyframe with side='hOut' produces a positive-x handle", () => {
		const click = { x: 0.7, y: 0.3 };
		const handle = resolvePullOutHandle({ click, keyframe, side: "hOut" });
		expect(handle.x).toBeGreaterThan(0);
		// y sign preserved: click is above the keyframe (smaller y), so handle.y < 0
		expect(handle.y).toBeLessThan(0);
	});

	it("length is clamped to maxLength (default 0.2)", () => {
		const click = { x: 5, y: 5 };
		const handle = resolvePullOutHandle({ click, keyframe, side: "hOut" });
		const len = Math.hypot(handle.x, handle.y);
		expect(len).toBeCloseTo(0.2, 5);
	});

	it("length is clamped to a custom maxLength", () => {
		const click = { x: 5, y: 5 };
		const handle = resolvePullOutHandle({
			click,
			keyframe,
			side: "hOut",
			maxLength: 0.5,
		});
		const len = Math.hypot(handle.x, handle.y);
		expect(len).toBeCloseTo(0.5, 5);
	});

	it("click at the keyframe produces a zero handle", () => {
		const click = { x: 0.5, y: 0.5 };
		const handle = resolvePullOutHandle({ click, keyframe, side: "hOut" });
		expect(handle).toEqual({ x: 0, y: 0 });
	});

	it("y-component sign is preserved (no flipping)", () => {
		// click above the keyframe (smaller y) => negative y in handle space
		const click = { x: 0.6, y: 0.2 };
		const handle = resolvePullOutHandle({ click, keyframe, side: "hOut" });
		expect(handle.y).toBeLessThan(0);
	});
});

describe("isPointOrHandleHit", () => {
	it("returns true for a point target", () => {
		expect(isPointOrHandleHit({ target: { type: "point", index: 1 } })).toBe(
			true,
		);
	});

	it("returns true for an hIn target", () => {
		expect(isPointOrHandleHit({ target: { type: "hIn", index: 1 } })).toBe(
			true,
		);
	});

	it("returns true for an hOut target", () => {
		expect(isPointOrHandleHit({ target: { type: "hOut", index: 1 } })).toBe(
			true,
		);
	});

	it("returns false for null target (empty area)", () => {
		expect(isPointOrHandleHit({ target: null })).toBe(false);
	});

	it("returns false for procedural target (procedural mode is a separate path)", () => {
		expect(isPointOrHandleHit({ target: { type: "procedural" } })).toBe(false);
	});

	it("returns false for pan target", () => {
		expect(isPointOrHandleHit({ target: { type: "pan" } })).toBe(false);
	});
});

describe("findNearestDragTarget", () => {
	const camera = computeCamera(400, 400);
	// Same skeleton as `createInitialState`: a 2-point ease-out curve.
	const points = [
		{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.4, y: 0 } },
		{ x: 1, y: 1, hIn: { x: -0.4, y: 0 }, hOut: { x: 0, y: 0 } },
	];
	const proceduralHandle = { x: 0.4, y: 0.6 };

	const nearest = (
		screen: { x: number; y: number },
		overrides: Partial<Parameters<typeof findNearestDragTarget>[0]> = {},
	) =>
		findNearestDragTarget({
			screen,
			points,
			proceduralHandle,
			camera,
			useCurvePoints: true,
			...overrides,
		});

	it("returns the nearest handle even when the click is arbitrarily far away (no distance cap, #145)", () => {
		const { target, distance } = nearest({ x: 100_000, y: 100_000 });
		expect(target).not.toBeNull();
		expect(target?.type === "hIn" || target?.type === "hOut").toBe(true);
		expect(distance).toBeGreaterThan(24);
	});

	it("selects the exact nearest element on an on-target click", () => {
		const hInDot = handleDotScreenPos(points[1], "hIn", camera);
		const { target } = nearest({ x: hInDot.x + 1, y: hInDot.y - 1 });
		expect(target).toEqual({ type: "hIn", index: 1 });
	});

	it("never returns an endpoint anchor as a point target", () => {
		// Click right on top of the (0,0) endpoint anchor: the nearest
		// grabbable element is its hOut handle dot, never a "point".
		const anchorScreen = {
			x: camera.x + points[0].x * camera.zoom,
			y: camera.y - points[0].y * camera.zoom,
		};
		const { target } = nearest(anchorScreen);
		expect(target).not.toBeNull();
		expect(target?.type).not.toBe("point");
	});

	it("selects an interior point when it is the closest element", () => {
		const threePoints = [
			points[0],
			{ x: 0.5, y: 0.2, hIn: { x: -0.1, y: 0 }, hOut: { x: 0.1, y: 0 } },
			points[1],
		];
		const midScreen = {
			x: camera.x + 0.5 * camera.zoom,
			y: camera.y - 0.2 * camera.zoom,
		};
		const { target } = nearest(midScreen, { points: threePoints });
		expect(target).toEqual({ type: "point", index: 1 });
	});

	it("procedural mode always returns the procedural handle regardless of distance", () => {
		const { target, distance } = nearest(
			{ x: -50_000, y: 50_000 },
			{ useCurvePoints: false },
		);
		expect(target).toEqual({ type: "procedural" });
		expect(distance).toBeGreaterThan(0);
	});
});
