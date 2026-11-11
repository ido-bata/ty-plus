import type { Settings } from "@/management/setting/models/settings";
import {
	coerceSettings,
	mergeSettings,
} from "@/management/setting/models/settings";
import { updateInitializationLocatorUserSupportRoot } from "@/management/setting/onboarding/initialization";
import {
	readSettingsPathsJson,
	writeSettingsPathsJson,
} from "@/management/setting/persistence/settings-json-files";
import { resolveTyPlusManagedRootForPersistence } from "@/management/setting/persistence/ty-plus-managed-root";
import {
	readSettings,
	writeSettings,
} from "@/management/storage/workspace/store";
import { normalizePathLike } from "@/shared/util/path";

type PathKey = keyof Settings["core"]["paths"];

const PATH_KEYS: readonly PathKey[] = [
	"supportRoot",
	"presetRoot",
	"scriptRoot",
	"pluginRoot",
] as const;

const normalizePathsPayload = (
	paths: Settings["core"]["paths"],
): Settings["core"]["paths"] => ({
	supportRoot: normalizePathLike(paths.supportRoot ?? ""),
	presetRoot: paths.presetRoot?.trim()
		? normalizePathLike(paths.presetRoot)
		: undefined,
	scriptRoot: paths.scriptRoot?.trim()
		? normalizePathLike(paths.scriptRoot)
		: undefined,
	pluginRoot: paths.pluginRoot?.trim()
		? normalizePathLike(paths.pluginRoot)
		: undefined,
});

const pathsToJsonRecord = (
	paths: Settings["core"]["paths"],
): Record<string, unknown> => {
	const record: Record<string, unknown> = {
		supportRoot: paths.supportRoot,
	};
	if (paths.presetRoot) record.presetRoot = paths.presetRoot;
	if (paths.scriptRoot) record.scriptRoot = paths.scriptRoot;
	if (paths.pluginRoot) record.pluginRoot = paths.pluginRoot;
	return record;
};

const mergePathsIntoSettingsJsonText = (
	raw: string | null,
	paths: Settings["core"]["paths"],
): string => {
	let base: Settings;
	try {
		const parsed = raw?.trim() ? (JSON.parse(raw) as unknown) : null;
		base = coerceSettings(parsed);
	} catch {
		base = coerceSettings(null);
	}
	const merged = mergeSettings(base, {
		core: {
			...base.core,
			paths,
		},
	});
	return `${JSON.stringify(merged, null, 2)}\n`;
};

const writeLocatorForSupportRoot = async (
	win: Window,
	paths: Settings["core"]["paths"],
	locatorAppRoot?: string | null,
): Promise<void> => {
	await updateInitializationLocatorUserSupportRoot(win, paths.supportRoot, {
		appRoot: locatorAppRoot,
	});
};

export type PersistSettingsPathsOptions = {
	previousPaths?: Settings["core"]["paths"];
	/** When true, updates `supportRoot` inside app-folder `ty-plus-init.json` only. */
	updateSupportRootLocator?: boolean;
	/** AE install folder for `ty-plus-init.json` (resolve before host confirm dialogs). */
	locatorAppRoot?: string | null;
};

/**
 * Persists `settings/paths.json`, syncs `settings.json` `core.paths`, and when
 * Support Root changes updates the locator JSON at the host app folder (never moves the file).
 */
export const persistSettingsPaths = async (
	win: Window,
	paths: Settings["core"]["paths"],
	options?: PersistSettingsPathsOptions,
): Promise<Settings["core"]["paths"]> => {
	const normalized = normalizePathsPayload(paths);
	const previous = options?.previousPaths
		? normalizePathsPayload(options.previousPaths)
		: undefined;
	const prevSupport = previous?.supportRoot?.trim() ?? "";
	const nextSupport = normalized.supportRoot.trim();
	const supportChanged =
		Boolean(prevSupport) && Boolean(nextSupport) && prevSupport !== nextSupport;

	if (supportChanged && options?.updateSupportRootLocator !== false) {
		await writeLocatorForSupportRoot(win, normalized, options?.locatorAppRoot);
	}

	const managedRoot = await resolveTyPlusManagedRootForPersistence(win);
	if (managedRoot) {
		await writeSettingsPathsJson(win, pathsToJsonRecord(normalized));
	}

	const rawSettings = await readSettings(win);
	const mergedJson = mergePathsIntoSettingsJsonText(rawSettings, normalized);
	await writeSettings(win, mergedJson);

	return normalized;
};

/** Reads disk paths and returns merged `core.paths` (paths.json wins over settings). */
const loadPersistedSettingsPaths = async (
	win: Window,
	current: Settings["core"]["paths"],
): Promise<Settings["core"]["paths"]> => {
	const merged = { ...current };
	const managedRoot = await resolveTyPlusManagedRootForPersistence(win);
	const pathsDoc = managedRoot ? await readSettingsPathsJson(win) : null;
	for (const key of PATH_KEYS) {
		const raw = pathsDoc?.[key];
		if (typeof raw === "string" && raw.trim()) {
			merged[key] =
				key === "supportRoot" ? normalizePathLike(raw) : normalizePathLike(raw);
		}
	}
	return normalizePathsPayload(merged);
};
