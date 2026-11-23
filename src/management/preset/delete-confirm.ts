/**
 * Host (ExtendScript) confirm dialog for destructive preset/group operations.
 */

import { i18n } from "@/management/i18n/index";
import {
	CEP_INTERACTIVE_DIALOG_TIMEOUT_MS,
	cepEvalScriptAvailable,
	runCepEvalScript,
} from "@/management/storage/cep";

const runInteractiveHostScript = (
	win: Window,
	script: string,
): Promise<string> =>
	runCepEvalScript(win, script, {
		timeoutMs: CEP_INTERACTIVE_DIALOG_TIMEOUT_MS,
	});

/**
 * Shows a native host confirm dialog (ExtendScript `confirm` in AE, fallback to `window.confirm`).
 * Returns true if the user confirmed the deletion.
 */
export const askHostDeleteConfirm = async (
	win: Window,
	presetTitle: string,
	isGroup: boolean,
): Promise<boolean> => {
	const title = presetTitle || i18n.t("presets:deleteConfirm.untitled");
	const message = i18n.t(
		isGroup ? "presets:deleteConfirm.group" : "presets:deleteConfirm.preset",
		{ title },
	);
	if (cepEvalScriptAvailable(win)) {
		const script = `(function () { return confirm(${JSON.stringify(message)}) ? 'yes' : 'no'; }());`;
		const result = (await runInteractiveHostScript(win, script)).trim();
		return result === "yes";
	}
	return win.confirm(message);
};
