/**
 * Settings Context for ty-plus
 * Manages application settings with file-backed persistence
 */

import {
	createContext,
	type JSX,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	coerceSettings,
	DEFAULT_SETTINGS,
	isRecord,
	mergeRecordDefaults,
	mergeSettings,
	type Settings,
	type SettingsPatch,
} from "@/management/setting/models/settings";
import { mergeSettingsPathsFromDisk } from "@/management/setting/persistence/merge-settings-paths";
import {
	readSettings,
	writeSettings,
} from "@/management/storage/workspace/store";

type UpdateSettingsOptions = {
	/** Skip paths.json / locator / relocation when hydrating from disk. */
	skipPathPersist?: boolean;
};

type SettingsContextValue = {
	settings: Settings;
	updateSettings: (
		patch: SettingsPatch,
		options?: UpdateSettingsOptions,
	) => void;
	refreshPathsFromDisk: () => Promise<void>;
	reloadSettingsFromDisk: () => Promise<void>;
	resetSettings: () => void;
	isLoaded: boolean;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Exported for storybook / test contexts that need to inject a controlled
 * `SettingsContext` (e.g. `InputsSection.stories.tsx` rendering the four
 * gesture states without round-tripping through disk). Production code
 * must keep using `useSettings()`.
 */
export { SettingsContext };

export function useSettings(): SettingsContextValue {
	const context = useContext(SettingsContext);
	if (!context) {
		throw new Error("useSettings must be used within SettingsProvider");
	}
	return context;
}

type SettingsProviderProps = {
	children: ReactNode;
};

/**
 * Load settings from settings.json file.
 */
async function loadSettingsFromStorage(): Promise<Settings> {
	try {
		const raw = await readSettings(window);
		if (!raw?.trim()) {
			return mergeSettingsPathsFromDisk(window, DEFAULT_SETTINGS, null, null);
		}
		const parsed = JSON.parse(raw) as unknown;
		const coerced = coerceSettings(parsed);
		return mergeSettingsPathsFromDisk(window, coerced, parsed, raw);
	} catch (error) {
		console.error("[Settings] Failed to load settings:", error);
		return mergeSettingsPathsFromDisk(window, DEFAULT_SETTINGS, null, null);
	}
}

/**
 * The key paths this layer owns — i.e. everything reachable from `Settings`.
 *
 * `settings/app.json` is shared: the workspace layer writes
 * `workspace.workspacePanels`, `workspace.snapshots` and `controlPanel` into
 * the same file. The settings layer must write back only its own keys, or it
 * will either delete that data (when it projects the file) or resurrect it
 * (when it re-serialises a stale in-memory copy after the workspace layer
 * cleared it). Ownership is therefore an explicit allowlist derived from the
 * `Settings` type, kept next to it so the two cannot drift silently.
 */
type OwnedKeySpec = true | { readonly [key: string]: OwnedKeySpec };

/**
 * The allowlist shape implied by `Settings`, so the compiler rejects a
 * missing entry. `true` means "this whole subtree is owned"; an object lists
 * the owned child keys. Optional fields are required here on purpose: they
 * must still be written when set, and listing them forces a conscious choice
 * when a new field is added.
 */
type OwnedSpecFor<T> = {
	readonly [K in keyof T]-?: NonNullable<T[K]> extends object
		? true | OwnedSpecFor<NonNullable<T[K]>>
		: true;
};

const SETTINGS_OWNED_KEYS = {
	version: true,
	core: {
		paths: {
			supportRoot: true,
			presetRoot: true,
			scriptRoot: true,
			pluginRoot: true,
		},
		presetScan: { timeoutMs: true, maxFiles: true },
	},
	ui: {
		language: true,
		updateChannel: true,
		theme: true,
		accentColor: true,
		textColor: true,
		widget: true,
		panel: true,
	},
	workspace: {
		grid: true,
		background: true,
	},
	gestures: true,
} satisfies OwnedSpecFor<Settings>;

/**
 * Projects a settings object onto the keys this layer owns, dropping values
 * that are absent so they are not written back as `null`.
 */
function pickOwnedSettings(value: unknown): Record<string, unknown> {
	if (!isRecord(value)) return {};
	const picked: Record<string, unknown> = {};
	for (const [key, spec] of Object.entries(SETTINGS_OWNED_KEYS)) {
		const current = value[key];
		if (current === undefined) continue;
		if (spec === true) {
			picked[key] = current;
			continue;
		}
		if (!isRecord(current)) continue;
		const nested: Record<string, unknown> = {};
		for (const [childKey, childSpec] of Object.entries(spec)) {
			const child = current[childKey];
			if (child === undefined) continue;
			if (childSpec === true) {
				nested[childKey] = child;
				continue;
			}
			if (!isRecord(child)) continue;
			const leaves: Record<string, unknown> = {};
			for (const leafKey of Object.keys(childSpec)) {
				const leaf = child[leafKey];
				if (leaf !== undefined) leaves[leafKey] = leaf;
			}
			nested[childKey] = leaves;
		}
		picked[key] = nested;
	}
	return picked;
}

/**
 * Computes the document to write: the on-disk contents with this layer's keys
 * replaced by `settings`, leaving every other key untouched.
 *
 * Pure so the ownership boundary can be tested directly.
 */
export function mergeOwnedSettingsIntoSettingsJson(
	onDisk: unknown,
	settings: Settings,
): Record<string, unknown> {
	const base = isRecord(onDisk) ? onDisk : {};
	const merged: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(pickOwnedSettings(settings))) {
		// On-disk is the *default*; the settings object is authoritative for
		// its own keys, so a channel change actually lands.
		merged[key] =
			isRecord(base[key]) && isRecord(value)
				? mergeRecordDefaults(base[key] as Record<string, unknown>, value)
				: value;
	}
	return merged;
}

