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
	useRef,
	useState,
} from "react";
import { resolvePanelSurfaceId } from "@/management/ae/cep/entry/id";
import { createCepSurfaceTransport } from "@/management/ae/cep/transport";
import { i18n } from "@/management/i18n/index";
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
import { publishShellMessage } from "@/management/workspace/messaging/publish-shell-message";
import { SHELL_CHANNELS } from "@/management/workspace/surface/contract";

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
	/**
	 * Set when the last settings write to disk failed (e.g. read-only
	 * directory). Cleared by the next successful write. Surfaced in the
	 * settings dialog so a silent persistence failure cannot look like a
	 * successful save (Device Gate D-12).
	 */
	saveError: string | null;
	/**
	 * Record a persistence-side failure that did not come from
	 * `persistSettingsNow` — e.g. the async theme.css projection behind a
	 * Style/Grid edit. Surfaces it through the same `saveError` banner and
	 * `saveNotice` broadcast so the failure cannot pass silently (#94
	 * review).
	 */
	reportSaveError: (message: string) => void;
	/**
	 * Wait for in-flight settings writes, then persist the current settings
	 * once more and resolve with that write's outcome. The settings dialog's
	 * Save action uses this so the dialog only closes after persistence has
	 * actually settled (#96).
	 */
	persistSettingsNow: () => Promise<boolean>;
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
		throw new Error("useSettings must be used within SettingsProvider"); // i18n-exempt: internal diagnostic — not rendered as UI copy
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

/*
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
/**
 * The allowlist shape implied by `Settings`, so the compiler rejects a
 * missing entry. `true` means "this whole subtree is owned"; an object lists
 * the owned child keys. Optional fields are required here on purpose: they
 * must still be written when set, and listing them forces a conscious choice
 * when a new field is added.
 */
