import {
	readThemeCss,
	readThemeCssStrict,
	writeThemeCss,
} from "@/management/storage";
import { DEFAULT_THEME } from "@/management/style/default-values";
import {
	getThemeOverrideCacheRevision,
	setThemeOverrideCache,
} from "@/management/style/theme-overrides-cache";

const allowedKeys = new Set(Object.keys(DEFAULT_THEME));

export const sanitizeCepShellThemeOverrides = (
	raw: unknown,
): Partial<Record<string, string>> => {
	if (!raw || typeof raw !== "object") {
		return {};
	}
	const out: Partial<Record<string, string>> = {};
	for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
		if (!allowedKeys.has(k) || typeof v !== "string") {
			continue;
		}
		const t = v.trim();
		if (t !== "") {
			out[k] = t;
		}
	}
	return out;
};

/** Normalized form for persistence with keys equal to DEFAULT discarded */
export const buildPrunedCepShellThemeRecord = (
	cleaned: Partial<Record<string, string>>,
): Record<string, string> => {
	const pruned: Record<string, string> = {};
	for (const [k, v] of Object.entries(cleaned)) {
		if (v !== undefined && v !== DEFAULT_THEME[k]) {
			pruned[k] = v;
		}
	}
	return pruned;
};

/** Extract overrides record from CSS text (parse `:root { --key: val; }`) */
const parseCepShellThemeCssText = (
	cssText: string,
): Partial<Record<string, string>> => {
	const overrides: Partial<Record<string, string>> = {};
	if (!cssText || typeof cssText !== "string") {
		return overrides;
	}
	const rootMatch = cssText.match(/:root\s*\{([^}]*)\}/s);
	if (!rootMatch?.[1]) {
		return overrides;
	}
	const cssProps = rootMatch[1];
	const tokenPattern = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
	for (const match of cssProps.matchAll(tokenPattern)) {
		const [, key, value] = match;
		if (key && value) {
			overrides[key.trim()] = value.trim();
		}
	}
	return overrides;
};

/**
 * Generate CSS text in `:root { --key: val; ... }` format from overrides record.
 * Saves pruned form with values equal to DEFAULT omitted.
 * Only user token declarations are persisted — the semantic `--color-*` bridge
 * is injected at apply time (`themeVarsToCssBlock`), not stored in the file.
 */
const buildCepShellThemeCssText = (
	overrides: Partial<Record<string, string>>,
): string => {
	const pruned = buildPrunedCepShellThemeRecord(overrides);
	if (Object.keys(pruned).length === 0) {
		return "";
	}
	const declarations = Object.entries(pruned)
		.map(([key, val]) => `  --${key}: ${val};`)
		.join("\n");
	return `:root {\n${declarations}\n}`;
};

/** Parse + sanitize + prune `theme.css` text into the persisted override record. */
const overridesFromThemeCssText = (cssText: string): Record<string, string> =>
	buildPrunedCepShellThemeRecord(
		sanitizeCepShellThemeOverrides(parseCepShellThemeCssText(cssText)),
	);

/**
 * Apply a disk snapshot to the sync cache only when no save/live merge
 * landed while the host read was in flight; otherwise the snapshot is
 * stale and would clobber newer state (Issue #91 review).
 */
const cacheSnapshotIfCurrent = (
	revisionAtRead: number,
	pruned: Record<string, string>,
): void => {
	if (getThemeOverrideCacheRevision() === revisionAtRead) {
		setThemeOverrideCache(pruned);
	}
};

export const loadCepShellThemeFromCss = async (
	win: Window,
): Promise<Partial<Record<string, string>> | null> => {
	const revisionAtRead = getThemeOverrideCacheRevision();
	try {
		const cssText = await readThemeCss(win);
		if (cssText === null || cssText === undefined) {
			return null;
		}
		if (cssText.trim() === "") {
			cacheSnapshotIfCurrent(revisionAtRead, {});
			return {};
		}
		const pruned = overridesFromThemeCssText(cssText);
		cacheSnapshotIfCurrent(revisionAtRead, pruned);
		return pruned;
	} catch {
		return null;
	}
};

/**
 * Strict variant for read-modify-write callers (grid metrics, token editor).
 * Unlike {@link loadCepShellThemeFromCss}, I/O errors reject instead of
 * returning `null`: treating an unreadable `theme.css` as empty would make
 * the next write erase every persisted override (Issue #91 review).
 * Returns `{}` only when the file is genuinely absent or blank.
 */
export const loadCepShellThemeOverridesForWrite = async (
	win: Window,
): Promise<Record<string, string>> => {
	const revisionAtRead = getThemeOverrideCacheRevision();
	const cssText = await readThemeCssStrict(win);
	if (!cssText || cssText.trim() === "") {
		cacheSnapshotIfCurrent(revisionAtRead, {});
		return {};
	}
	const pruned = overridesFromThemeCssText(cssText);
	cacheSnapshotIfCurrent(revisionAtRead, pruned);
	return pruned;
};

/**
 * Update the sync override cache from raw `theme.css` text without a host
 * round-trip. Used by restore paths that write the file directly
 * (workspace backup import) so subsequent theme re-injection sees the
 * restored values.
 */
export const cacheCepShellThemeOverridesFromCssText = (
	cssText: string,
): void => {
	if (!cssText || cssText.trim() === "") {
		setThemeOverrideCache({});
		return;
	}
	const pruned = buildPrunedCepShellThemeRecord(
		sanitizeCepShellThemeOverrides(parseCepShellThemeCssText(cssText)),
	);
	setThemeOverrideCache(pruned);
};

export const saveCepShellThemeToCss = async (
	win: Window,
	overrides: Partial<Record<string, string>>,
): Promise<void> => {
	const cssText = buildCepShellThemeCssText(overrides);
	// The cache must never run ahead of the file: update it only after the
	// write is durable, so a rejected write cannot leave re-injection
	// applying values that were never persisted (Issue #91 review).
	await writeThemeCss(win, cssText);
	setThemeOverrideCache(
		buildPrunedCepShellThemeRecord(sanitizeCepShellThemeOverrides(overrides)),
	);
};

/** Save overrides (keys equal to DEFAULT are not persisted) */
const _saveCepShellThemeToCssSync = async (
	win: Window,
	overrides: Partial<Record<string, string>>,
): Promise<void> => {
	await saveCepShellThemeToCss(win, overrides);
};

/** Reset CSS file to empty state */
export const clearCepShellThemeStorage = async (win: Window): Promise<void> => {
	await saveCepShellThemeToCss(win, {});
};
