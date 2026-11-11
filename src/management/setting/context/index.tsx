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
	mergeSettings,
	type Settings,
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
		patch: Partial<Settings>,
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
 * Save settings to settings.json file.
 */
async function saveSettingsToStorage(settings: Settings): Promise<void> {
	try {
		const jsonText = `${JSON.stringify(settings, null, 2)}\n`;
		await writeSettings(window, jsonText);
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
		(patch: Partial<Settings>, _options?: UpdateSettingsOptions) => {
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