type OwnedSpecFor<T> = {
	// i18n-exempt: TypeScript mapped-type syntax, not UI copy.
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
const SETTINGS_SAVE_FAILED_MESSAGE_KEY = "settings:saveFailed";

/**
 * Best-effort broadcast of a settings write failure on the shell bus so the
 * persistent workspace panel can show a toast even after the settings dialog
 * (the only surface rendering `saveError`) has closed (#96).
 */
function publishSettingsSaveFailure(win: Window, message: string): void {
	try {
		const dialogSurfaceId = win.__TY_PLUS_DIALOG_SURFACE_ID__;
		const sourceSurfaceId =
			typeof dialogSurfaceId === "string" && dialogSurfaceId.trim().length > 0
				? dialogSurfaceId.trim()
				: resolvePanelSurfaceId();
		const transport = createCepSurfaceTransport(win);
		void publishShellMessage(transport, {
			channel: SHELL_CHANNELS.settings,
			kind: "publish",
			sourceSurfaceId,
			payload: {
				kind: "saveNotice",
				sourceSurfaceId,
				at: new Date().toISOString(),
				ok: false,
				message,
			},
		}).catch(() => {});
	} catch {
		/* notification is best-effort; the in-surface banner still applies */
	}
}

async function saveSettingsToStorage(settings: Settings): Promise<boolean> {
	try {
		// ADR-0006: settings/app.json is shared with the workspace layer
		// (panel persists, inter-panel moves, backup restore), which writes
		// under the managed-root persistence lock. This read→merge→write
		// must hold the same lock or a concurrent workspace write can be
		// lost. The per-window queue above only serializes THIS context.
		const { withManagedRootPersistenceLock } = await import(
			"@/management/storage/lock/persistence-lock"
		);
		return await withManagedRootPersistenceLock(window, async () => {
			const raw = await readSettings(window);
			const onDisk = raw?.trim() ? (JSON.parse(raw) as unknown) : {};
			const merged = mergeOwnedSettingsIntoSettingsJson(onDisk, settings);
			await writeSettings(window, `${JSON.stringify(merged, null, 2)}\n`);
			return true;
		});
	} catch (error) {
		console.error("[Settings] Failed to save settings:", error);
		return false;
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
	const [saveError, setSaveError] = useState<string | null>(null);
	const settingsRef = useRef(settings);
	const saveQueueRef = useRef<Promise<void> | null>(null);

	useEffect(() => {
		settingsRef.current = settings;
	}, [settings]);

	/**
	 * Settings writes are read-modify-write against `settings/app.json`, so
	 * they must be serialized: concurrent commits would otherwise interleave
	 * read/write and lose each other's keys.
	 */
	const enqueueSettingsSave = useCallback(
		(snapshot: Settings): Promise<boolean> => {
			const run = (saveQueueRef.current ?? Promise.resolve()).then(() =>
				saveSettingsToStorage(snapshot),
			);
			saveQueueRef.current = run.then(
				() => undefined,
				() => undefined,
			);
			return run;
		},
		[],
	);

	/**
	 * Run a settings write with the shared outcome handling: `saveError` is
	 * set/cleared and a `saveNotice` is broadcast on failure so the failure
	 * stays visible even if the settings dialog has already closed (#96).
	 */
	const runSettingsSave = useCallback(
		(snapshot: Settings): Promise<boolean> =>
			enqueueSettingsSave(snapshot).then((ok) => {
				const message = i18n.t(SETTINGS_SAVE_FAILED_MESSAGE_KEY);
				setSaveError(ok ? null : message);
				if (!ok) {
					publishSettingsSaveFailure(window, message);
				}
				return ok;
			}),
		[enqueueSettingsSave],
	);

	const reportSaveError = useCallback((message: string) => {
		setSaveError(message);
		publishSettingsSaveFailure(window, message);
	}, []);

	const persistSettingsNow = useCallback(
		(): Promise<boolean> => runSettingsSave(settingsRef.current),
		[runSettingsSave],
	);

	useEffect(() => {
		let cancelled = false;
		const TIMEOUT_MS = 12000;

		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => reject(new Error("Settings load timeout")), TIMEOUT_MS);
		});

		Promise.race([loadSettingsFromStorage(), timeoutPromise])
			.then((loaded) => {
				if (!cancelled) {
					settingsRef.current = loaded;
					setSettings(loaded);
					setIsLoaded(true);
				}
			})
			.catch((error) => {
				console.error("[Settings] Load failed, using defaults:", error);
				if (!cancelled) {
					settingsRef.current = DEFAULT_SETTINGS;
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
			// Compute outside the state updater: updaters must stay pure
			// (react-doctor no-impure-state-updater), and the save side
			// effect must run exactly once per committed value.
			const updated = mergeSettings(settingsRef.current, patch);
			settingsRef.current = updated;
			setSettings(updated);
			if (!patch.core?.paths) {
				void runSettingsSave(updated);
			}
		},
		[runSettingsSave],
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
		// Keep the ref in sync synchronously: a persistSettingsNow call in
		// the same handler must write the reset values, not the pre-reset
		// snapshot the effect has not flushed yet.
		settingsRef.current = DEFAULT_SETTINGS;
		setSettings(DEFAULT_SETTINGS);
		const ok = await runSettingsSave(DEFAULT_SETTINGS);
		setSaveError(ok ? null : i18n.t(SETTINGS_SAVE_FAILED_MESSAGE_KEY));
	}, [runSettingsSave]);

	const reloadSettingsFromDisk = useCallback(async () => {
		const loaded = await loadSettingsFromStorage();
		settingsRef.current = loaded;
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
			saveError,
			reportSaveError,
			persistSettingsNow,
		}),
		[
			settings,
			updateSettings,
			refreshPathsFromDisk,
			reloadSettingsFromDisk,
			resetSettings,
			isLoaded,
			saveError,
			reportSaveError,
			persistSettingsNow,
		],
	);

	return (
		<SettingsContext.Provider value={value}>
			{children}
		</SettingsContext.Provider>
	);
}
