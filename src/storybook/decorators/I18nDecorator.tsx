import type { Decorator } from "@storybook/react";
import { type ReactNode, useEffect } from "react";

import {
	ensureI18nInitialized,
	forceEnglishLocale,
	upgradeLocaleFromStoredPreference,
} from "./i18n-init-once";

/**
 * Thin wrapper that runs i18next post-init background upgrades. The
 * synchronous init at the top of `./i18n-init-once.ts` already wired
 * `initReactI18next` and seeded bundled resources before the first
 * story renders, so this boundary only kicks off two no-op upgrades:
 *
 *   1. `ensureI18nInitialized` — awaits the production-side init for
 *      any document-level side effects (e.g. setting
 *      `document.documentElement.lang`).
 *   2. `forceEnglishLocale` — pins the language to English so story
 *      screenshots are deterministic.
 *   3. `upgradeLocaleFromStoredPreference` — fire-and-forget upgrade
 *      to the user's stored locale if it differs. Doesn't block paint.
 *
 * No `setReady` re-render trick is needed anymore — first-paint
 * translations are already correct because the sync init happened at
 * module load time, before any decorator or story mounted.
 */
const I18nBoundary = ({ children }: { children: ReactNode }) => {
	useEffect(() => {
		ensureI18nInitialized(window)
			.then(() => forceEnglishLocale())
			.then(() => upgradeLocaleFromStoredPreference(window))
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
