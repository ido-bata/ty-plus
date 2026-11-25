/**
 * Locale-aware string resolution for E2E cases (Issue #628).
 *
 * The live panels render `i18n.t()` output, so English-literal selectors
 * (`button` text "Create", `aria-label="Run preset"`,
 * `placeholder="Enter name..."`) only match an `en` locale. The AE host
 * under test runs `ja`, which made whole case chains fail on selectors
 * that can never match.
 *
 * This module reads the same locale JSON files the bundle ships
 * (`src/management/i18n/locales/<lang>/<ns>.json`) and resolves the keys
 * the cases assert on, so selectors follow the surface's actual locale
 * (`document.documentElement.lang`) instead of assuming English.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { E2EContext } from "../ctx";
import type { LiveSurface } from "../surfaces";

const LOCALES_DIR = path.resolve(
	import.meta.dir,
	"../../../../src/management/i18n/locales",
);

const SUPPORTED = new Set([
	"de",
	"en",
	"es",
	"fr",
	"it",
	"ja",
	"ko",
	"pt",
	"ru",
	"zh",
]);

type LocaleTree = Record<string, unknown>;

const nsCache = new Map<string, LocaleTree | null>();

const loadNamespace = async (
	lang: string,
	ns: string,
): Promise<LocaleTree | null> => {
	const key = `${lang}/${ns}`;
	const cached = nsCache.get(key);
	if (cached !== undefined) return cached;
	let tree: LocaleTree | null = null;
	try {
		tree = JSON.parse(
			await readFile(path.join(LOCALES_DIR, lang, `${ns}.json`), "utf8"),
		) as LocaleTree;
	} catch {
		tree = null;
	}
	nsCache.set(key, tree);
	return tree;
};

const walk = (tree: LocaleTree, parts: string[]): unknown => {
	let cur: unknown = tree;
	for (const part of parts) {
		if (cur === null || typeof cur !== "object") return undefined;
		cur = (cur as LocaleTree)[part];
	}
	return cur;
};

/**
 * Resolve `"ns:dotted.key"` (the same shape `i18n.t()` consumes) against
 * the locale files. Returns `null` when the key or locale is unknown —
 * callers treat that as "no localized expectation", never as a match.
 */
export const resolveLocaleKey = async (
	lang: string,
	key: string,
): Promise<string | null> => {
	const sep = key.indexOf(":");
	if (sep <= 0) return null;
	const ns = key.slice(0, sep);
	const rest = key.slice(sep + 1);
	const tree = await loadNamespace(lang, ns);
	if (!tree) return null;
	const value = walk(tree, rest.split("."));
	return typeof value === "string" && value.length > 0 ? value : null;
};

/** Effective UI locale of a live surface, normalized to a shipped locale. */
export const surfaceLang = async (
	ctx: E2EContext,
	surface: LiveSurface,
): Promise<string> => {
	try {
		const raw = String(
			(await ctx.evalJs(surface, `document.documentElement.lang`)) ?? "",
		)
			.trim()
			.toLowerCase();
		const base = raw.split("-")[0] ?? "";
		return SUPPORTED.has(base) ? base : "en";
	} catch {
		return "en";
	}
};

/**
 * Split an i18n template containing `{{name}}` into the literal prefix
 * and suffix around the placeholder, for in-page aria-label matching.
 * Returns `null` for templates without the placeholder.
 */
export const templateAffixes = (
	template: string | null,
): { pre: string; post: string } | null => {
	if (!template?.includes("{{name}}")) return null;
	const [pre = "", post = ""] = template.split("{{name}}");
	return { pre, post };
};
