/**
 * management/setting/initialization.ts
 * Onboarding initialization state and locator JSON codec.
 */

import {
	CEP_INTERACTIVE_DIALOG_TIMEOUT_MS,
	cepEvalScriptAvailable,
	runCepEvalScript,
} from "@/management/storage/cep";
import { resolveLocatorPathFromAppRoot } from "@/management/storage/file";
import { normalizeJsonText } from "@/management/storage/read/json-file";
import { writeFileWithElevation } from "@/management/storage/write/elevation-service";

const INITIALIZATION_LOCATOR_VERSION = 1 as const;
const INITIALIZATION_LOCATOR_FILENAME = "ty-plus-init.json" as const;

export type InitializationFileSystem = {
	existsSync(path: string): boolean;
	readFileSync(path: string, encoding: string): string;
	writeFileSync(path: string, content: string): void;
	mkdirSync(path: string, options?: { recursive?: boolean }): void;
	readFile(path: string, encoding: "utf8"): Promise<string>;
	writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
	mkdir(
		path: string,
		options: { recursive: true },
	): Promise<string | undefined>;
};

export const resolveInitializationLocatorPath = (
	appSupportRoot: string,
): string => {
	const normalized = appSupportRoot.replace(/\\+/g, "/").replace(/\/+$/, "");
	return `${normalized}/${INITIALIZATION_LOCATOR_FILENAME}`;
};

/** Mirrors archive `getAppRootFolder`: running AE install dir via `Folder.appPackage` only. */
const buildReadAeAppRootViaExtendScript = (): string => `
(function() {
  try {
    if (typeof Folder === 'undefined' || !Folder.appPackage) { return ''; }
    var base = new Folder(Folder.appPackage.parent.absoluteURI);
    var isMac = $.os && /mac/i.test($.os);
    if (isMac) {
      return String(base.fsName).replace(/\\\\/g, '/');
    }
    var current = base;
    var candidate = null;
    while (current) {
      if (/support files/i.test(current.name)) {
        candidate = current;
      }
      current = current.parent;
    }
    if (candidate) {
      return String(candidate.fsName).replace(/\\\\/g, '/');
    }
    var guess = new Folder(base.fsName + '/Support Files');
    return String(guess.fsName).replace(/\\\\/g, '/');
  } catch (e) {
    return '';
  }
})();
`;

/**
 * Running After Effects install folder for `ty-plus-init.json` (`Folder.appPackage` only).
 * Not the user data Support Root. Fails closed when ExtendScript is unavailable.
 */
export const resolveInitializationAppRoot = async (
	win: Window,
): Promise<string | null> => {
	if (!cepEvalScriptAvailable(win)) {
		return null;
	}
	try {
		const result = await runCepEvalScript(
			win,
			buildReadAeAppRootViaExtendScript(),
			{
				timeoutMs: CEP_INTERACTIVE_DIALOG_TIMEOUT_MS,
			},
		);
		const trimmed = result?.trim() ?? "";
		return trimmed.length > 0 ? trimmed.replaceAll("\\", "/") : null;
	} catch {
		return null;
	}
};

/** Read `ty-plus-init.json` from the host application folder only. */
export const readInitializationStateFromApp = async (
	win: Window,
): Promise<OnboardingInitializationState | null> => {
	const appRoot = await resolveInitializationAppRoot(win);
	if (!appRoot) {
		return null;
	}
	return readInitializationState(win, appRoot);
};

// Internal type mirroring the settings structure for merge operations
type SettingsMergeTarget = {
	supportRoot?: string;
	core?: {
		supportRoot?: string;
		paths?: {
			supportRoot?: string;
			presetRoot?: string;
			scriptRoot?: string;
			pluginRoot?: string;
			[key: string]: unknown;
		};
		[key: string]: unknown;
	};
	workspace?: {
		onboardingPaths?: {
			presetRoot?: string;
			scriptRoot?: string;
			pluginRoot?: string;
		};
		[key: string]: unknown;
	};
	[key: string]: unknown;
};

