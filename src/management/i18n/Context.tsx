/**
 * I18n Context Provider for ty-plus
 * Manages locale state and synchronization across CEP surfaces
 */

import {
	createContext,
	type JSX,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import type { SupportedLocale } from "@/management/i18n/config";
import { changeLanguage, i18n, initializeI18n } from "@/management/i18n/index";
import { loadCepShellLocale } from "@/management/i18n/locale-storage";

type I18nContextValue = {
	locale: SupportedLocale;
	setLocale: (locale: SupportedLocale) => Promise<void>;
	isReady: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n(): I18nContextValue {
	const context = useContext(I18nContext);
	if (!context) {
		throw new Error("useI18n must be used within I18nProvider");
	}
	return context;
}

type I18nProviderProps = {
	children: ReactNode;
};

/**
 * I18nProvider manages i18next initialization and locale sync
 * Manages locale changes for the current surface
 */
export function I18nProvider({ children }: I18nProviderProps): JSX.Element {
	const [locale, setLocaleState] = useState<SupportedLocale>(() =>
		i18n.isInitialized
			? (i18n.language as SupportedLocale)
			: loadCepShellLocale(),
	);

	// Initialize i18next on mount (assumes `panel.tsx` already awaits initialization; double-init is safe for standalone)
	useEffect(() => {
		void initializeI18n(window)
			.then(() => {
				setLocaleState(i18n.language as SupportedLocale);
			})
			.catch((error) => {
				console.error("Failed to initialize i18n:", error);
			});
	}, []);

	const setLocale = useCallback(
		async (newLocale: SupportedLocale): Promise<void> => {
			await changeLanguage(newLocale);
			setLocaleState(newLocale);
		},
		[],
	);

	const value = useMemo<I18nContextValue>(
		() => ({
			locale,
			setLocale,
			isReady: i18n.isInitialized,
		}),
		[locale, setLocale],
	);

	return (
		<I18nContext.Provider value={value}>
			<I18nextProvider i18n={i18n}>{children}</I18nextProvider>
		</I18nContext.Provider>
	);
}

/**
 * Re-export useTranslation for convenience
 */
export { useTranslation };
