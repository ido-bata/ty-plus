/**
 * management/setting/workspace-ui-settings.ts
 * Workspace UI display settings domain type.
 */

export type DisplaySettings = {
	version: 1;
	showGridOverlay: boolean;
	showPresetLabels: boolean;
	selectedFont: string;
};

export const DEFAULT_UI_SETTINGS: DisplaySettings = {
	version: 1,
	showGridOverlay: true,
	showPresetLabels: true,
	selectedFont: "",
};

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

export const parseUiSettings = (raw: unknown): DisplaySettings => {
	if (!isObject(raw)) return DEFAULT_UI_SETTINGS;

	const version = raw.version;
	if (version !== 1) return DEFAULT_UI_SETTINGS;

	const showGridOverlay =
		typeof raw.showGridOverlay === "boolean"
			? raw.showGridOverlay
			: DEFAULT_UI_SETTINGS.showGridOverlay;

	const showPresetLabels =
		typeof raw.showPresetLabels === "boolean"
			? raw.showPresetLabels
			: DEFAULT_UI_SETTINGS.showPresetLabels;

	const selectedFont =
		typeof raw.selectedFont === "string"
			? raw.selectedFont
			: DEFAULT_UI_SETTINGS.selectedFont;

	return {
		version: 1,
		showGridOverlay,
		showPresetLabels,
		selectedFont,
	};
};

export const serializeUiSettings = (
	settings: DisplaySettings,
): Record<string, unknown> => ({
	version: settings.version,
	showGridOverlay: settings.showGridOverlay,
	showPresetLabels: settings.showPresetLabels,
	selectedFont: settings.selectedFont,
});
