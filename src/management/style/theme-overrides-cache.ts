/**
 * Synchronous cache of persisted shell theme overrides (`styles/theme.css`).
 *
 * Theme application (`applyCepShellTheme`) is synchronous and runs on every
 * CEP surface boot plus periodic re-injection (viewport resync, style
 * recovery). The persisted overrides live behind an async host read, so
 * without this cache every re-injection rebuilt `:root` from DEFAULT_THEME
 * and wiped values loaded moments earlier (Issue #91).
 *
 * The cache is populated by `loadCepShellThemeFromCss` / `saveCepShellThemeToCss`
 * and by live theme broadcasts on receiving surfaces. It is per-window module
 * state: each CEP surface loads the file itself on boot.
 */

type ThemeOverrides = Partial<Record<string, string>>;

const toCleanRecord = (overrides: ThemeOverrides): Record<string, string> => {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(overrides)) {
		if (typeof value === "string" && value !== "") {
			out[key] = value;
		}
	}
	return out;
};

let cachedOverrides: Record<string, string> = {};

/**
 * Bumped on every cache mutation. Async loaders capture the revision before
 * their host read and skip the cache update when it changed mid-flight, so a
 * slow disk snapshot cannot overwrite a newer live/save update (Issue #91
 * review).
 */
let cacheRevision = 0;

export const getThemeOverrideCacheRevision = (): number => cacheRevision;

const bumpRevision = (): void => {
	cacheRevision += 1;
};

export const getThemeOverrideCache = (): ThemeOverrides => ({
	...cachedOverrides,
});

export const setThemeOverrideCache = (overrides: ThemeOverrides): void => {
	cachedOverrides = toCleanRecord(overrides);
	bumpRevision();
};

/** Merge a delta (e.g. a `themeLive` payload) into the cached overrides. */
export const mergeThemeOverrideCache = (patch: ThemeOverrides): void => {
	cachedOverrides = { ...cachedOverrides, ...toCleanRecord(patch) };
	bumpRevision();
};

export const clearThemeOverrideCache = (): void => {
	cachedOverrides = {};
	bumpRevision();
};
