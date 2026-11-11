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

/** For `document.documentElement.lang` (BCP 47) */
const CEP_SHELL_LOCALE_HTML_LANG: Record<CepShellLocale, string> = {
	en: "en",
	de: "de",
	fr: "fr",
	ja: "ja",
	zh: "zh-Hans",
	es: "es",
	ko: "ko",
	pt: "pt-BR",
	it: "it",
	ru: "ru",
};

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

export const applyCepShellLocaleToDocument = (
	doc: Document,
	locale: CepShellLocale,
): void => {
	doc.documentElement.lang = CEP_SHELL_LOCALE_HTML_LANG[locale] ?? "en";
};