export interface OnboardingInitializationLocator {
	version: 1;
	supportRoot: string;
	updatedAt: string;
}

export interface OnboardingInitializationState {
	supportRoot: string;
	updatedAt: Date;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

export const parseInitializationLocatorJson = (
	raw: string | null | undefined,
): OnboardingInitializationLocator | null => {
	if (!raw || typeof raw !== "string") return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isObject(parsed)) return null;
	if (parsed.version !== 1) return null;
	if (
		typeof parsed.supportRoot !== "string" ||
		parsed.supportRoot.trim() === ""
	)
		return null;
	if (typeof parsed.updatedAt !== "string") return null;
	return {
		version: parsed.version as 1,
		supportRoot: parsed.supportRoot.trim(),
		updatedAt: parsed.updatedAt,
	};
};

export const buildInitializationLocatorJson = (
	supportRoot: string,
	now?: Date,
): string => {
	const locator: OnboardingInitializationLocator = {
		version: INITIALIZATION_LOCATOR_VERSION,
		supportRoot,
		updatedAt: (now ?? new Date()).toISOString(),
	};
	return `${JSON.stringify(locator, null, 2)}\n`;
};

/**
 * Determines whether initialization is complete based solely on the locator.
 *
 * Initialization is complete when:
 * - The locator is a valid parsed object (not null)
 * - The locator has a non-empty supportRoot
 *
 * This function does NOT inspect settings.json.
 * A valid ty-plus-init.json alone determines completion.
 */
export const isInitializationComplete = (
	locator: OnboardingInitializationState | null,
): { completed: boolean; supportRoot: string | null } => {
	if (locator === null) {
		return { completed: false, supportRoot: null };
	}
	if (
		typeof locator.supportRoot !== "string" ||
		locator.supportRoot.trim() === ""
	) {
		return { completed: false, supportRoot: null };
	}
	return { completed: true, supportRoot: locator.supportRoot.trim() };
};

export const readInitializationLocator = (
	fs: InitializationFileSystem,
	appSupportRoot: string,
): OnboardingInitializationLocator | null => {
	const locatorPath = resolveInitializationLocatorPath(appSupportRoot);
	if (!fs.existsSync(locatorPath)) return null;
	try {
		const raw = fs.readFileSync(locatorPath, "utf8");
		return parseInitializationLocatorJson(raw);
	} catch {
		return null;
	}
};

export const writeInitializationLocator = (
	fs: InitializationFileSystem,
	appSupportRoot: string,
	supportRoot: string,
): void => {
	const locatorPath = resolveInitializationLocatorPath(appSupportRoot);
	const dir = locatorPath.replace(/\\+/g, "/").replace(/[^/\\]+$/, "");
	fs.mkdirSync(dir || ".", { recursive: true });
	fs.writeFileSync(
		locatorPath,
		`${buildInitializationLocatorJson(supportRoot)}\n`,
	);
};

/**
 * Payload for merging onboarding paths into settings.json.
 */
export type OnboardingPathsPayload = {
	supportRoot: string;
	presetRoot: string;
	scriptRoot: string;
	pluginRoot: string;
};

/**
 * Merge onboarding paths into a settings JSON string.
 * Preserves all existing keys not targeted by the onboarding merge.
 *
 * @param existingJson - Current settings.json content (may be null/undefined/empty)
 * @param payload - Onboarding paths to merge
 * @returns New merged settings JSON string with trailing newline
 */
