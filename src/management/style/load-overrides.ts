/**
 * Sync accessor for persisted shell theme overrides.
 *
 * The authoritative store is `styles/theme.css` under the managed root,
 * which is read asynchronously via the CEP host (`loadCepShellThemeFromCss`).
 * Synchronous callers (theme re-injection on boot/resize recovery) read the
 * per-window cache that those async loads keep up to date — see
 * `theme-overrides-cache.ts` and Issue #91.
 */
import { getThemeOverrideCache } from "@/management/style/theme-overrides-cache";

export const loadThemeOverrides = (): Partial<Record<string, string>> =>
	getThemeOverrideCache();
