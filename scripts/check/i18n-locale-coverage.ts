import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_LOCALES_DIR = path.resolve("src/management/i18n/locales");
export const DEFAULT_SRC_DIR = path.resolve("src");
export const DEFAULT_NON_EN_LOCALES = [
	"de",
	"es",
	"fr",
	"it",
	"ja",
	"ko",
	"pt",
	"ru",
	"zh",
];

export interface LocaleKeys {
	[namespace: string]: string[];
}

export interface CoverageOptions {
	locales?: string[];
	strictEnCanonical?: boolean;
	srcDir?: string;
}

export interface CoverageResult {
	errors: string[];
	warnings: string[];
}

export interface TReference {
	file: string;
	line: number;
	key: string;
	kind: "t-call" | "nameKey";
	namespaces?: string[];
	prefixes?: string[];
}

const getAllKeys = (obj: unknown, prefix = ""): string[] => {
	if (typeof obj !== "object" || obj === null) return [];
	const out: string[] = [];
	for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (typeof v === "object" && v !== null && !Array.isArray(v)) {
			out.push(...getAllKeys(v, key));
		} else {
			out.push(key);
		}
	}
	return out;
};

const isLeafValue = (value: unknown): boolean =>
	value === null ||
	typeof value === "string" ||
	typeof value === "number" ||
	typeof value === "boolean";

const collectTodoValues = (
	obj: unknown,
	prefix: string,
): { key: string; value: string }[] => {
	if (typeof obj !== "object" || obj === null) return [];
	const out: { key: string; value: string }[] = [];
	for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (isLeafValue(v) && typeof v === "string" && v.startsWith("TODO: ")) {
			out.push({ key, value: v });
			continue;
		}
		if (typeof v === "object" && v !== null && !Array.isArray(v)) {
			out.push(...collectTodoValues(v, key));
		}
	}
	return out;
};

const readJsonMaps = async (
	dir: string,
): Promise<Record<string, Record<string, unknown>>> => {
	const maps: Record<string, Record<string, unknown>> = {};
	const collectFromDir = async (
		current: string,
		namespacePrefix = "",
	): Promise<void> => {
		try {
			const entries = await readdir(current, { withFileTypes: true });
			for (const ent of entries) {
				const full = path.join(current, ent.name);
				if (ent.isDirectory()) {
					// Recurse into subdirs (defensive — common.json used to live in core/ subdir)
					await collectFromDir(full, `${namespacePrefix}${ent.name}.`);
					continue;
				}
				if (ent.isFile() && ent.name.endsWith(".json")) {
					const namespace = `${namespacePrefix}${ent.name.replace(/\.json$/, "")}`;
					const content = await readFile(full, "utf8");
					maps[namespace] = JSON.parse(content) as Record<string, unknown>;
				}
			}
		} catch {
			// Locale dir doesn't exist
		}
	};
	const exists = await stat(dir)
		.then(() => true)
		.catch(() => false);
	if (exists) {
		await collectFromDir(dir);
	}
	return maps;
};

export const readLocaleKeys = async (
	localeDir: string,
): Promise<LocaleKeys> => {
	const maps = await readJsonMaps(localeDir);
	const keys: LocaleKeys = {};
	for (const [namespace, parsed] of Object.entries(maps)) {
		keys[namespace] = getAllKeys(parsed).sort();
	}
	return keys;
};

export const readLocaleJson = async (
	localeDir: string,
): Promise<Record<string, Record<string, unknown>>> => readJsonMaps(localeDir);

const collectLocaleTodoValues = async (
	localeDir: string,
): Promise<{ namespace: string; key: string; value: string }[]> => {
	const out: { namespace: string; key: string; value: string }[] = [];
	const maps = await readJsonMaps(localeDir);
	// Re-derive namespaces from the maps (readJsonMaps already namespaces files).
	for (const [namespace, parsed] of Object.entries(maps)) {
		for (const { key, value } of collectTodoValues(parsed, "")) {
			out.push({ namespace, key, value });
		}
	}
	return out;
};

