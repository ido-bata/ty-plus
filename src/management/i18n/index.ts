/**
 * i18next initialization for ty-plus CEP extension
 * Since dynamic imports are not resolved at runtime in CEP's Bun.build single bundle,
 * translations are passed via `bundled-resources.ts` to `resources` (do not use `loadTranslation`).
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { BUNDLED_I18N_RESOURCES } from "@/management/i18n/bundled-resources";
import {
	DEFAULT_LOCALE,
	getStoredLocaleAsync,
	NAMESPACES,
	type SupportedLocale,
	saveLocaleAsync,
} from "@/management/i18n/config";

let initPromise: Promise<typeof i18n> | null = null;

/**
 * Initialize i18next with idempotent guard (safe to await from boot + provider).
 */
export async function initializeI18n(win: Window): Promise<typeof i18n> {
	if (i18n.isInitialized) {
		return i18n;
	}
	if (initPromise) {
		return initPromise;
	}

	const initialLocale = await getStoredLocaleAsync(win);

	initPromise = i18n
		.use(initReactI18next)
		.init({
			resources: BUNDLED_I18N_RESOURCES,
			lng: initialLocale,
			fallbackLng: DEFAULT_LOCALE,
			supportedLngs: Object.keys(BUNDLED_I18N_RESOURCES),
			ns: [...NAMESPACES],
			defaultNS: "common",
			fallbackNS: "common",

			interpolation: {
				escapeValue: false,
			},

			react: {
				useSuspense: false,
			},

			debug: false,

			keySeparator: ".",
			nsSeparator: ":",
		})
		.then(() => {
			if (typeof document !== "undefined") {
				document.documentElement.lang = initialLocale;
			}
			return i18n;
		});

	return initPromise;
}

/**
 * Change language at runtime
 */
export async function changeLanguage(locale: SupportedLocale): Promise<void> {
	await i18n.changeLanguage(locale);
	await saveLocaleAsync(window, locale);

	if (typeof document !== "undefined") {
		document.documentElement.lang = locale;
	}
}

export { i18n };
