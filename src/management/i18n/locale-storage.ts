/**
 * i18n language preference storage using file-based storage.
 * Migrated from runtime-memory-storage to file storage at {supportRoot}/data/i18n-preference.json
 */

import { savePreferenceToFile } from "@/management/i18n/preference/storage";

export type CepShellLocale =
	| "en"
	| "de"
	| "fr"
	| "ja"
	| "zh"
	| "es"
	| "ko"
	| "pt"
	| "it"
	| "ru";

export const DEFAULT_CEP_SHELL_LOCALE: CepShellLocale = "ja";

/**
 * Synchronous load - returns cached/default.
 * Call loadPreferenceFromFile and cache result if sync access is needed during early boot.
 */
export const loadCepShellLocale = (): CepShellLocale => {
	return DEFAULT_CEP_SHELL_LOCALE;
};

/**
 * Save to file. Called after user changes language preference.
 */
export const saveCepShellLocale = async (
	win: Window,
	locale: CepShellLocale,
): Promise<void> => {
	try {
		await savePreferenceToFile(win, locale);
	} catch {
		/* noop */
	}
};
