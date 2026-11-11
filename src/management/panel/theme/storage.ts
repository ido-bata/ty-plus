import { readThemeCss, writeThemeCss } from "@/management/storage";
import { DEFAULT_THEME } from "@/management/style/default-values";
import { themeVarsToCssBlock } from "@/management/style/merge";

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
 */
const buildCepShellThemeCssText = (
	overrides: Partial<Record<string, string>>,
): string => {
	const pruned = buildPrunedCepShellThemeRecord(overrides);
	if (Object.keys(pruned).length === 0) {
		return "";
	}
	return `:root {\n${themeVarsToCssBlock(pruned)}\n}`;
};

export const loadCepShellThemeFromCss = async (
	win: Window,
): Promise<Partial<Record<string, string>> | null> => {
	try {
		const cssText = await readThemeCss(win);
		if (!cssText) {
			return null;
		}
		const parsed = parseCepShellThemeCssText(cssText);
		return buildPrunedCepShellThemeRecord(
			sanitizeCepShellThemeOverrides(parsed),
		);
	} catch {
		return null;
	}
};

export const saveCepShellThemeToCss = async (
	win: Window,
	overrides: Partial<Record<string, string>>,
): Promise<void> => {
	const cssText = buildCepShellThemeCssText(overrides);
	await writeThemeCss(win, cssText);
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
