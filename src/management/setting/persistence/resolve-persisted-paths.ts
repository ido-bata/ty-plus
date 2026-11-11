import {
	isInitializationComplete,
	readInitializationState,
	readSupportRootFromSettingsJson,
	resolveInitializationAppRoot,
} from "@/management/setting/onboarding/initialization";
import { readSettingsPathsJson } from "@/management/setting/persistence/settings-json-files";
import { readSettings } from "@/management/storage/workspace/store";

/**
 * Reads `ty-plus-init.json` and returns the persisted browse support root.
 */
export const readLocatorSupportBrowseRoot = async (
	win: Window,
): Promise<string | null> => {
	const appRoot = await resolveInitializationAppRoot(win);
	if (!appRoot) {
		return null;
	}
	const init = await readInitializationState(win, appRoot);
	const gate = isInitializationComplete(init);
	if (!gate.completed || !gate.supportRoot?.trim()) {
		return null;
	}
	return gate.supportRoot.trim();
};

/**
 * Best-effort browse support root: settings.json, then ty-plus-init.json.
 */
export const resolvePersistedSupportBrowseRoot = async (
	win: Window,
	settingsRaw?: string | null,
): Promise<string | null> => {
	const raw = settingsRaw !== undefined ? settingsRaw : await readSettings(win);
	const fromSettings = readSupportRootFromSettingsJson(raw);
	if (fromSettings?.trim()) {
		return fromSettings.trim();
	}
	return readLocatorSupportBrowseRoot(win);
};

/**
 * Reads `settings/paths.json` under the managed tree.
 * Caller is responsible for confirming persistence is initialized; this reads
 * whatever the persistence API can resolve from `ty-plus-init.json`.
 */
export const readPersistedPathsDocument = async (
	win: Window,
	_browseRoot?: string | null,
): Promise<Record<string, unknown> | null> => readSettingsPathsJson(win);
