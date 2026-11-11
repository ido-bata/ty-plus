/**
 * Resolves managed `…/ty-plus` on disk for persisting local data.
 *
 * The **support root** is the folder the user commits during onboarding (stored in
 * `settings.json` as `core.paths.supportRoot`). Defaults that equal the host app's
 * support folder are coincidental, not what defines the path.
 *
 * Writes are allowed only after onboarding has written `ty-plus-init.json` (see
 * `readInitializationState` + `isInitializationComplete`) so we never create
 * catalogs under ty-plus before the user has finished initialization.
 */

import {
	isInitializationComplete,
	readInitializationState,
	readSupportRootFromSettingsJson,
	resolveInitializationAppRoot,
} from "@/management/setting/onboarding/initialization";
import { resolveManagedRoot } from "@/management/storage/file";
import { readSettings } from "@/management/storage/workspace/store";

const directoryExistsSync = (win: Window, dirPath: string): boolean => {
	const trimmed = dirPath.trim();
	if (!trimmed) {
		return false;
	}
	try {
		const req = (
			win as Window & { cep_node?: { require?: (id: string) => unknown } }
		).cep_node?.require;
		if (typeof req !== "function") {
			return true;
		}
		const fs = req("fs") as { existsSync?: (p: string) => boolean } | undefined;
		return fs?.existsSync?.(trimmed) ?? true;
	} catch {
		return true;
	}
};

/**
 * Managed `ty-plus` directory for settings-backed paths, or `null` when onboarding
 * is unfinished, support root is unset, or the chosen folder does not exist yet.
 */
export type ResolveTyPlusManagedRootOptions = {
	/** When false, returns managed root even if the browse folder is missing (read-only callers). */
	requireExistingDirectory?: boolean;
};

export const resolveTyPlusManagedRootForPersistence = async (
	win: Window,
	options?: ResolveTyPlusManagedRootOptions,
): Promise<string | null> => {
	// `ty-plus-init.json` lives next to the host app install root (see OnboardingView /
	// panel-boot), not under `getSystemPath("support")` (user roaming). Using the wrong
	// directory here made onboarding look perpetually incomplete and blocked all reads.
	const initLocatorRoot = await resolveInitializationAppRoot(win);

	let locatorSupportRoot: string | null = null;
	if (initLocatorRoot) {
		const init = await readInitializationState(win, initLocatorRoot);
		const gate = isInitializationComplete(init);
		if (!gate.completed) {
			return null;
		}
		locatorSupportRoot = gate.supportRoot;
	}

	const raw = await readSettings(win);
	let supportRoot = readSupportRootFromSettingsJson(raw);
	if (!supportRoot?.trim() && locatorSupportRoot?.trim()) {
		supportRoot = locatorSupportRoot;
	}
	if (!supportRoot?.trim()) {
		return null;
	}
	const trimmed = supportRoot.trim();
	if (options?.requireExistingDirectory !== false) {
		if (!directoryExistsSync(win, trimmed)) {
			return null;
		}
	}
	return resolveManagedRoot(trimmed);
};
