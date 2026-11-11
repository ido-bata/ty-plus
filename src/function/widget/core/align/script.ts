/**
 * Layer align/distribute operations.
 * ExtendScript strings live in `align-script.ext.ts` (see `tsconfig.extendscript.json`).
 */

import type { Action } from "./script.ext";
import { ACTIONS, buildScriptFromTemplate } from "./script.ext";

export { ACTIONS } from "./script.ext";

const isAction = (value: string): value is Action =>
	(ACTIONS as readonly string[]).includes(value);

/** Align target — owned by function layer, no management import needed. */
type TargetId = "selection" | "comp" | "key-object" | "time";

const isTargetId = (v: string): v is TargetId =>
	v === "selection" || v === "comp" || v === "key-object" || v === "time";

export const buildLayersScript = (
	action: string,
	target: TargetId,
): string | null => {
	if (!isAction(action)) return null;
	if (!isTargetId(target)) return null;
	const compTarget = target === "comp";
	const keyTarget = target === "key-object";
	return buildScriptFromTemplate(action, compTarget, keyTarget);
};
