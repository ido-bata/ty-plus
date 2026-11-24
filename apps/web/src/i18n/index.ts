import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./locales/de/web.json";
import en from "./locales/en/web.json";
import es from "./locales/es/web.json";
import fr from "./locales/fr/web.json";
import it from "./locales/it/web.json";
import ja from "./locales/ja/web.json";
import ko from "./locales/ko/web.json";
import pt from "./locales/pt/web.json";
import ru from "./locales/ru/web.json";
import zh from "./locales/zh/web.json";

export const WEB_LOCALES = [
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

export type WebLocale = (typeof WEB_LOCALES)[number];

const DEFAULT_WEB_LOCALE: WebLocale = "en";

const LOCALE_STORAGE_KEY = "ty-plus.web.locale";

const LOCALE_NAMES: Record<WebLocale, string> = {
	en: "English",
	ja: "日本語",
	de: "Deutsch",
	fr: "Français",
	zh: "中文",
	es: "Español",
	ko: "한국어",
	pt: "Português",
	it: "Italiano",
	ru: "Русский",
};

export const webLocaleName = (locale: WebLocale): string =>
	LOCALE_NAMES[locale];

const RESOURCES = {
	en: { web: en },
	ja: { web: ja },
	de: { web: de },
	fr: { web: fr },
	zh: { web: zh },
	es: { web: es },
	ko: { web: ko },
	pt: { web: pt },
	it: { web: it },
	ru: { web: ru },
} as const;

const toWebLocale = (value: string | null | undefined): WebLocale | null =>
	WEB_LOCALES.includes(value as WebLocale) ? (value as WebLocale) : null;

/**
 * Locale detection order: explicit stored choice, then the browser
 * language, then English. Runs only on the client — prerendered HTML is
 * always English so hydration stays deterministic; the stored/browser
 * locale is applied after mount via `applyStoredWebLocale`.
 */
function detectWebLocale(): WebLocale {
	if (typeof window === "undefined") return DEFAULT_WEB_LOCALE;
	try {
		const stored = toWebLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
		if (stored) return stored;
	} catch {
		// Storage can be unavailable (private mode); fall through.
	}
	const primary = window.navigator.language?.split("-")[0]?.toLowerCase();
	return toWebLocale(primary) ?? DEFAULT_WEB_LOCALE;
}

void i18n.use(initReactI18next).init({
	resources: RESOURCES,
	// Always start from English: the prerendered markup is English, so the
	// client's first render must match it. `applyStoredWebLocale` switches
	// after mount.
	lng: DEFAULT_WEB_LOCALE,
	fallbackLng: DEFAULT_WEB_LOCALE,
	supportedLngs: [...WEB_LOCALES],
	ns: ["web"],
	defaultNS: "web",
	interpolation: { escapeValue: false },
	react: { useSuspense: false },
});

export function applyStoredWebLocale(): void {
	const locale = detectWebLocale();
	if (locale !== i18n.language) {
		void i18n.changeLanguage(locale);
	}
	if (typeof document !== "undefined") {
		document.documentElement.lang = locale;
	}
}

export function setWebLocale(locale: WebLocale): void {
	try {
		window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
	} catch {
		// Ignore storage failures; the session still switches language.
	}
	void i18n.changeLanguage(locale);
	if (typeof document !== "undefined") {
		document.documentElement.lang = locale;
	}
}

export { i18n };
