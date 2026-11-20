/**
 * Pure curve operations used by the easing editor.
 *
 * Extracted from Component.tsx so the math can be unit-tested without
 * rendering the React tree. Keep this file dependency-free.
 */

type Mode = "curve" | "bounce" | "elastic" | "loop";
type Point = { x: number; y: number };
type CurvePoint = { x: number; y: number; hIn: Point; hOut: Point };

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

// Mirror a value across zero without producing -0. AE/JSON consumers compare
// handle coordinates with toEqual-style equality, and `-0 !== 0` even though
// `-0 === 0`, so a handle that should be 0 must stay 0 (not -0).
const negate = (value: number): number => (value === 0 ? 0 : -value);

/**
 * Mirrors a list of curve points about the line y=x in the unit square.
 *
 * The easing editor's "reverse" action runs this on the active curve
 * regardless of the source mode: when the user is editing a procedural
 * (bounce/elastic) curve, the procedural points are converted to a curve
 * and then reversed in one step. Always reversing (instead of only when
 * the user is already in curve mode) fixes the case where clicking
 * "reverse" on a bounce/elastic mode would silently clone the points
 * instead of mirroring them.
 *
 * Handle invariants:
 *   - The point order flips, so each point's incoming handle (hIn) was
 *     previously the outgoing handle (hOut) of the predecessor in the
 *     original direction of travel.
 *   - Travelling in the opposite direction flips the handle sign along
 *     both axes, so the outgoing handle of the reversed point is the
 *     negation of the original incoming handle, and vice versa.
 */
export const reverseCurvePoints = (points: CurvePoint[]): CurvePoint[] =>
	points
		.slice()
		.reverse()
		.map((point) => ({
			x: clamp(1 - point.x, 0, 1),
			y: 1 - point.y,
			hIn: { x: negate(point.hOut.x), y: negate(point.hOut.y) },
			hOut: { x: negate(point.hIn.x), y: negate(point.hIn.y) },
		}));

// Deep-clone a list of curve points so the editor can promote a procedural
// (bounce/elastic) preview to a curve without mutating the caller's list.
// The easing editor's `clonePoints` already does this, but exposing a
// dependency-free version here keeps `curve-ops.ts` testable in isolation.
export const cloneCurvePoints = (points: CurvePoint[]): CurvePoint[] =>
	points.map((point) => ({
		x: point.x,
		y: point.y,
		hIn: { x: point.hIn.x, y: point.hIn.y },
		hOut: { x: point.hOut.x, y: point.hOut.y },
	}));

/**
 * Decide what the easing editor's "reverse" button should produce.
 *
 *   bounce/elastic → curve : just promote the procedural preview to an
 *                            editable curve. The user's intent here is a
 *                            CONVERSION, not a geometric flip — reversing
 *                            a bounce/elastic preview would silently
 *                            mirror the bounce peaks / elastic wobble,
 *                            which is jarring. Returns the procedural
 *                            points as-is, but in curve mode.
 *   curve → curve          : actually mirror the curve (handles
 *                            included). `reverseCurvePoints` is its own
 *                            inverse, so clicking reverse on an
 *                            already-reversed curve returns to the
 *                            original — this is what makes the action
 *                            useful as a toggle.
 *   loop → curve           : loop mode is conceptually a curve whose
 *                            shape is replicated by the host. Reverse
 *                            mirrors the underlying single-cycle curve
 *                            and keeps the loop intent intact (the next
 *                            apply re-enters loop mode and replicates
 *                            the reversed shape).
 *
 * The `proceduralPointsForCurve` argument is the list to use when
 * promoting a procedural mode to a curve (typically the result of
 * `buildCurvePointsFromProcedural`). The component passes this in so
 * the editor's specific procedural→curve mapping stays in Component.tsx
 * and this function stays a pure decision.
 */
export const decideReverseAction = (
	currentMode: Mode,
	currentPoints: CurvePoint[],
	proceduralPointsForCurve: CurvePoint[],
): { mode: "curve"; points: CurvePoint[] } => {
	if (currentMode === "curve" || currentMode === "loop") {
		return { mode: "curve", points: reverseCurvePoints(currentPoints) };
	}
	return {
		mode: "curve",
		points: cloneCurvePoints(proceduralPointsForCurve),
	};
};
