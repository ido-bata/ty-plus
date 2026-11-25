/**
 * Native host dialog dismissal for E2E runs.
 *
 * Some destructive preset operations route through a synchronous ExtendScript
 * `confirm()` (see src/management/preset/delete-confirm.ts). While that modal
 * is up, every CDP `Runtime.evaluate` against the panel times out, which
 * turns the rest of a suite into BLOCKED. The dialog is a plain macOS/Windows
 * app modal, so the runner dismisses it through OS-level UI automation —
 * CDP cannot reach it.
 *
 * Only macOS is implemented (System Events). On other platforms the helper
 * reports `dismissed: false` and callers keep the documented manual step.
 */
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { E2EContext } from "./ctx";

const execFileAsync = promisify(execFile);

/** Buttons ExtendScript `confirm()` can show, localized (EN + JA). */
const CANCEL_BUTTONS = ["No", "Cancel", "キャンセル", "いいえ"];
const OK_BUTTONS = ["Yes", "OK", "はい"];

const osascript = async (source: string): Promise<string> => {
	const { stdout } = await execFileAsync("osascript", ["-e", source], {
		timeout: 15_000,
	});
	return stdout.trim();
};

/**
 * Resolve the `.app` bundle that hosts the live panels from the real
 * managed root (`<supportRoot>/ty-plus`, possibly nested one level deeper).
 */
const aeAppPathForManagedRoot = async (
	realManagedRoot: string,
): Promise<string | undefined> => {
	let dir = path.dirname(realManagedRoot);
	for (let depth = 0; depth < 3; depth++) {
		try {
			const entries = await readdir(dir);
			const app = entries.find(
				(name) => name.endsWith(".app") && /^Adobe After Effects \d/.test(name),
			);
			if (app) return path.join(dir, app);
		} catch {
			// keep walking up
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return undefined;
};

const aePidForApp = async (appPath: string): Promise<number | undefined> => {
	try {
		// Match the main executable only — helper processes (crashpad_handler,
		// dynamiclinkmanager) also live under the .app bundle and would be
		// returned first by a bare app-path match.
		const { stdout } = await execFileAsync(
			"pgrep",
			["-f", `${appPath}/Contents/MacOS/After Effects`],
			{ timeout: 10_000 },
		);
		const pid = Number.parseInt(stdout.trim().split("\n")[0] ?? "", 10);
		return Number.isFinite(pid) ? pid : undefined;
	} catch {
		return undefined;
	}
};

const clickDialogButton = async (
	pid: number,
	buttonNames: string[],
): Promise<string | undefined> => {
	const names = buttonNames.map((n) => `"${n}"`).join(", ");
	const source = `
		tell application "System Events"
			tell (first process whose unix id is ${pid})
				repeat with w in windows
					repeat with b in buttons of w
						set bn to name of b
						if bn is in {${names}} then
							click b
							return bn
						end if
					end repeat
					try
						repeat with s in sheets of w
							repeat with b in buttons of s
								set bn to name of b
								if bn is in {${names}} then
									click b
									return bn
								end if
							end repeat
						end repeat
					end try
				end repeat
			end tell
		end tell
		return ""
	`;
	const clicked = await osascript(source);
	return clicked === "" ? undefined : clicked;
};

export type HostDialogDismissal = {
	dismissed: boolean;
	button?: string;
	reason?: string;
};

/**
 * Dismiss a pending native host `confirm()` dialog on the AE instance that
 * hosts the E2E panels. `accept: false` answers Cancel/No (non-destructive
 * gate stays intact); `accept: true` answers OK/Yes.
 */
export const dismissHostConfirmDialog = async (
	ctx: E2EContext,
	{ accept = false }: { accept?: boolean } = {},
): Promise<HostDialogDismissal> => {
	if (process.platform !== "darwin") {
		return {
			dismissed: false,
			reason: "native dialog dismissal is macOS-only",
		};
	}
	const realRoot = ctx.options.realManagedRoot;
	if (!realRoot) {
		return { dismissed: false, reason: "realManagedRoot not configured" };
	}
	const appPath = await aeAppPathForManagedRoot(realRoot);
	if (!appPath) {
		return { dismissed: false, reason: `no AE .app found near ${realRoot}` };
	}
	const pid = await aePidForApp(appPath);
	if (!pid) {
		return { dismissed: false, reason: `no running process for ${appPath}` };
	}
	// The confirm() modal can take several seconds to appear after the
	// destructive action; poll for it instead of checking once.
	const deadline = Date.now() + 20_000;
	const buttonNames = accept ? OK_BUTTONS : CANCEL_BUTTONS;
	let lastError = "no matching dialog button found";
	while (Date.now() < deadline) {
		const button = await clickDialogButton(pid, buttonNames).catch(
			(error: unknown) => {
				lastError = String(error);
				return undefined;
			},
		);
		if (button) return { dismissed: true, button };
		await new Promise((resolve) => setTimeout(resolve, 1_000));
	}
	return { dismissed: false, reason: lastError };
};
