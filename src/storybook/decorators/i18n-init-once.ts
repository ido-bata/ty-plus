import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { initializeI18n } from "@/management/i18n";
import { BUNDLED_I18N_RESOURCES } from "@/management/i18n/bundled-resources";
import {
	DEFAULT_LOCALE,
	getStoredLocaleAsync,
	NAMESPACES,
} from "@/management/i18n/config";

/**
 * Module-singleton guard for the synchronous init below. Even if the
 * module is re-evaluated (across hot-reloads, story bundles, etc.)
 * `i18n.isInitialized` short-circuits the second init.
 *
 * Inline `resources` (no async backend) means `i18n.init()` registers
 * the instance synchronously — `useTranslation()` calls during the
 * first render of any story therefore see a fully-wired i18next
 * without the `NO_I18NEXT_INSTANCE` warning. The returned Promise
 * resolves on a later microtask, but the modules/resources are
 * available immediately.
 *
 * This mirrors `vitest.setup.ts`'s pattern for unit tests. Production
 * boots (`panel/boot.tsx`, etc.) `await initializeI18n(window)` before
 * mounting React, so they don't need this module-load init — but this
 * file is Storybook-only (never reachable from a production boot path),
 * so there's no double-init risk.
 */
if (!i18n.isInitialized) {
	i18n.use(initReactI18next).init({
		resources: BUNDLED_I18N_RESOURCES,
		lng: DEFAULT_LOCALE,
		fallbackLng: DEFAULT_LOCALE,
		supportedLngs: Object.keys(BUNDLED_I18N_RESOURCES),
		ns: [...NAMESPACES],
		defaultNS: "common",
		fallbackNS: "common",
		interpolation: { escapeValue: false },
		react: { useSuspense: false },
		debug: false,
		keySeparator: ".",
		nsSeparator: ":",
	});
}

let upgradePromise: Promise<typeof i18n> | null = null;

/**
 * Await the production-side `initializeI18n(win)` once. Now that the
 * module-load sync init has already wired react-i18next, this is mostly
 * a no-op for the React instance, but we still call it so any
 * production-side document-level side effects (e.g. setting
 * `document.documentElement.lang`) fire and so the optional stored-locale
 * upgrade below can safely `await changeLanguage`.
 */
export const ensureI18nInitialized = async (
	win: Window,
): Promise<typeof i18n> => {
	if (!upgradePromise) {
		upgradePromise = initializeI18n(win).catch((err) => {
			// Reset so a retry is possible if the first attempt fails
			// (e.g. CEP file API throws before the catch in
			// `getStoredLocaleAsync` fires).
			upgradePromise = null;
			throw err;
		});
	}
	return upgradePromise;
};

let localeUpgradePromise: Promise<void> | null = null;

/**
 * Read the user's stored locale (CEP file API in production, gracefully
 * degrades to `DEFAULT_LOCALE` in browser tests) and switch i18next to
 * it if it differs from the current language. Fire-and-forget — never
 * blocks first paint.
 */
export const upgradeLocaleFromStoredPreference = (
	win: Window,
): Promise<void> => {
	if (localeUpgradePromise) return localeUpgradePromise;
	localeUpgradePromise = (async () => {
		const stored = await getStoredLocaleAsync(win);
		if (stored !== i18n.language) {
			await i18n.changeLanguage(stored);
		}
	})();
	return localeUpgradePromise;
};

/**
 * Switch i18next to English for the Storybook preview. We bypass the
 * production `changeLanguage` helper because that helper also calls
 * `saveLocaleAsync` which writes through the CEP file API — that path
 * does not exist in Storybook and would log a console error every
 * time a story mounts.
 */
export const forceEnglishLocale = async (): Promise<void> => {
	if (i18n.language === "en") return;
	await i18n.changeLanguage("en");
};
