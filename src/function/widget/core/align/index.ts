/**
 * Align widget operations — Wave 3 §4
 *
 * Public interface for align widget operations.
 * Re-exports action constants and script builders from the align implementation modules.
 *
 * management/workspace/events/handler.ts imports from HERE, not from implementation files directly.
 */
export {
	ACTIONS as ALIGN_ACTIONS,
	buildLayersScript as buildAlignLayersScript,
} from "./script";
export type { Action as AlignAction } from "./script.ext";

export {
	buildTimeScript as buildTimeAlignScript,
	TIME_ACTIONS as TIME_ALIGN_ACTIONS,
} from "./time-script";
