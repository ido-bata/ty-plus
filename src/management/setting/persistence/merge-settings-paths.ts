import type { Settings } from "@/management/setting/models/settings";
import {
	readLocatorSupportBrowseRoot,
	readPersistedPathsDocument,
	resolvePersistedSupportBrowseRoot,
} from "@/management/setting/persistence/resolve-persisted-paths";

type PathKey = keyof Settings["core"]["paths"];

const PATH_KEYS: readonly PathKey[] = [
	"supportRoot",
	"presetRoot",
	"scriptRoot",
	"pluginRoot",
] as const;

const pickPathString = (
	source: Record<string, unknown> | null | undefined,
	key: PathKey,
): string | undefined => {
	const raw = source?.[key];
	return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
};

const mergePathValue = (
	current: string | undefined,
	incoming: string | undefined,
): string | undefined => {
	const cur = current?.trim() ?? "";
	const inc = incoming?.trim() ?? "";
	return inc || cur || undefined;
};

const pathsEqual = (
	a: Settings["core"]["paths"],
	b: Settings["core"]["paths"],
): boolean => {
	for (const key of PATH_KEYS) {
		const left = (a[key] ?? "").trim();
		const right = (b[key] ?? "").trim();
		if (left !== right) {
			return false;
		}
	}
	return true;
};

/**
 * Merges `settings/paths.json`, `ty-plus-init.json`, and legacy
 * `workspace.onboardingPaths` into `core.paths` for the settings dialog.
 */
export const mergeSettingsPathsFromDisk = async (
	win: Window,
	settings: Settings,
	rawSettings?: unknown,
	settingsRaw?: string | null,
): Promise<Settings> => {
	const paths: Settings["core"]["paths"] = { ...settings.core.paths };

	const rawRecord =
		rawSettings &&
		typeof rawSettings === "object" &&
		!Array.isArray(rawSettings)
			? (rawSettings as Record<string, unknown>)
			: null;
	const workspace =
		rawRecord?.workspace &&
		typeof rawRecord.workspace === "object" &&
		!Array.isArray(rawRecord.workspace)
			? (rawRecord.workspace as Record<string, unknown>)
			: null;
	const onboardingPaths =
		workspace?.onboardingPaths &&
		typeof workspace.onboardingPaths === "object" &&
		!Array.isArray(workspace.onboardingPaths)
			? (workspace.onboardingPaths as Record<string, unknown>)
			: null;

	const applyPath = (key: PathKey, incoming: string | undefined): void => {
		const merged = mergePathValue(paths[key], incoming);
		if (!merged) {
			return;
		}
		if (key === "supportRoot") {
			paths.supportRoot = merged;
			return;
		}
		paths[key] = merged;
	};

	for (const key of PATH_KEYS) {
		applyPath(key, pickPathString(onboardingPaths, key));
	}

	const locatorBrowseRoot = await readLocatorSupportBrowseRoot(win);
	applyPath("supportRoot", locatorBrowseRoot ?? undefined);

	const browseRoot =
		(await resolvePersistedSupportBrowseRoot(win, settingsRaw)) ??
		locatorBrowseRoot;
	const pathsDoc = await readPersistedPathsDocument(win, browseRoot);
	for (const key of PATH_KEYS) {
		applyPath(key, pickPathString(pathsDoc ?? undefined, key));
	}

	if (!paths.supportRoot?.trim() && locatorBrowseRoot) {
		paths.supportRoot = locatorBrowseRoot;
	}

	if (pathsEqual(settings.core.paths, paths)) {
		return settings;
	}

	return {
		...settings,
		core: {
			...settings.core,
			paths,
		},
	};
};
