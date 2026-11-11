/**
 * Anchor point operations.
 * ExtendScript strings live in `anchor-point-script.ext.ts` (see `tsconfig.extendscript.json`).
 */

export type { AnchorPosition } from "./script.ext";
export {
	ANCHOR_KEYS,
	buildAnchorScript,
	isValidAnchorPosition,
} from "./script.ext";
