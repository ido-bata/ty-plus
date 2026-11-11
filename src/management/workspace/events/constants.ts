/**
 * Interaction tuning for workspace pointer/drag handling.
 * Gesture segmentation thresholds (used by `useAnchorGesture`) live with the
 * hook itself in `shared/component/interaction/use-anchor-gesture`.
 */

export const RESIZE_MARGIN = 12;
export const DRAG_HANDLE_MARGIN = 16;
export const DRAG_THRESHOLD = 5;

export const PREVIEW_TRANSITION =
	"left 0.12s ease,top 0.12s ease,width 0.12s ease,height 0.12s ease";

const PRESET_LAYOUT_ID_PREFIX = "preset:";