/**
 * Writes the settings layer's keys while preserving everything the workspace
 * layer owns in the same file.
 *
 * This is a read-modify-write against the current file on purpose: a blind
 * overwrite from memory would restore workspace keys the workspace layer has
 * deleted since this panel loaded them.
 */
async function saveSettingsToStorage(settings: Settings): Promise<void> {
	try {
		const raw = await readSettings(window);
		const onDisk = raw?.trim() ? (JSON.parse(raw) as unknown) : {};
		const merged = mergeOwnedSettingsIntoSettingsJson(onDisk, settings);
		await writeSettings(window, `${JSON.stringify(merged, null, 2)}\n`);
	} catch (error) {
		console.error("[Settings] Failed to save settings:", error);
	}
}

/**
 * SettingsProvider manages settings state, persistence, and cross-panel sync
 */
export function SettingsProvider({
	children,
}: SettingsProviderProps): JSX.Element {
	const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		let cancelled = false;
		const TIMEOUT_MS = 12000;

		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => reject(new Error("Settings load timeout")), TIMEOUT_MS);
		});

		Promise.race([loadSettingsFromStorage(), timeoutPromise])
			.then((loaded) => {
				if (!cancelled) {
					setSettings(loaded);
					setIsLoaded(true);
				}
			})
			.catch((error) => {
				console.error("[Settings] Load failed, using defaults:", error);
				if (!cancelled) {
					setSettings(DEFAULT_SETTINGS);
					setIsLoaded(true);
				}
			});

		return () => {
			cancelled = true;
		};
	}, []);

	const updateSettings = useCallback(
		(patch: SettingsPatch, _options?: UpdateSettingsOptions) => {
			setSettings((prev) => {
				const updated = mergeSettings(prev, patch);
				if (!patch.core?.paths) {
					void saveSettingsToStorage(updated);
				}
				return updated;
			});
		},
		[],
	);

	const refreshPathsFromDisk = useCallback(async () => {
		const raw = await readSettings(window);
		const parsed = raw?.trim() ? (JSON.parse(raw) as unknown) : null;
		const base = parsed ? coerceSettings(parsed) : DEFAULT_SETTINGS;
		const merged = await mergeSettingsPathsFromDisk(window, base, parsed, raw);
		updateSettings(
			{
				core: {
					...merged.core,
					paths: merged.core.paths,
				},
			},
			{ skipPathPersist: true },
		);
	}, [updateSettings]);

	const resetSettings = useCallback(async () => {
		setSettings(DEFAULT_SETTINGS);
		await saveSettingsToStorage(DEFAULT_SETTINGS);
	}, []);

	const reloadSettingsFromDisk = useCallback(async () => {
		const loaded = await loadSettingsFromStorage();
		setSettings(loaded);
	}, []);

	const value = useMemo<SettingsContextValue>(
		() => ({
			settings,
			updateSettings,
			refreshPathsFromDisk,
			reloadSettingsFromDisk,
			resetSettings,
			isLoaded,
		}),
		[
			settings,
			updateSettings,
			refreshPathsFromDisk,
			reloadSettingsFromDisk,
			resetSettings,
			isLoaded,
		],
	);

	return (
		<SettingsContext.Provider value={value}>
			{children}
		</SettingsContext.Provider>
	);
}