export const mergeOnboardingSettings = (
	existingJson: string | null | undefined,
	payload: OnboardingPathsPayload,
): string => {
	const parseSettingsJson = (
		raw: string | null | undefined,
	): SettingsMergeTarget => {
		if (!raw?.trim()) {
			return {};
		}
		try {
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				return {};
			}
			return parsed as SettingsMergeTarget;
		} catch {
			return {};
		}
	};
	const settings = parseSettingsJson(existingJson);
	const nextSettings: SettingsMergeTarget = {
		...settings,
		core: {
			...(settings.core ?? {}),
			paths: {
				...(settings.core?.paths ?? {}),
				supportRoot: payload.supportRoot,
				presetRoot: payload.presetRoot,
				scriptRoot: payload.scriptRoot,
				pluginRoot: payload.pluginRoot,
			},
		},
		workspace: {
			...(settings.workspace ?? {}),
			onboardingPaths: {
				presetRoot: payload.presetRoot,
				scriptRoot: payload.scriptRoot,
				pluginRoot: payload.pluginRoot,
			},
		},
	};
	return `${JSON.stringify(nextSettings, null, 2)}\n`;
};

/**
 * Reads the configured **support root** from settings (`core.paths.supportRoot` and
 * legacy keys). This is the folder chosen during onboarding; it may default to the host
 * support directory but is not defined by that default alone.
 */
export const readSupportRootFromSettingsJson = (
	raw: string | null | undefined,
): string | null => {
	if (!raw?.trim()) {
		return null;
	}
	try {
		const parsed = JSON.parse(raw) as SettingsMergeTarget;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return null;
		}
		const fromCorePaths =
			typeof parsed.core?.paths?.supportRoot === "string"
				? parsed.core.paths.supportRoot.trim()
				: "";
		if (fromCorePaths) {
			return fromCorePaths;
		}
		if (typeof parsed.supportRoot === "string" && parsed.supportRoot.trim()) {
			return parsed.supportRoot.trim();
		}
		const coreDirect =
			typeof parsed.core?.supportRoot === "string"
				? parsed.core.supportRoot.trim()
				: "";
		if (coreDirect) {
			return coreDirect;
		}
		return null;
	} catch {
		return null;
	}
};

// ── Node fs helpers ────────────────────────────────────────────────────────────

type NodeFsPromises = {
	readFile(path: string, encoding: "utf8"): Promise<string>;
	writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
	mkdir(
		path: string,
		options: { recursive: true },
	): Promise<string | undefined>;
};

const resolveNodeFsPromises = async (win: Window): Promise<NodeFsPromises> => {
	const requireFn = (
		win as Window & { cep_node?: { require?: (id: string) => unknown } }
	).cep_node?.require;

	if (requireFn) {
		const fsMod = requireFn("fs") as {
			promises?: NodeFsPromises;
			readFileSync?: (path: string, encoding: "utf8") => string;
			writeFileSync?: (path: string, data: string, encoding: "utf8") => void;
			mkdirSync?: (path: string, options: { recursive: true }) => void;
		};
		if (fsMod?.promises) {
			return fsMod.promises;
		}
		if (fsMod?.readFileSync && fsMod?.writeFileSync && fsMod?.mkdirSync) {
			const syncRead = fsMod.readFileSync;
			const syncWrite = fsMod.writeFileSync;
			const syncMkdir = fsMod.mkdirSync;
			return {
				readFile: (path, encoding) =>
					Promise.resolve(syncRead(String(path), encoding as "utf8")),
				writeFile: (path, data, encoding) => {
					syncWrite(String(path), String(data), encoding as "utf8");
					return Promise.resolve();
				},
				mkdir: (path, options) => {
					syncMkdir(String(path), options as { recursive: true });
					return Promise.resolve(undefined);
				},
			};
		}
	}

	// Outside CEP: use dynamic import
	const fsPromises = await import("node:fs/promises");
	return {
		readFile: (path, encoding) => fsPromises.readFile(path, encoding),
		writeFile: (path, data, encoding) =>
			fsPromises.writeFile(path, data, encoding),
		mkdir: (path, options) => fsPromises.mkdir(path, options),
	};
};

const readLocatorJsonViaNodeFs = async (
	win: Window,
	userSupportRoot: string,
): Promise<string | null> => {
	const fs = await resolveNodeFsPromises(win);
	const locatorPath = resolveLocatorPathFromAppRoot(userSupportRoot);
	try {
		const body = await fs.readFile(locatorPath, "utf8");
		return body.trim().length > 0 ? body.trim() : null;
	} catch {
		return null;
	}
};