const resolveJsonPath = (
	root: Record<string, unknown>,
	dotted: string,
): unknown => {
	let cursor: unknown = root;
	for (const part of dotted.split(".")) {
		if (
			cursor === null ||
			typeof cursor !== "object" ||
			Array.isArray(cursor)
		) {
			return undefined;
		}
		cursor = (cursor as Record<string, unknown>)[part];
		if (cursor === undefined) {
			return undefined;
		}
	}
	return cursor;
};

const T_CALL_RE = /\bt\(\s*["']([^"'`]+)["']\s*[,)]/g;
const NAMEKEY_RE = /nameKey:\s*["'](widgets\.[A-Za-z0-9_.]+)["']/g;
const USE_TRANSLATION_RE =
	/useTranslation\(\s*(\[[^\]]*\]|["'][^"']+["'])?\s*(?:,\s*\{[^}]*\})?\)/;
const KEY_PREFIX_RE = /keyPrefix:\s*["']([^"']+)["']/g;
const STRING_LIST_RE = /["']([^"']+)["']/g;

const SKIP_SRC_DIRS = new Set(["node_modules", "dist"]);
const SKIP_SRC_FILE_SUFFIXES = [".test.ts", ".test.tsx", ".stories.tsx"];

const collectSourceFiles = async (srcDir: string): Promise<string[]> => {
	const out: string[] = [];
	const walk = async (dir: string): Promise<void> => {
		let entries: Dirent[] | undefined;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		if (!entries) return;
		for (const ent of entries) {
			if (SKIP_SRC_DIRS.has(ent.name)) continue;
			const full = path.join(dir, ent.name);
			if (ent.isDirectory()) {
				if (ent.name === "locales" && dir.endsWith(path.join("i18n"))) continue;
				await walk(full);
				continue;
			}
			if (
				ent.isFile() &&
				(full.endsWith(".ts") || full.endsWith(".tsx")) &&
				!SKIP_SRC_FILE_SUFFIXES.some((suffix) => ent.name.endsWith(suffix))
			) {
				out.push(full);
			}
		}
	};
	await walk(srcDir);
	return out.sort();
};

const declaredNamespaces = (src: string): string[] => {
	const match = USE_TRANSLATION_RE.exec(src);
	if (!match?.[1]) return [];
	const raw = match[1].trim();
	if (raw.startsWith("[")) {
		return Array.from(raw.matchAll(STRING_LIST_RE), (m) => m[1] ?? "").filter(
			(s) => s.length > 0,
		);
	}
	const single = STRING_LIST_RE.exec(raw);
	return single?.[1] ? [single[1]] : [];
};

const declaredKeyPrefixes = (src: string): string[] =>
	Array.from(src.matchAll(KEY_PREFIX_RE), (m) => m[1] ?? "").filter(
		(s) => s.length > 0,
	);

export const collectTKeyReferences = async (
	srcDir: string,
	enNamespaces: string[],
): Promise<TReference[]> => {
	const refs: TReference[] = [];
	for (const file of await collectSourceFiles(srcDir)) {
		const src = await readFile(file, "utf8");
		const namespaces = declaredNamespaces(src).filter((n) =>
			enNamespaces.includes(n),
		);
		const prefixes = declaredKeyPrefixes(src);
		const pushLiteral = (
			kind: TReference["kind"],
			key: string,
			index: number,
		): void => {
			refs.push({
				file: path.relative(process.cwd(), file),
				line: src.slice(0, index).split("\n").length,
				key,
				kind,
				namespaces,
				prefixes,
			});
		};
		for (const match of src.matchAll(T_CALL_RE)) {
			if (match[1] !== undefined)
				pushLiteral("t-call", match[1], match.index ?? 0);
		}
		for (const match of src.matchAll(NAMEKEY_RE)) {
			if (match[1] !== undefined)
				pushLiteral("nameKey", match[1], match.index ?? 0);
		}
	}
	return refs;
};

