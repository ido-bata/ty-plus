/**
 * Workspace UI settings file (`settings/ui.json`).
 * Domain parse/serialize from setting models; bytes via json-file-store only.
 */

import {
	parseUiSettings,
	serializeUiSettings,
} from "@/management/setting/models/workspace-ui-settings";
import { resolveSupportRootFromWindow } from "@/management/setting/persistence/cep-support-root";
import { resolveTyPlusManagedRootForPersistence } from "@/management/setting/persistence/ty-plus-managed-root";
import {
	resolveManagedRoot,
	resolveSettingsUiJsonPath,
} from "@/management/storage/file";
import {
	parseJsonObject,
	readJsonFileText,
	stringifyJson,
} from "@/management/storage/read/json-file";
import { writeJsonFileText } from "@/management/storage/write/json-file";

const resolveSettingsManagedRoot = async (
	win: Window,
	supportRoot?: string,
): Promise<string | null> => {
	const explicit = supportRoot?.trim();
	if (explicit) {
		return resolveManagedRoot(explicit.replace(/[\\/]+$/, ""));
	}
	const fromSettings = await resolveTyPlusManagedRootForPersistence(win, {
		requireExistingDirectory: false,
	});
	if (fromSettings) return fromSettings;
	const hostSupportRoot = resolveSupportRootFromWindow(win);
	return hostSupportRoot ? resolveManagedRoot(hostSupportRoot) : null;
};

export const readUiSettings = async (
	win: Window,
	supportRoot?: string,
): Promise<ReturnType<typeof parseUiSettings>> => {
	const root = await resolveSettingsManagedRoot(win, supportRoot);
	if (!root) return parseUiSettings(null);

	const path = resolveSettingsUiJsonPath(root);
	const raw = await readJsonFileText(win, path);
	if (raw === null) return parseUiSettings(null);

	const parsed = parseJsonObject(raw);
	return parseUiSettings(parsed ?? null);
};

export const writeUiSettings = async (
	win: Window,
	settings: Parameters<typeof serializeUiSettings>[0],
	supportRoot?: string,
): Promise<void> => {
	const root = await resolveSettingsManagedRoot(win, supportRoot);
	if (!root) return;

	const path = resolveSettingsUiJsonPath(root);
	const serialized = serializeUiSettings(settings);
	await writeJsonFileText(win, path, stringifyJson(serialized));
};

export const ensureUiSettingsFile = async (
	win: Window,
	supportRoot?: string,
): Promise<void> => {
	const root = await resolveSettingsManagedRoot(win, supportRoot);
	if (!root) return;

	const path = resolveSettingsUiJsonPath(root);
	const existing = await readJsonFileText(win, path);
	if (existing !== null) return;

	await writeJsonFileText(
		win,
		path,
		stringifyJson({
			version: 1,
			showGridOverlay: true,
			showPresetLabels: true,
			selectedFont: "",
		}),
	);
};
