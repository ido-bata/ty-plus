import type { Decorator } from "@storybook/react";
import { type ReactNode, useEffect } from "react";

import { ensureI18nInitialized, forceEnglishLocale } from "./i18n-init-once";

/**
 * Thin wrapper that runs i18next post-init background work. The
 * synchronous init at the top of `./i18n-init-once.ts` already wired
 * `initReactI18next` and seeded bundled resources with `lng: "en"`
 * before the first story renders, so this boundary only:
 *
 *   1. `ensureI18nInitialized` — awaits the production-side init for
 *      any document-level side effects (e.g. setting
 *      `document.documentElement.lang`).
 *   2. `forceEnglishLocale` — pins the language to English so story
 *      screenshots are deterministic.
 *
 * The stored-preference upgrade is deliberately NOT run here: in
 * Storybook there is no real stored locale, so it always resolved to
 * the CEP default (`ja`) and flipped the UI language *after* mount —
 * `useTranslation` subscribers re-rendered in Japanese while
 * `i18n.t` calls evaluated during render kept the previous language,
 * producing the ja/en mixing seen across captures (#467).
 *
 * No `setReady` re-render trick is needed anymore — first-paint
 * translations are already correct because the sync init happened at
 * module load time, before any decorator or story mounted.
 */
const I18nBoundary = ({ children }: { children: ReactNode }) => {
	useEffect(() => {
		ensureI18nInitialized(window)
			.then(() => forceEnglishLocale())
			.catch((err) => {
				// Initialization failed (likely CEP file API missing).
				// Surface as a console warning so the developer knows
				// why translation keys may appear instead of copy.
				console.warn("[storybook] i18n upgrade failed:", err);
			});
	}, []);
	return <>{children}</>;
};

export const I18nDecorator: Decorator = (Story) => (
	<I18nBoundary>
		<Story />
	</I18nBoundary>
);
