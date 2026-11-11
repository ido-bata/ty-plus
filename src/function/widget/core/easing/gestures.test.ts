import { describe, expect, it } from "vitest";
import {
	applyMirror,
	isPointOrHandleHit,
	resolveDragStart,
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

describe("resolveDragStart", () => {
	const baseArgs = {
		button: 0,
		altKey: false,
		ctrlKey: false,
		metaKey: false,
		spacePressed: false,
		mode: "curve" as const,
		hitTarget: null as null,
	};

	it("middle-click starts a pan regardless of mode or target", () => {
		expect(
			resolveDragStart({
				...baseArgs,
				button: 1,
				hitTarget: { type: "point", index: 0 },
			}),
		).toBe("pan");
		expect(resolveDragStart({ ...baseArgs, button: 1, mode: "bounce" })).toBe(
			"pan",
		);
	});

	it("Space+left starts a pan regardless of target", () => {
		expect(
			resolveDragStart({
				...baseArgs,
				spacePressed: true,
				hitTarget: { type: "hIn", index: 1 },
			}),
		).toBe("pan");
	});

	it("plain left-click on empty area starts a pan (Mac trackpad friendly)", () => {
		expect(resolveDragStart({ ...baseArgs, hitTarget: null })).toBe("pan");
	});

	it("plain left-click on a hit point/handle drags that element", () => {
		expect(
			resolveDragStart({
				...baseArgs,
				hitTarget: { type: "point", index: 2 },
			}),
		).toBe("dragElement");
		expect(
			resolveDragStart({ ...baseArgs, hitTarget: { type: "hIn", index: 1 } }),
		).toBe("dragElement");
		expect(
			resolveDragStart({ ...baseArgs, hitTarget: { type: "hOut", index: 1 } }),
		).toBe("dragElement");
	});

	it("Alt+left in curve mode starts pullOutHandle even when no hit", () => {
		expect(
			resolveDragStart({ ...baseArgs, altKey: true, hitTarget: null }),
		).toBe("pullOutHandle");
	});

	it("Ctrl+left in curve mode starts addOrDeletePoint", () => {
		expect(
			resolveDragStart({
				...baseArgs,
				ctrlKey: true,
				hitTarget: { type: "point", index: 1 },
			}),
		).toBe("addOrDeletePoint");
	});

	it("Cmd+left in curve mode starts addOrDeletePoint", () => {
		expect(
			resolveDragStart({
				...baseArgs,
				metaKey: true,
				hitTarget: null,
			}),
		).toBe("addOrDeletePoint");
	});

	it("non-left, non-middle button (e.g. right-click) returns none", () => {
		expect(resolveDragStart({ ...baseArgs, button: 2 })).toBe("none");
		expect(resolveDragStart({ ...baseArgs, button: 3 })).toBe("none");
	});

	it("Alt+Ctrl+left in curve mode still starts addOrDeletePoint (Ctrl wins over Alt)", () => {
		expect(
			resolveDragStart({
				...baseArgs,
				altKey: true,
				ctrlKey: true,
				hitTarget: { type: "point", index: 1 },
			}),
		).toBe("addOrDeletePoint");
	});
});
