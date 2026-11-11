/**
 * File-based i18n language preference storage for CEP.
 * Reads locale from settings/ui.json (new home) with fallback to
 * legacy data/i18n-preference.json for migration.
 * Writes locale to settings/ui.json only.
 */

import type { CepShellLocale } from "@/management/i18n/locale-storage";
import { DEFAULT_CEP_SHELL_LOCALE } from "@/management/i18n/locale-storage";
import { resolveInitializationAppRoot } from "@/management/setting/onboarding/initialization";
import {
	resolveBrowseRoot,
	resolveLocatorPathFromAppRoot,
} from "@/management/storage/file";
import {
	readSettingsAppJson,
	readSettingsUiJson,
	writeSettingsUiJson,
} from "@/management/storage/settings-files-store";

const LEGACY_I18N_FILE_NAME = "i18n-preference.json";
const UI_JSON_KEY = "locale";

const resolveLegacyPrefPath = (baseRoot: string): string => {
	const normalized = String(baseRoot).replace(/[\\/]+$/, "");
	return `${normalized}/data/${LEGACY_I18N_FILE_NAME}`;
};

type WorkspaceNodeFsPromises = {
	readFile(path: string, encoding: "utf8"): Promise<string>;
};

const resolveWorkspaceNodeFsPromises = async (
	win: Window,
): Promise<WorkspaceNodeFsPromises> => {
	const requireFn = (
		win as Window & {
			cep_node?: { require?: (id: string) => unknown };
		}
	).cep_node?.require;
	if (requireFn) {
		const fsMod = requireFn("fs") as {
			promises?: {
				readFile(path: string, encoding: "utf8"): Promise<string>;
			};
			readFileSync?: (path: string, encoding: "utf8") => string;
		};
		if (fsMod.promises) {
			return {
				readFile: (path, encoding) => fsMod.promises!.readFile(path, encoding),
			};
		}
		if (fsMod.readFileSync) {
			return {
				readFile: async (path, encoding) =>
					fsMod.readFileSync!(String(path), encoding as "utf8"),
			};
		}
		throw new Error("CEP Node fs API is not available");
	}
	const fsPromises = await import("node:fs/promises");
	return {
		readFile: (path, encoding) => fsPromises.readFile(path, encoding),
	};
};

const resolveCepFileSystemGateway = (
	_hostCode: string,
	_cep: { systemPaths?: { hostSupportRoot?: string } },
) => {
	if (
		typeof (globalThis as Record<string, unknown>).__cep_gateway === "object"
	) {
		return (globalThis as Record<string, unknown>).__cep_gateway;
	}
	return null;
};

const readGatewayHostSupportRoot = (gateway: unknown): string | null => {
	if (!gateway || typeof gateway !== "object") {
		return null;
	}
	const paths = (gateway as { systemPaths?: unknown }).systemPaths;
	if (!paths || typeof paths !== "object") {
		return null;
	}
	const hostSupportRoot = (paths as { hostSupportRoot?: unknown })
		.hostSupportRoot;
	if (typeof hostSupportRoot !== "string") {
		return null;
	}
	return hostSupportRoot.trim();
};

const _resolveWorkspaceSettingsBaseRoot = (win: Window): string | null => {
	const cep =
		typeof win.CSInterface === "function"
			? new win.CSInterface()
			: win.__adobe_cep__;
	const gateway = resolveCepFileSystemGateway(
		(cep as { hostCode?: string }).hostCode ?? "",
		cep as { systemPaths?: { hostSupportRoot?: string } },
	);
	const trimmed = readGatewayHostSupportRoot(gateway);
	if (!trimmed) {
		return null;
	}
	return trimmed.replace(/[\\/]+$/, "");
};

const resolveBrowseRootFromInitializationLocator = async (
	win: Window,
): Promise<string | null> => {
	const appRoot = await resolveInitializationAppRoot(win);
	if (!appRoot) {
		return null;
	}
	const fsMod = await resolveWorkspaceNodeFsPromises(win);
	const locatorPath = resolveLocatorPathFromAppRoot(appRoot);
	try {
		const locatorJson = await fsMod.readFile(locatorPath, "utf8");
		const parsed = JSON.parse(locatorJson) as {
			supportRoot?: unknown;
		};
		if (
			parsed &&
			typeof parsed === "object" &&
			typeof parsed.supportRoot === "string" &&
			parsed.supportRoot.trim().length > 0
		) {
			return resolveBrowseRoot(parsed.supportRoot.trim());
		}
	} catch {
		/* ignore missing/invalid locator */
	}
	return null;
};

/**
 * Read locale from the legacy data/i18n-preference.json file via Node.js fs.
 * Used only as fallback when settings/ui.json has no locale.
 */
const readLegacyPrefFile = async (
	win: Window,
): Promise<{ locale?: string } | null> => {
	const [fsMod, supportRoot] = await Promise.all([
		resolveWorkspaceNodeFsPromises(win),
		resolveBrowseRootFromInitializationLocator(win),
	]);
	if (!supportRoot) {
		return null;
	}
	const prefsPath = resolveLegacyPrefPath(supportRoot);
	try {
		const body = await fsMod.readFile(prefsPath, "utf8");
		const trimmed = body.trim();
		if (!trimmed) {
			return null;
		}
		return JSON.parse(trimmed) as { locale?: string };
	} catch {
		return null;
	}
};

export const loadPreferenceFromFile = async (
	win: Window,
): Promise<CepShellLocale> => {
	// Primary: read from settings/app.json settings.ui.language
	try {
		const appSettings = await readSettingsAppJson(win);
		if (
			appSettings &&
			typeof appSettings === "object" &&
			typeof (appSettings as Record<string, unknown>).ui === "object"
		) {
			const ui = (appSettings as Record<string, unknown>).ui as Record<
				string,
				unknown
			>;
			if (typeof ui.language === "string") {
				return ui.language as CepShellLocale;
			}
		}
	} catch {
		/* noop */
	}

	// Fallback: settings/ui.json locale
	try {
		const uiSettings = await readSettingsUiJson(win);
		if (
			uiSettings &&
			typeof uiSettings === "object" &&
			typeof (uiSettings as Record<string, unknown>)[UI_JSON_KEY] === "string"
		) {
			return (uiSettings as Record<string, unknown>)[
				UI_JSON_KEY
			] as CepShellLocale;
		}
	} catch {
		/* noop */
	}

	// Fallback: legacy data/i18n-preference.json
	try {
		const legacy = await readLegacyPrefFile(win);
		if (legacy && typeof legacy.locale === "string") {
			return legacy.locale as CepShellLocale;
		}
	} catch {
		/* noop */
	}

	return DEFAULT_CEP_SHELL_LOCALE;
};

export const savePreferenceToFile = async (
	win: Window,
	locale: CepShellLocale,
): Promise<void> => {
	try {
		const existing = await readSettingsUiJson(win);
		const updated =
			existing && typeof existing === "object"
				? { ...existing, [UI_JSON_KEY]: locale }
				: { [UI_JSON_KEY]: locale };
		await writeSettingsUiJson(win, updated as Record<string, unknown>);
	} catch {
		/* noop */
	}
};
