/**
 * Anchor-point widget operations — Wave 3 §4
 *
 * Public interface for anchor-point widget operations.
 * Re-exports action constants and the script builder from the anchor-point/script module.
 *
 * management/workspace/events/handler.ts imports from HERE, not from anchor-point/script.ts directly.
 */

export { runAnchorScript } from "./run";
export type { AnchorPosition } from "./script";
export {
	ANCHOR_KEYS,
	buildAnchorScript,
	isValidAnchorPosition,
} from "./script";
