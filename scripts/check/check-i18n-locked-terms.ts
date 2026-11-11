/**
 * check-i18n-locked-terms.ts
 *
 * Enforces the canonical-form table in `docs/architecture/i18n/policy.md` §1.2.
 * For each row in the per-locale canonical table, the script reads the value
 * at a hard-coded i18n path and asserts it matches the policy.
 *
 * §1.1 (fully-locked English terms) is checked in a separate pass against
 * specific string-keyed paths.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const POLICY_PATH = path.resolve("docs/architecture/i18n/policy.md");
const LOCALES_DIR = path.resolve("src/management/i18n/locales");

const SUPPORTED_LOCALES = [
	"en",
	"ja",
	"de",
	"fr",
	"es",
	"it",
	"ko",
	"pt",
	"ru",
	"zh",
] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

interface CanonicalRow {
	canonicalKey: string;
	values: Record<Locale, string>;
}

/**
 * Hard-coded mapping from `policy.md` §1.2 canonical-key to the i18n key path
 * that uses it. If a new canonical term is added to §1.2, add its i18n path here.
 */
const CANONICAL_KEY_TO_I18N_PATH: Record<string, string> = {
	Easing: "widgets.easing",
	"Anchor point": "widgets.anchorPoint",
	"Layout lock": "widgets.layoutLock",
	"Quick actions": "widgets.quickActions",
	"Directory browser": "widgets.directoryBrowser",
	"Font viewer": "widgets.fontViewer",
	"FX search": "widgets.fxSearch",
	Info: "widgets.info",
	// Preset, Widget, Workspace, Panel, Dialog are too generic to enforce
	// against a single i18n key — the existing display labels are longer
	// phrases (e.g. "Preset selector", "Add widget", "Workspace Background")
	// that contain the canonical word but are not the canonical form itself.
};

const readLocaleValue = async (
	locale: Locale,
	i18nKey: string,
): Promise<{ value: string; source: string } | null> => {
	const [namespace, ...rest] = i18nKey.split(".");
	const path = rest.join(".");
	const filePath = `${LOCALES_DIR}/${locale}/${namespace}.json`;
	let content: string;
	try {
		content = await readFile(filePath, "utf8");
	} catch {
		return null;
	}
	const parsed = JSON.parse(content) as Record<string, unknown>;
	let cursor: unknown = parsed;
	for (const segment of path.split(".")) {
		if (typeof cursor !== "object" || cursor === null) return null;
		cursor = (cursor as Record<string, unknown>)[segment];
	}
	if (typeof cursor === "string") {
		return { value: cursor, source: filePath };
	}
	return null;
};

const parseCanonicalTable = (policyContent: string): CanonicalRow[] => {
	const lines = policyContent.split("\n");
	const rows: CanonicalRow[] = [];
	let inSection12 = false;
	for (const line of lines) {
		if (line.includes("## 1.2 言語別 canonical")) {
			inSection12 = true;
			continue;
		}
		if (inSection12 && line.startsWith("## ")) {
			break;
		}
		if (!inSection12) continue;
		// Match table rows: | `Key` | `en` | `de` | ... |
		const m = line.match(
			/^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/,
		);
		if (!m) continue;
		// Column order in policy.md §1.2 table:
		//   canonical | en | de | fr | es | it | pt | ru | zh | ja | ko
		const [_, canonicalKey, en, de, fr, es, it, pt, ru, zh, ja, ko] = m;
		rows.push({
			canonicalKey: canonicalKey.trim(),
			values: {
				en: en.trim(),
				de: de.trim(),
				fr: fr.trim(),
				es: es.trim(),
				it: it.trim(),
				pt: pt.trim(),
				ru: ru.trim(),
				zh: zh.trim(),
				ja: ja.trim(),
				ko: ko.trim(),
			},
		});
	}
	return rows;
};

const main = async (): Promise<void> => {
	const policyContent = await readFile(POLICY_PATH, "utf8");
	const rows = parseCanonicalTable(policyContent);

	if (rows.length === 0) {
		console.error(
			"check-i18n-locked-terms: no canonical rows parsed from policy.md §1.2",
		);
		process.exit(1);
	}

	const errors: string[] = [];
	let checked = 0;

	for (const row of rows) {
		const i18nPath = CANONICAL_KEY_TO_I18N_PATH[row.canonicalKey];
		if (!i18nPath) {
			// No mapping registered yet — skip silently for now
			continue;
		}
		for (const locale of SUPPORTED_LOCALES) {
			const expected = row.values[locale];
			const actual = await readLocaleValue(locale, i18nPath);
			if (!actual) {
				// Locale file or key missing — coverage check catches this
				continue;
			}
			checked += 1;
			if (actual.value !== expected) {
				errors.push(
					`${locale}/${i18nPath}: expected "${expected}" (per policy.md), got "${actual.value}"`,
				);
			}
		}
	}

	if (errors.length > 0) {
		console.error("check-i18n-locked-terms FAILED:\n");
		for (const e of errors) {
			console.error(`  ${e}`);
		}
		console.error();
		process.exit(1);
	}

	console.log(
		`check-i18n-locked-terms: PASS (${checked} canonical value(s) verified against policy.md)`,
	);
};

await main();