const writeLocatorJsonViaNodeFs = async (
	win: Window,
	userSupportRoot: string,
	jsonText: string,
): Promise<void> => {
	const fs = await resolveNodeFsPromises(win);
	const locatorPath = resolveLocatorPathFromAppRoot(userSupportRoot);
	const parentDir = locatorPath.split("/").slice(0, -1).join("/");
	await fs.mkdir(parentDir, { recursive: true });
	await fs.writeFile(locatorPath, normalizeJsonText(jsonText), "utf8");
};

/**
 * Read `ty-plus-init.json` from the host application folder (`appSupportRoot`).
 * The JSON `supportRoot` field holds the user data browse path, not `appSupportRoot`.
 */
export const readInitializationState = async (
	win: Window,
	appSupportRoot: string,
): Promise<OnboardingInitializationState | null> => {
	try {
		const raw = await readLocatorJsonViaNodeFs(win, appSupportRoot);
		const locator = parseInitializationLocatorJson(raw);
		if (!locator) {
			return null;
		}
		return {
			supportRoot: locator.supportRoot,
			updatedAt: new Date(locator.updatedAt),
		};
	} catch {
		return null;
	}
};

/**
 * Input type for completeInitialization.
 */
export type InitializationInput = {
	supportRoot: string;
	presetRoot: string;
	scriptRoot: string;
	pluginRoot: string;
};

/** Writes `ty-plus-init.json` under the host application folder only. */
const writeLocatorAtAppRoot = async (
	win: Window,
	appSupportRoot: string,
	locatorJson: string,
): Promise<void> => {
	const locatorPath = resolveLocatorPathFromAppRoot(appSupportRoot);
	try {
		await writeLocatorJsonViaNodeFs(win, appSupportRoot, locatorJson);
		return;
	} catch (error) {
		if (writeFileWithElevation(win, locatorPath, locatorJson).ok) {
			return;
		}
		const message =
			error instanceof Error ? error.message : "Unknown write error";
		throw new Error(
			`Failed to write ty-plus-init.json under ${appSupportRoot}: ${message}`,
		);
	}
};

export type UpdateInitializationLocatorOptions = {
	/** Pre-resolved AE install folder (avoids evalScript after host confirm dialogs). */
	appRoot?: string | null;
};

/**
 * Updates only the user data path inside `ty-plus-init.json` at the host app folder.
 * The locator file itself is never moved to the user's Support Root browse path.
 */
export const updateInitializationLocatorUserSupportRoot = async (
	win: Window,
	userBrowseRoot: string,
	options?: UpdateInitializationLocatorOptions,
): Promise<void> => {
	const appRoot =
		options?.appRoot?.trim() ?? (await resolveInitializationAppRoot(win));
	if (!appRoot) {
		throw new Error(
			"Ty Plus: cannot resolve the running After Effects install folder for ty-plus-init.json. Open the panel inside After Effects and try again.",
		);
	}
	const locatorJson = buildInitializationLocatorJson(userBrowseRoot.trim());
	await writeLocatorAtAppRoot(win, appRoot, locatorJson);
};

/** Absolute path to `ty-plus-init.json` under the running AE install folder. */
const resolveTyPlusInitJsonPath = async (
	win: Window,
): Promise<string | null> => {
	const appRoot = await resolveInitializationAppRoot(win);
	if (!appRoot) {
		return null;
	}
	return resolveLocatorPathFromAppRoot(appRoot);
};

/**
 * Writes `ty-plus-init.json` under `appSupportRoot` (host application folder).
 * JSON `supportRoot` is the user-selected data browse path from `input`.
 */
export const completeInitialization = async (
	win: Window,
	appSupportRoot: string,
	input: InitializationInput,
): Promise<void> => {
	const locatorJson = buildInitializationLocatorJson(input.supportRoot);
	await writeLocatorAtAppRoot(win, appSupportRoot, locatorJson);
};
