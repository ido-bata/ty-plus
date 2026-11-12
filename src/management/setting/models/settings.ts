/**
 * Settings model for management/setting
 */

import {
	isReleaseChannel,
	type ReleaseChannel,
} from "@/management/online/update/channel";
import { buildReleaseChannel } from "@/management/online/update/current-version";

export type Settings = {
	version: 2;
	core: {
		paths: {
			supportRoot: string;
			presetRoot?: string;
			scriptRoot?: string;
			pluginRoot?: string;
		};
		presetScan?: {
			timeoutMs: number;
			maxFiles: number;
		};
	};
	ui: {
		language: "ja" | "en";
		updateChannel?: ReleaseChannel;
		theme: "system" | "dark" | "light" | "custom";
		accentColor?: string;
		textColor?: string;
		widget?: {
			backgroundColor: string;
			opacity: number;
		};
		panel?: {
			backgroundColor: string;
			opacity: number;
		};
	};
	workspace: {
		grid?: {
			cellSize: number;
			gap: number;
			radius: number;
		};
		background?: {
			type: "color" | "image" | "pattern";
			value: string;
		};
	};
	gestures: {
		anchorPoint: boolean;
		alignment: boolean;
	};
};

export const DEFAULT_SETTINGS: Settings = {
	version: 2,
	core: {
		paths: {
			supportRoot: "",
			presetRoot: "",
			scriptRoot: "",
			pluginRoot: "",
		},
		presetScan: {
			timeoutMs: 30000,
			maxFiles: 5000,
		},
	},
	ui: {
		language: "en",
		updateChannel: buildReleaseChannel,
		theme: "system",
		accentColor: "#5886ff",
		textColor: "#f0f0f0",
		widget: {
			backgroundColor: "#1a1a1a",
			opacity: 80,
		},
		panel: {
			backgroundColor: "#0f0f0f",
			opacity: 95,
		},
	},
	workspace: {
		grid: {
			cellSize: 48,
			gap: 4,
			radius: 2,
		},
	},
	gestures: {
		anchorPoint: true,
		alignment: true,
	},
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Fills `defaults` into `value`, **preserving keys the defaults do not know
 * about**.
 *
 * Preserving unknown keys is load-bearing, not defensive: `settings/app.json`
 * is shared with the workspace layer, which writes `workspace.workspacePanels`
 * and `workspace.snapshots` (group/preset placement and named layout
 * snapshots) into the same file. A projection that kept only the keys in
 * `DEFAULT_SETTINGS` would delete that user data on the next settings save —
 * including a save triggered by merely changing the update channel.
 */
const mergeRecordDefaults = <T extends Record<string, unknown>>(
	defaults: T,
	value: unknown,
): T => {
	if (!isRecord(value)) {
		return defaults;
	}
	const merged: Record<string, unknown> = { ...value };
	for (const [key, defaultValue] of Object.entries(defaults)) {
		const incomingValue = value[key];
		merged[key] =
			isRecord(defaultValue) && isRecord(incomingValue)
				? mergeRecordDefaults(defaultValue, incomingValue)
				: (incomingValue ?? defaultValue);
	}
	return merged as T;
};

export const coerceSettings = (v: unknown): Settings => {
	if (!isRecord(v)) {
		return DEFAULT_SETTINGS;
	}
	const merged = mergeRecordDefaults(DEFAULT_SETTINGS, v);
	return isReleaseChannel(merged.ui.updateChannel)
		? merged
		: {
				...merged,
				ui: { ...merged.ui, updateChannel: buildReleaseChannel },
			};
};

/**
 * A patch may update a single nested field without restating its siblings.
 * `Partial<Settings>` is shallow, which forced every caller to spread
 * `settings.ui` by hand; making the group levels recursively optional lets
 * the merge do what the type already promised.
 */
export type SettingsPatch = {
	[K in keyof Settings]?: Settings[K] extends object
		? Partial<Settings[K]>
		: Settings[K];
};

/**
 * Applies a patch without dropping sibling fields inside a group.
 *
 * A shallow `{ ...current, ...patch }` replaces a whole group, so a caller
 * that patches one `ui` field would silently reset the others (theme,
 * language, widget colours). `undefined` still means "leave unchanged";
 * explicit resets go through `resetSettings`/`DEFAULT_SETTINGS`.
 */
export const mergeSettings = (
	current: Settings,
	patch: SettingsPatch,
): Settings => {
	const merged: Record<string, unknown> = { ...current };
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) continue;
		const existing = (current as Record<string, unknown>)[key];
		// Merge both directions: `mergeRecordDefaults(existing, value)` would
		// iterate only `existing` and drop a key the patch introduces (e.g.
		// `workspace.background`, which has no default).
		merged[key] =
			isRecord(existing) && isRecord(value)
				? mergeRecordDefaults(value, mergeRecordDefaults(existing, value))
				: value;
	}
	return coerceSettings(merged);
};
