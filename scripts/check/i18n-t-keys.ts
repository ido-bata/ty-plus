/**
 * i18n-t-keys.ts
 *
 * Complements i18n-locale-coverage.ts (which verifies locale files
 * match each other) by verifying that translation keys referenced from
 * source code actually resolve against the canonical English resources.
 *
 * Checks:
 *  - every literal `t("…")` / `i18n.t("…")` first argument resolves in the
 *    English resources for the effective namespace
 *    (`ns:key` → that namespace; bare key → the file's useTranslation()
 *    namespace, falling back to the area default: `common` for src/,
 *    `web` for apps/web, either for packages/ui)
 *  - `defaultValue` literals inside t() options must equal the English
 *    resource value, so fallbacks cannot silently drift from canonical copy
 *  - plural lookups (`count` option or `_other`-style keys) accept the
 *    locale plural suffix variants
 *  - stale locale codes (zh-CN / zh-TW / en-US / ja-JP …) must not appear
 *    in UI source — locale lists must derive from the canonical set
 *
 * Dynamic keys (template literals, variables) are out of scope; they are
 * audited separately.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const APP_LOCALES = path.join(ROOT, "src/management/i18n/locales/en");
const WEB_LOCALES = path.join(ROOT, "apps/web/src/i18n/locales/en");

const EXCLUDE_FILE =
	/\.(test|spec|stories|contract)\.[tj]sx?$|\.gen\.ts$|routeTree\.gen\.ts$|\.d\.ts$|\.stories\.|\.ext\.tsx?$/;
const EXCLUDE_DIR = /node_modules|styled-system|locales|\/i18n\/locales/;

const STALE_LOCALE_RE =
	/\b(?:zh-CN|zh-TW|zh_Hans|zh_Hant|en-US|en-GB|ja-JP|ko-KR|de-DE|fr-FR|es-ES)\b/g;

const CALL_RE = /(?:\bi18n\.t|\bt)\(\s*(["'])([^"'`]+)\1/g;
const USE_T_RE = /useTranslation\(\s*(?:\[\s*)?(["'])([\w-]+)\1/g;
const DEFAULT_NS: Record<string, string> = {
	"src/": "common",
	"packages/ui/": "common",
	"apps/web/": "web",
};

type Resources = Map<string, Record<string, unknown>>;

const loadResources = async (dir: string): Promise<Resources> => {
	const out: Resources = new Map();
	for (const ent of await readdir(dir)) {
		if (!ent.endsWith(".json")) continue;
		const ns = ent.replace(/\.json$/, "");
		out.set(
			ns,
			JSON.parse(await readFile(path.join(dir, ent), "utf8")) as Record<
				string,
				unknown
			>,
		);
	}
	return out;
};

const lookup = (
	resources: Resources,
	ns: string,
	keyPath: string,
): string | undefined => {
	const root = resources.get(ns);
	if (!root) return undefined;
	let cur: unknown = root;
	for (const seg of keyPath.split(".")) {
		if (cur == null || typeof cur !== "object") return undefined;
		cur = (cur as Record<string, unknown>)[seg];
	}
	return typeof cur === "string" ? cur : undefined;
};

const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"];

const resolveKey = (
	resources: Resources,
	ns: string,
	keyPath: string,
): string | undefined => {
	const direct = lookup(resources, ns, keyPath);
	if (direct !== undefined) return direct;
	for (const suffix of PLURAL_SUFFIXES) {
		const hit = lookup(resources, ns, `${keyPath}${suffix}`);
		if (hit !== undefined) return hit;
	}
	return undefined;
};

const walk = async (dir: string, out: string[]): Promise<void> => {
	let entries: import("node:fs").Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const ent of entries) {
		const full = path.join(dir, ent.name);
		if (ent.isDirectory()) {
			if (EXCLUDE_DIR.test(full)) continue;
			await walk(full, out);
		} else if (/\.tsx?$/.test(ent.name) && !EXCLUDE_FILE.test(ent.name)) {
			out.push(full);
		}
	}
};

interface Finding {
	file: string;
	line: number;
	kind: string;
	text: string;
}

const scanFile = async (
	file: string,
	resources: Resources,
): Promise<Finding[]> => {
	const rel = path.relative(ROOT, file).split(path.sep).join("/");
	const content = await readFile(file, "utf8");
	const findings: Finding[] = [];
	const srcLines = content.split("\n");
	const exemptRe = /\/\/\s*i18n-exempt\b|\{\/\*\s*\/\/\s*i18n-exempt\b/;
	const isExempt = (line: number) =>
		exemptRe.test(srcLines[line - 1] ?? "") ||
		exemptRe.test(srcLines[line - 2] ?? "");
	const push = (f: Finding) => {
		if (!isExempt(f.line)) findings.push(f);
	};

	// Stale locale codes — locale lists must come from canonical sources.
	for (const m of content.matchAll(STALE_LOCALE_RE)) {
		const idx = m.index ?? 0;
		push({
			file: rel,
			line: content.slice(0, idx).split("\n").length,
			kind: "stale-locale-code",
			text: m[0],
		});
	}

	// File-level default namespace from useTranslation().
	const fileNs = new Set<string>();
	for (const m of content.matchAll(USE_T_RE)) {
		fileNs.add(m[2]);
	}
	const hasUseTranslation = /\buseTranslation\s*\(/.test(content);
	const areaDefault =
		DEFAULT_NS[Object.keys(DEFAULT_NS).find((p) => rel.startsWith(p)) ?? ""] ??
		"common";

	for (const m of content.matchAll(CALL_RE)) {
		const isI18nT = m[0].startsWith("i18n.");
		const rawKey = m[2];
		if (rawKey.includes("{") || rawKey.includes("}")) continue;
		const line = content.slice(0, m.index ?? 0).split("\n").length;

		let ns = areaDefault;
		let keyPath = rawKey;
		const colon = rawKey.indexOf(":");
		if (colon > 0) {
			ns = rawKey.slice(0, colon);
			keyPath = rawKey.slice(colon + 1);
		}

		// Bare keys resolve via the hook's namespace(s) plus the i18next
		// fallback (`common`); i18n.t() bare keys use the instance default.
		// Files without useTranslation() receive t via props — accept any
		// namespace so prop-injected translators are still key-checked.
		const explicitNs = colon > 0 || isI18nT;
		const candidates = explicitNs
			? [ns === "" ? "common" : ns]
			: hasUseTranslation
				? [...fileNs, areaDefault, "common", "web"]
				: [...resources.keys()];
		const resolvedNs = candidates.find((c) =>
			resolveKey(resources, c, keyPath),
		);
		if (!resolvedNs) {
			push({
				file: rel,
				line,
				kind: "unresolved-t-key",
				text: rawKey,
			});
			continue;
		}

		// defaultValue drift check: the fallback literal must equal the
		// canonical English value for the resolved key. Scope the search to
		// this call's argument list — find the paren that closes t(...) so
		// form-field `defaultValue:` props on sibling objects don't leak in.
		const callStart = content.indexOf("(", m.index ?? 0); // at "("
		let depth = 0;
		let end = content.length;
		for (let i = callStart; i < content.length; i++) {
			const ch = content[i];
			if (ch === '"' || ch === "'" || ch === "`") {
				const quote = ch;
				i++;
				while (i < content.length && content[i] !== quote) {
					if (content[i] === "\\") i++;
					i++;
				}
				continue;
			}
			if (ch === "(") depth++;
			else if (ch === ")") {
				depth--;
				if (depth === 0) {
					end = i;
					break;
				}
			}
		}
		const after = content.slice(callStart, end);
		// Only `defaultValue:` at paren-depth 1 belongs to this call's
		// options object — nested t() calls carry their own.
		const depthAt = (pos: number): number => {
			let d = 0;
			for (let i = 0; i < pos; i++) {
				const ch = after[i];
				if (ch === '"' || ch === "'" || ch === "`") {
					const quote = ch;
					i++;
					while (i < pos && after[i] !== quote) {
						if (after[i] === "\\") i++;
						i++;
					}
					continue;
				}
				if (ch === "(") d++;
				else if (ch === ")") d--;
			}
			return d;
		};
		let dv: RegExpMatchArray | null = null;
		for (const dm of after.matchAll(/defaultValue\s*:\s*(["'])([^"'`]*)\1/g)) {
			if (depthAt(dm.index ?? 0) === 1) {
				dv = dm;
				break;
			}
		}
		if (dv) {
			const en = resolveKey(resources, resolvedNs, keyPath);
			if (en !== undefined && dv[2] !== en) {
				push({
					file: rel,
					line,
					kind: "defaultValue-mismatch",
					text: `${rawKey} → ${JSON.stringify(dv[2])} (en: ${JSON.stringify(en)})`,
				});
			}
		}
	}

	return findings;
};

export const main = async (): Promise<number> => {
	const resources: Resources = new Map();
	for (const [ns, data] of await loadResources(APP_LOCALES)) {
		resources.set(ns, data);
	}
	for (const [ns, data] of await loadResources(WEB_LOCALES)) {
		resources.set(ns, data);
	}

	const files: string[] = [];
	for (const dir of [
		path.join(ROOT, "src"),
		path.join(ROOT, "packages", "ui", "src"),
		path.join(ROOT, "apps", "web", "src"),
	]) {
		await walk(dir, files);
	}

	const findings: Finding[] = [];
	for (const file of files) {
		findings.push(...(await scanFile(file, resources)));
	}

	if (findings.length === 0) {
		console.log("i18n t() key check PASSED — all literal keys resolve.");
		return 0;
	}

	console.error(
		`i18n t() key check FAILED — ${findings.length} problem(s) found.`,
	);
	for (const f of findings) {
		console.error(`  ${f.file}:${f.line} [${f.kind}] ${f.text}`);
	}
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
