/**
 * i18n configuration constants for ty-plus
 * Archive-compatible locale keys and namespace structure
 */

export const SUPPORTED_LOCALES = [
	"en",
	"ja",
	"de",
	"fr",
	"zh",
	"es",
	"ko",
	"pt",
	"it",
	"ru",
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Translation namespaces
 * Each namespace corresponds to a feature area
 */
export const NAMESPACES = [
	"common",
	"contextMenu",
	"onboarding",
	"presets",
	"workspace",
	"settings",
	"widgets",
	"dialogs",
	"online",
] as const;

type Namespace = (typeof NAMESPACES)[number];

/**
 * runtime storage keys for locale persistence
 * Archive compatibility: 'i18n-language' is primary
 */
const _LOCALE_STORAGE_KEYS = {
	primary: "i18n-language",
	secondary: "ty-plus.locale.v1",
} as const;

/**
 * Default locale fallback chain
 */
export const DEFAULT_LOCALE: SupportedLocale = "en";

/**
 * Detect browser locale and map to supported locale
 */
function _detectBrowserLocale(): SupportedLocale {
	const nav = typeof navigator !== "undefined" ? navigator : null;
	if (!nav) return DEFAULT_LOCALE;

	const browserLang =
		nav.language || (nav as { userLanguage?: string }).userLanguage;
	if (!browserLang) return DEFAULT_LOCALE;

	// Extract primary language code (en-US ↁEen)
	const primary = browserLang.split("-")[0].toLowerCase();

	// Check if it's directly supported
	if (SUPPORTED_LOCALES.includes(primary as SupportedLocale)) {
		return primary as SupportedLocale;
	}

	return DEFAULT_LOCALE;
}

import type { CepShellLocale } from "@/management/i18n/locale-storage";
import { DEFAULT_CEP_SHELL_LOCALE } from "@/management/i18n/locale-storage";
import {
	loadPreferenceFromFile,
	savePreferenceToFile,
} from "@/management/i18n/preference/storage";

/**
 * Get locale from file storage with fallback chain
 * Priority: file ↁEnavigator ↁEDEFAULT
 */
export async function getStoredLocaleAsync(
	win: Window,
): Promise<CepShellLocale> {
	try {
		return await loadPreferenceFromFile(win);
	} catch (error) {
		console.warn("Failed to read locale from file storage:", error);
	}
	return DEFAULT_CEP_SHELL_LOCALE;
}

/**
 * Save locale to file storage
 */
export async function saveLocaleAsync(
	win: Window,
	locale: CepShellLocale,
): Promise<void> {
	try {
		await savePreferenceToFile(win, locale);
	} catch (error) {
		console.error("Failed to save locale to file storage:", error);
	}
}
