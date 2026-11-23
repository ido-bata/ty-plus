/**
 * i18n-placeholders.ts
 *
 * Verifies that every translated leaf carries the same `{{variable}}`
 * interpolation placeholders as the canonical English value. A locale that
 * drops or renames a placeholder renders the literal `{{name}}` (or loses
 * the interpolated value) at runtime — a bug the key-coverage check cannot
 * see because the key still resolves.
 *
 * Comparison is per exact key path (plural suffixes compare like-for-like),
 * so `_one`/`_few`/`_other` forms are checked independently.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const TARGETS: { name: string; dir: string }[] = [
	{ name: "app", dir: path.join(ROOT, "src/management/i18n/locales") },
	{ name: "web", dir: path.join(ROOT, "apps/web/src/i18n/locales") },
];

const PLACEHOLDER_RE = /\{\{\s*([A-Za-z0-9_$]+)\s*\}\}/g;

const placeholders = (value: string): Set<string> => {
	const out = new Set<string>();
	for (const m of value.matchAll(PLACEHOLDER_RE)) out.add(m[1]);
	return out;
};

/** Flatten a locale JSON tree into `a.b.c -> string` leaves. */
const flatten = (
	node: unknown,
	prefix: string,
	out: Map<string, string>,
): void => {
	if (typeof node === "string") {
		out.set(prefix, node);
		return;
	}
	if (node == null || typeof node !== "object") return;
	for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
		flatten(v, prefix ? `${prefix}.${k}` : k, out);
	}
};

const loadLocale = async (dir: string, locale: string) => {
	const base = path.join(dir, locale);
	const merged = new Map<string, string>();
	for (const ent of await readdir(base)) {
		if (!ent.endsWith(".json")) continue;
		const ns = ent.replace(/\.json$/, "");
		const data = JSON.parse(await readFile(path.join(base, ent), "utf8")) as Record<
			string,
			unknown
		>;
		const flat = new Map<string, string>();
		flatten(data, "", flat);
		for (const [k, v] of flat) merged.set(`${ns}:${k}`, v);
	}
	return merged;
};

export const main = async (): Promise<number> => {
	const findings: string[] = [];
	for (const target of TARGETS) {
		let locales: string[] = [];
		try {
			locales = (await readdir(target.dir, { withFileTypes: true }))
				.filter((e) => e.isDirectory())
				.map((e) => e.name);
		} catch {
			continue;
		}
		if (!locales.includes("en")) continue;
		const en = await loadLocale(target.dir, "en");
		for (const locale of locales) {
			if (locale === "en") continue;
			const translated = await loadLocale(target.dir, locale);
			for (const [key, enValue] of en) {
				const tv = translated.get(key);
				if (tv === undefined) continue; // coverage check owns missing keys
				const want = placeholders(enValue);
				const got = placeholders(tv);
				const missing = [...want].filter((v) => !got.has(v));
				const extra = [...got].filter((v) => !want.has(v));
				if (missing.length || extra.length) {
					findings.push(
						`${target.name}/${locale} ${key}: en={${[...want].join(",")}} ${locale}={${[...got].join(",")}}`,
					);
				}
			}
		}
	}
	if (findings.length === 0) {
		console.log(
			"i18n placeholder check PASSED — interpolation variables match en.",
		);
		return 0;
	}
	console.error(
		`i18n placeholder check FAILED — ${findings.length} mismatch(es).`,
	);
	for (const f of findings) console.error(`  ${f}`);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
