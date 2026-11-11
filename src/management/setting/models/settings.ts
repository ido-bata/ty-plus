/**
 * Settings model for management/setting
 */

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

const mergeRecordDefaults = <T extends Record<string, unknown>>(
	defaults: T,
	value: unknown,
): T => {
	if (!isRecord(value)) {
		return defaults;
	}
	const merged = { ...defaults } as Record<string, unknown>;
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
	return mergeRecordDefaults(DEFAULT_SETTINGS, v);
};

export const mergeSettings = (
	current: Settings,
	patch: Partial<Settings>,
): Settings => coerceSettings({ ...current, ...patch });
