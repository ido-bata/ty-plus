/**
 * Timeline align/distribute. Equivalent to archive `alignLayers` time series.
 * `target === "comp"` only applies align-start / align-end / align-duration to comp duration.
 * distribute-start / distribute-end use the same logic regardless of target (archive-compliant).
 *
 * ExtendScript strings live in `time-align-script.ext.ts` (see `tsconfig.extendscript.json`).
 */

import type { TimeAction } from "./time-script.ext";
import { buildScriptFromTemplate, TIME_ACTIONS } from "./time-script.ext";

export { TIME_ACTIONS } from "./time-script.ext";

const isAction = (s: string): s is TimeAction =>
	(TIME_ACTIONS as readonly string[]).includes(s);

export const buildTimeScript = (
	action: string,
	target: string,
): string | null => {
	if (!isAction(action)) return null;
	const compTime = target === "comp";
	return buildScriptFromTemplate(action, compTime);
};
