import {
	CEP_INTERACTIVE_DIALOG_TIMEOUT_MS,
	cepEvalScriptAvailable,
	runCepEvalScript,
} from "@/management/storage/cep";

const escapeForExtendScriptSingleQuoted = (value: string): string =>
	value
		.replaceAll("\\", "\\\\")
		.replaceAll("'", "\\'")
		.replaceAll("\r", "\\r")
		.replaceAll("\n", "\\n")
		.replaceAll(" ", "\\u2028")
		.replaceAll(" ", "\\u2029");

const runInteractiveHostScript = async (
	win: Window,
	script: string,
): Promise<string> =>
	runCepEvalScript(win, script, {
		timeoutMs: CEP_INTERACTIVE_DIALOG_TIMEOUT_MS,
	});

const showHostAlert = async (win: Window, message: string): Promise<void> => {
	if (cepEvalScriptAvailable(win)) {
		const script = `alert('${escapeForExtendScriptSingleQuoted(message)}');`;
		await runInteractiveHostScript(win, script);
		return;
	}
	window.alert(message);
};

const runHostConfirm = async (
	win: Window,
	message: string,
): Promise<"yes" | "cancel"> => {
	if (cepEvalScriptAvailable(win)) {
		const script = `
			(function () {
				var ok = confirm('${escapeForExtendScriptSingleQuoted(message)}');
				return ok ? 'yes' : 'cancel';
			}());
		`;
		const result = (await runInteractiveHostScript(win, script)).trim();
		return result === "yes" ? "yes" : "cancel";
	}
	return window.confirm(message) ? "yes" : "cancel";
};

export const askHostPathChangeConfirm = async (
	win: Window,
	pathLabel: string,
	previousValue: string,
	nextValue: string,
	isSupportRoot: boolean,
): Promise<"yes" | "cancel"> =>
	runHostConfirm(
		win,
		[
			isSupportRoot ? "Change the Support Root?" : `Change ${pathLabel}?`,
			"",
			`Current: ${previousValue || "(not set)"}`,
			`New: ${nextValue || "(not set)"}`,
			"",
			"OK: Yes / Cancel: No",
		].join("\n"),
	);

/**
 * Yes = copy, No = path only, Cancel = abort (second confirm when user declines copy).
 */
export const askHostSupportRootCopyConfirm = async (
	win: Window,
): Promise<"yes" | "no" | "cancel"> => {
	const wantsCopy = await runHostConfirm(
		win,
		[
			"Copy settings and the ty-plus folder to the new Support Root?",
			"",
			"OK: Yes / Cancel: No",
		].join("\n"),
	);
	if (wantsCopy === "yes") {
		return "yes";
	}

	const withoutCopy = await runHostConfirm(
		win,
		[
			"Continue without copying?",
			"",
			"OK: Change path only / Cancel: Abort",
		].join("\n"),
	);
	if (withoutCopy === "yes") {
		return "no";
	}
	return "cancel";
};

export const askHostDeleteSourceConfirm = async (
	win: Window,
	sourceRoot: string,
): Promise<"yes" | "no"> => {
	const res = await runHostConfirm(
		win,
		[
			"Copy complete. Delete the source ty-plus and data folders?",
			sourceRoot,
			"",
			"OK: Yes / Cancel: No",
		].join("\n"),
	);
	return res === "yes" ? "yes" : "no";
};

export const showSupportRootCopyCompleteAlert = async (
	win: Window,
): Promise<void> => {
	await showHostAlert(
		win,
		"Ty Plus: Copy to the new Support Root is complete.",
	);
};

export const showSupportRootChangeCompleteAlert = async (
	win: Window,
	toSupportRoot: string,
): Promise<void> => {
	await showHostAlert(
		win,
		[
			"Ty Plus: Support Root change is complete.",
			"",
			`Current: ${toSupportRoot}`,
			"",
			"Restart After Effects to apply the change.",
		].join("\n"),
	);
};
