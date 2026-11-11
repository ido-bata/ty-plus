/**
 * Pure helpers for easing-widget drag gestures.
 *
 * Extracted from `Component.tsx` so the gesture math is unit-testable in
 * isolation. Each helper takes a small, explicit input and returns a small,
 * explicit output. No React, no DOM, no `state` access.
 */

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

type DragTargetLike =
	| { type: "point"; index: number }
	| { type: "hIn"; index: number }
	| { type: "hOut"; index: number }
	| { type: "procedural" }
	| { type: "pan" }
	| null;

export type HitTestArgs = {
	target: DragTargetLike;
	threshold?: number;
};

/**
 * Returns true if the closest drag target is a point or a handle.
 * The `threshold` parameter is accepted for future distance-based hit testing
 * but is currently unused — the target is already a closest-within-threshold
 * result from `findClosestWithDistance` in `Component.tsx`.
 */
export function isPointOrHandleHit(args: HitTestArgs): boolean {
	const { target } = args;
	if (!target) return false;
	return (
		target.type === "point" || target.type === "hIn" || target.type === "hOut"
	);
}

export type DragStartArgs = {
	button: number;
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	spacePressed: boolean;
	mode: "curve" | "bounce" | "elastic";
	hitTarget: DragTargetLike;
};

export type DragStartKind =
	| "pan"
	| "pullOutHandle"
	| "addOrDeletePoint"
	| "dragElement"
	| "none";

/**
 * Decide what drag gesture to start on canvas pointer-down.
 *
 * Gesture priority (matching the order in `Component.tsx:handlePointerDown`):
 * 1. middle-click OR Space+left         → "pan"
 * 2. plain left-click on empty area      → "pan" (user-facing expectation:
 *    left-drag pans the canvas; on Mac trackpads / single-button mice there
 *    is no reliable middle button, so plain left-drag is the only way to
 *    pan when no keyboard is available)
 * 3. Alt+left in curve mode              → "pullOutHandle"
 * 4. Ctrl/Cmd+left in curve mode         → "addOrDeletePoint"
 * 5. left-click on point/handle hit      → "dragElement"
 * 6. otherwise (e.g. middle, no targets) → "none"
 */
export function resolveDragStart(args: DragStartArgs): DragStartKind {
	const { button, altKey, ctrlKey, metaKey, spacePressed, mode, hitTarget } =
		args;

	if (button === 1 || (button === 0 && spacePressed)) return "pan";

	if (button !== 0) return "none";

	if (mode === "curve" && altKey && !ctrlKey && !metaKey) {
		return "pullOutHandle";
	}

	if (mode === "curve" && (ctrlKey || metaKey)) {
		return "addOrDeletePoint";
	}

	if (!hitTarget) return "pan";

	return "dragElement";
}
