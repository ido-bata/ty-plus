/**
 * Pure helpers for the loop widget's motion preview.
 */

// The marker (square + halo) extends ~9px around its anchor, so the time
// axis is inset: at t=0 or t=1 the whole marker must stay inside the
// canvas instead of being clipped by the edge.
const EDGE_INSET = 10;

/** Normalized time -> pixel x, inset so edge markers are not clipped. */
export const motionPreviewX = (t: number, width: number): number => {
	const inset = Math.min(EDGE_INSET, width / 2);
	const span = Math.max(1, width - inset * 2);
	return inset + t * span;
};
