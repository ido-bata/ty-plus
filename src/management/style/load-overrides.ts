/**
 * Sync stub for loading theme overrides.
 * The actual loading is done via loadCepShellThemeFromCss (async) in ThemeProvider.
 * This exists for callers that expect a sync return value.
 */
export const loadThemeOverrides = (): Partial<Record<string, string>> => ({});