const resolveTReference = (
	enMaps: Record<string, Record<string, unknown>>,
	ref: TReference,
): boolean => {
	const candidates: [string, string][] = [];
	if (ref.key.includes(":")) {
		const [ns, ...rest] = ref.key.split(":");
		if (ns && enMaps[ns]) candidates.push([ns, rest.join(":")]);
	} else {
		const declared = ref.namespaces ?? [];
		const prefixes = ref.prefixes ?? [];
		// A leading segment matching an en namespace is the namespace itself
		// (e.g. nameKey "widgets.align.name" or namespaced t("widgets:menu.name")
		// after prefix stripping). Try it before any fallback pool.
		const [head, ...tail] = ref.key.split(".");
		if (head && tail.length > 0 && enMaps[head]) {
			candidates.push([head, tail.join(".")]);
		}
		const pools = declared.length > 0 ? declared : Object.keys(enMaps);
		for (const ns of pools) {
			candidates.push([ns, ref.key]);
			for (const prefix of prefixes) {
				candidates.push([ns, `${prefix}.${ref.key}`]);
			}
		}
		if (declared.length > 0) {
			for (const ns of Object.keys(enMaps)) {
				if (!declared.includes(ns)) candidates.push([ns, ref.key]);
			}
		}
	}
	return candidates.some(([ns, dotted]) => {
		const root = enMaps[ns];
		if (!root) return false;
		if (isLeafValue(resolveJsonPath(root, dotted))) return true;
		// i18next plural resolution: t("key", { count }) reads key_one/_other/…
		for (const suffix of ["_zero", "_one", "_two", "_few", "_many", "_other"]) {
			if (isLeafValue(resolveJsonPath(root, `${dotted}${suffix}`))) return true;
		}
		return false;
	});
};

const PLURAL_SUFFIX_RE = /_(zero|one|two|few|many|other)$/;

/** CLDR cardinal plural categories per supported locale (Intl.PluralRules). */
const PLURAL_CATEGORIES: Record<string, string[]> = {
	en: ["one", "other"],
	ja: ["other"],
	de: ["one", "other"],
	fr: ["one", "many", "other"],
	zh: ["other"],
	es: ["one", "many", "other"],
	ko: ["other"],
	pt: ["one", "many", "other"],
	it: ["one", "many", "other"],
	ru: ["one", "few", "many", "other"],
};

const partitionPluralKeys = (
	keys: string[],
): { normal: string[]; families: Map<string, Set<string>> } => {
	const normal: string[] = [];
	const families = new Map<string, Set<string>>();
	for (const k of keys) {
		const m = k.match(PLURAL_SUFFIX_RE);
		if (m) {
			const base = k.slice(0, k.length - m[0].length);
			if (!families.has(base)) families.set(base, new Set());
			families.get(base)!.add(m[1]);
		} else {
			normal.push(k);
		}
	}
	return { normal, families };
};

