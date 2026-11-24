/**
 * Pure helpers for easing-widget drag gestures.
 *
 * Extracted from `Component.tsx` so the gesture math is unit-testable in
 * isolation. Each helper takes a small, explicit input and returns a small,
 * explicit output. No React, no DOM, no `state` access.
 */

import type { Camera, HandleAnchor } from "./camera";
import { handleDotScreenPos } from "./camera";

export type Vec2 = { x: number; y: number };

/**
 * 180° mirror of a vector around the origin.
 * Used for mirror-handle (Ctrl+Alt+drag): hOut = -hIn, hIn = -hOut.
 */
export function applyMirror(opposite: Vec2): Vec2 {
	return { x: -opposite.x, y: -opposite.y };
}

export type HandleMoveArgs = {
	hIn: Vec2;
	hOut: Vec2;
	side: "hIn" | "hOut";
	next: Vec2;
	altHeld: boolean;
	mirrorHeld: boolean;
};

export type HandleMoveResult = { hIn: Vec2; hOut: Vec2 };

/**
 * Resolve the linked/independent/mirror write for a handle drag.
 *
 * Behavior matrix (mirror wins over alt when both are held):
 * - default (neither):          write `next` to dragged side, mirror the opposite.
 * - altHeld (independent):      write `next` to dragged side, opposite unchanged.
 * - mirrorHeld:                 write `next` to dragged side, force opposite to 180° mirror.
 */
export function resolveHandleMove(args: HandleMoveArgs): HandleMoveResult {
	const { hIn, hOut, side, next, altHeld, mirrorHeld } = args;

	if (mirrorHeld) {
		return side === "hIn"
			? { hIn: next, hOut: applyMirror(next) }
			: { hIn: applyMirror(next), hOut: next };
	}

	if (altHeld) {
		return side === "hIn" ? { hIn: next, hOut } : { hIn, hOut: next };
	}

	// Default linked behavior: 180° mirror of `next` for the opposite side.
	// Pre-drag length preservation lives in `updateDrag`, not here.
	return side === "hIn"
		? { hIn: next, hOut: applyMirror(next) }
		: { hIn: applyMirror(next), hOut: next };
}

export type PullOutArgs = {
	click: Vec2;
	keyframe: Vec2;
	side: "hIn" | "hOut";
	maxLength?: number;
};

const DEFAULT_PULL_OUT_LENGTH = 0.2;

/**
 * Compute the handle vector for an Alt+click pull-out gesture.
 *
 * Direction = (click - keyframe), normalized to `maxLength` (default 0.2).
 * Caller is responsible for choosing `side` based on the click's x-position
 * relative to the keyframe. The y-component is preserved (no sign flip);
 * length is clamped, direction is preserved.
 */
export function resolvePullOutHandle(args: PullOutArgs): Vec2 {
	const { click, keyframe, maxLength = DEFAULT_PULL_OUT_LENGTH } = args;
	const dx = click.x - keyframe.x;
	const dy = click.y - keyframe.y;
	const len = Math.hypot(dx, dy);
	if (len === 0) return { x: 0, y: 0 };
	const scale = Math.min(maxLength, len) / len;
	return { x: dx * scale, y: dy * scale };
}

export type DragTarget =
	| { type: "point"; index: number }
	| { type: "hIn"; index: number }
	| { type: "hOut"; index: number }
	| { type: "procedural" }
	| { type: "pan" }
	| null;

export type HitTestArgs = {
	target: DragTarget;
	threshold?: number;
};

/**
 * Returns true if the closest drag target is a point or a handle.
 * The `threshold` parameter is accepted for future distance-based hit testing
 * but is currently unused — callers pass the `target` half of a
 * `findNearestDragTarget` result, which is already the nearest candidate.
 */
export function isPointOrHandleHit(args: HitTestArgs): boolean {
	const { target } = args;
	if (!target) return false;
	return (
		target.type === "point" || target.type === "hIn" || target.type === "hOut"
	);
}

const worldToScreenPoint = (point: Vec2, camera: Camera): Vec2 => ({
	x: camera.x + point.x * camera.zoom,
	y: camera.y - point.y * camera.zoom,
});

export type NearestDragTargetArgs = {
	/** Click position in canvas (screen) pixels. */
	screen: Vec2;
	/**
	 * Curve keyframe points; only consulted when `useCurvePoints` is true.
	 * Structurally compatible with the widget's `CurvePoint`.
	 */
	points: readonly HandleAnchor[];
	/** Procedural-mode handle position in world coordinates. */
	proceduralHandle: Vec2;
	camera: Camera;
	/**
	 * True for curve mode (hit-test interior points and handles);
	 * false for procedural modes (bounce/elastic), where the single handle
	 * dot is the only draggable target.
	 */
	useCurvePoints: boolean;
};

export type NearestDragTargetResult = {
	target: DragTarget;
	distance: number;
};

/**
 * Find the draggable element nearest to a canvas-space click position.
 *
 * There is intentionally NO distance cap: any plain left-click selects the
 * nearest handle/point and the drag snaps that element to the pointer
 * (issue #145). Panning is an explicit gesture only — middle-button drag or
 * Space+left-drag — and is handled by the caller before this lookup runs,
 * so this function never returns a "pan" target itself.
 *
 * Endpoint anchors (index 0 and the last point) are fixed and are never
 * returned as "point" targets; their inner handles remain grabbable.
 */
export function findNearestDragTarget(
	args: NearestDragTargetArgs,
): NearestDragTargetResult {
	const { screen, points, proceduralHandle, camera, useCurvePoints } = args;
	let closest: DragTarget = null;
	let minDistance = Number.POSITIVE_INFINITY;
	if (useCurvePoints) {
		points.forEach((point, index) => {
			const pointScreen = worldToScreenPoint(point, camera);
			if (index > 0 && index < points.length - 1) {
				const distance = Math.hypot(
					pointScreen.x - screen.x,
					pointScreen.y - screen.y,
				);
				if (distance < minDistance) {
					minDistance = distance;
					closest = { type: "point", index };
				}
			}
			if (index > 0) {
				const hIn = handleDotScreenPos(point, "hIn", camera);
				const distance = Math.hypot(hIn.x - screen.x, hIn.y - screen.y);
				if (distance < minDistance) {
					minDistance = distance;
					closest = { type: "hIn", index };
				}
			}
			if (index < points.length - 1) {
				const hOut = handleDotScreenPos(point, "hOut", camera);
				const distance = Math.hypot(hOut.x - screen.x, hOut.y - screen.y);
				if (distance < minDistance) {
					minDistance = distance;
					closest = { type: "hOut", index };
				}
			}
		});
	} else {
		// Procedural modes have a single draggable handle dot; it is always
		// the target regardless of click distance so the drag snaps the
		// handle to the pointer instead of panning.
		const handleScreen = worldToScreenPoint(proceduralHandle, camera);
		closest = { type: "procedural" };
		minDistance = Math.hypot(
			handleScreen.x - screen.x,
			handleScreen.y - screen.y,
		);
	}
	return { target: closest, distance: minDistance };
}