export const checkCoverage = async (
	localesDir: string = DEFAULT_LOCALES_DIR,
	opts: CoverageOptions = {},
): Promise<CoverageResult> => {
	const locales = opts.locales ?? DEFAULT_NON_EN_LOCALES;
	const strict = opts.strictEnCanonical ?? false;
	const enDir = path.join(localesDir, "en");
	const enKeys = await readLocaleKeys(enDir);

	const errors: string[] = [];
	const warnings: string[] = [];

	for (const locale of locales) {
		const localeDir = path.join(localesDir, locale);
		const localeKeys = await readLocaleKeys(localeDir);

		for (const [namespace, expectedKeys] of Object.entries(enKeys)) {
			const actualKeys = localeKeys[namespace] ?? [];

			// i18next plural families: keys ending in a CLDR plural suffix are
			// compared by required categories per locale, not by exact key set.
			const { normal: enNormal, families: enFamilies } =
				partitionPluralKeys(expectedKeys);
			const { normal: locNormal, families: locFamilies } =
				partitionPluralKeys(actualKeys);
			const locKeySet = new Set(actualKeys);

			// Missing non-plural keys (this is the real error)
			const missing = enNormal.filter((k) => !locNormal.includes(k));
			// Missing required plural forms for this locale's CLDR categories
			const requiredForms = PLURAL_CATEGORIES[locale] ?? ["other"];
			const missingPlural: string[] = [];
			for (const base of enFamilies.keys()) {
				for (const form of requiredForms) {
					const k = `${base}_${form}`;
					if (!locKeySet.has(k)) missingPlural.push(k);
				}
			}
			const allMissing = [...missing, ...missingPlural];
			if (allMissing.length > 0) {
				errors.push(
					`${locale}/${namespace}: missing ${allMissing.length} key(s): ${allMissing.join(", ")}`,
				);
			}

			// Extra keys within namespaces that exist in en.
			// Default stage: allowed with a visibility warning. Strict en-canonical
			// stage: en is the exact key-set authority for non-plural keys; extra
			// plural variants are tolerated when their base exists in en.
			const enBaseSet = new Set([
				...enNormal,
				...enFamilies.keys(),
			]);
			const extraNormal = locNormal.filter((k) => !enNormal.includes(k));
			const extraPlural = [...locFamilies.entries()].flatMap(
				([base, suffixes]) =>
					enBaseSet.has(base)
						? []
						: [...suffixes].map((s) => `${base}_${s}`),
			);
			const extra = [...extraNormal, ...extraPlural];
			if (extra.length > 0) {
				const message = `${locale}/${namespace}: ${extra.length} extra key(s)${strict ? "" : " (allowed)"}: ${extra.join(", ")}`;
				if (strict) {
					errors.push(message);
				} else {
					warnings.push(message);
				}
			}
		}

		// Check for extra namespaces not in en (extra individual keys within a shared namespace are allowed)
		for (const namespace of Object.keys(localeKeys)) {
			if (!enKeys[namespace]) {
				errors.push(`${locale}/${namespace}: extra namespace (not in en)`);
			}
		}

		// Check for TODO: placeholders left in non-English locales
		const todoHits = await collectLocaleTodoValues(localeDir);
		if (todoHits.length > 0) {
			const samples = todoHits
				.slice(0, 10)
				.map((h) => `${h.namespace}.${h.key}`)
				.join(", ");
			errors.push(
				`${locale}: ${todoHits.length} "TODO: " placeholder value(s) remain (samples: ${samples}${todoHits.length > 10 ? ", …" : ""})`,
			);
		}
	}

	if (strict) {
		const enMaps = await readLocaleJson(enDir);
		const enNamespaces = Object.keys(enMaps);
		const srcDir = opts.srcDir ?? DEFAULT_SRC_DIR;
		const refs = await collectTKeyReferences(srcDir, enNamespaces);
		for (const ref of refs) {
			if (!resolveTReference(enMaps, ref)) {
				errors.push(
					`${ref.file}:${ref.line}: ${ref.kind} "${ref.key}" has no leaf in en/`,
				);
			}
		}
	}

	return { errors, warnings };
};

const argValue = (name: string): string | undefined => {
	const prefix = `--${name}=`;
	const hit = process.argv.find((a) => a.startsWith(prefix));
	return hit?.slice(prefix.length);
};

const main = async (): Promise<void> => {
	const strict = process.argv.includes("--strict-en-canonical");
	const localesDir = argValue("locales-dir") ?? DEFAULT_LOCALES_DIR;
	const srcDir = argValue("src-dir") ?? DEFAULT_SRC_DIR;
	const { errors, warnings } = await checkCoverage(localesDir, {
		strictEnCanonical: strict,
		srcDir,
	});
	for (const w of warnings) {
		console.warn(`  ${w}`);
	}
	if (errors.length > 0) {
		console.error("i18n locale coverage check FAILED:\n");
		for (const e of errors) {
			console.error(`  ${e}`);
		}
		console.error();
		if (strict) {
			console.error("Strict en-canonical stage failed.");
			console.error();
		}
		process.exit(1);
	}

	console.log("i18n locale coverage check PASSED — all locales complete.");
};

if (import.meta.main) {
	await main();
}
