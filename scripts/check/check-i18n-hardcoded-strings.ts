/**
 * check-i18n-hardcoded-strings.ts
 *
 * Guarantees that user-facing strings in the app (`src/`), the shared UI
 * package (`packages/ui/src`), and the website (`apps/web/src`) go through
 * i18n instead of being hard-coded in English.
 *
 * Detected patterns:
 *  - .tsx: string literals on user-facing JSX attributes
 *    (title / placeholder / aria-label / alt / label / *Label / *AriaLabel /
 *    *Placeholder / *Title / *Message / *Description / *Hint / *Text /
 *    *Legend / *Caption / *Summary / message / caption / description /
 *    emptyLabel / loadingLabel / tooltip / heading / legend / confirmText /
 *    cancelText / searchPlaceholder …)
 *  - .tsx: JSX text nodes containing prose
 *  - .ts/.tsx: literal first arguments to alert() / confirm() / prompt()
 *  - .ts/.tsx: prose literals thrown via `throw new Error("…")`
 *    (`.ext.ts` host-bridge files are excluded — host protocol, not UI)
 *  - .tsx: template literals inside JSX expression containers / attributes
 *    whose literal segments contain prose (`` {`Open ${name}`} ``)
 *  - .ts/.tsx: prose literals assigned to user-facing object keys
 *    (label / title / message / description / placeholder / hint / caption /
 *    summary / tooltip / legend / heading / confirmText / cancelText /
 *    emptyText / loadingText / ariaLabel / searchPlaceholder / eyebrow /
 *    subtitle / tagline / footnote / helperText / errorMessage /
 *    emptyMessage / noDataText / banner / notice / ctaLabel — plus any key
 *    ending in Label/Text/Message/Description/Title/Hint/Placeholder/
 *    Caption/Summary/Tooltip/Heading/Eyebrow/Kicker/Subtitle/Tagline/
 *    Footnote/HelperText/ErrorMessage/EmptyMessage/Notice/Banner/Cta)
 *
 * Test files, stories, contract tests, generated files, locale resources,
 * and an explicit ALLOWLIST are excluded. Everything else must be reported.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = [
	path.join(ROOT, "src"),
	path.join(ROOT, "packages", "ui", "src"),
	path.join(ROOT, "apps", "web", "src"),
];

const EXCLUDE_FILE =
	/\.(test|spec|stories|contract)\.[tj]sx?$|\.gen\.ts$|routeTree\.gen\.ts$|\.d\.ts$|\.stories\.|\.ext\.tsx?$/;
const EXCLUDE_DIR = /node_modules|styled-system|locales|\/i18n\/locales/;

/** JSX attribute names that always carry user-visible text. */
const USER_FACING_ATTRS = new Set([
	"title",
	"placeholder",
	"aria-label",
	"alt",
	"label",
	"description",
	"tooltip",
	"caption",
	"message",
	"legend",
	"heading",
	"emptyLabel",
	"loadingLabel",
	"confirmText",
	"cancelText",
	"searchPlaceholder",
	"eyebrow",
	"subtitle",
	"tagline",
	"footnote",
	"helperText",
	"errorMessage",
	"emptyMessage",
	"banner",
	"notice",
]);

/** JSX attribute suffixes that imply user-visible text. */
const USER_FACING_ATTR_SUFFIX =
	/(Label|AriaLabel|Placeholder|Title|Message|Description|Hint|Legend|Caption|Summary|Tooltip|Text|Heading|Eyebrow|Kicker|Subtitle|Tagline|Footnote|HelperText|ErrorMessage|EmptyMessage|Banner|Notice|Cta)$/;

/** Object keys in .ts/.tsx whose string literal values are user-visible. */
const USER_FACING_KEYS = new Set([
	"label",
	"title",
	"message",
	"description",
	"placeholder",
	"hint",
	"caption",
	"summary",
	"tooltip",
	"legend",
	"heading",
	"confirmText",
	"cancelText",
	"emptyText",
	"loadingText",
	"ariaLabel",
	"searchPlaceholder",
	"emptyLabel",
	"loadingLabel",
	"browseHint",
	"selectedSummary",
	"eyebrow",
	"subtitle",
	"tagline",
	"footnote",
	"helperText",
	"errorMessage",
	"emptyMessage",
	"noDataText",
	"banner",
	"notice",
	"ctaLabel",
]);

/** Object-key suffixes that imply user-visible text (mirrors attr suffixes). */
const USER_FACING_KEY_SUFFIX =
	/(Label|Text|Message|Description|Title|Hint|Placeholder|Caption|Summary|Tooltip|Heading|Eyebrow|Kicker|Subtitle|Tagline|Footnote|HelperText|ErrorMessage|EmptyMessage|Notice|Banner|Cta)$/;

/** Functions whose string literal argument is shown to the user. */
const USER_FACING_CALLS =
	/\b(?:window\.)?(?:alert|confirm|prompt|notificationStore\.add)\s*\(\s*([`"'])/g;

/**
 * Explicit allowlist. Each entry is `relative/path.tsx:<line-substring>` —
 * a finding is suppressed when the file path ends with the entry's path and
 * the reported source line contains the entry's marker substring.
 * Prefer extracting strings to i18n over allowlisting.
 */
const ALLOWLIST: { file: string; marker: string; reason: string }[] = [
	{
		file: "apps/web/src/lib/demo-presets.ts",
		marker: "",
		reason:
			"Demo fixture data (preset titles/descriptions/file paths). Titles and descriptions are localized at render time via the demoPresets.* keys in PresetStage; filePath values are data, not UI copy.",
	},
];

interface Finding {
	file: string;
	line: number;
	kind: string;
	text: string;
}

const looksLikeProse = (value: string): boolean => {
	const trimmed = value.trim();
	if (!/[A-Za-z]/.test(trimmed)) return false;
	if (trimmed.length < 2) return false;
	// Single all-lowercase slug tokens are identifiers/enums, not prose.
	if (/^[a-z0-9_.:/\\-]+$/.test(trimmed)) return false;
	// Pure interpolation / expressions are not literals.
	if (/^\{.*\}$/.test(trimmed)) return false;
	// Code fragments caught by the JSX-text heuristic.
	if (/(&&|\|\||=>)/.test(trimmed)) return false;
	if (/^[[(]?[A-Za-z_$][\w$]*\s*:/.test(trimmed)) return false;
	if (/^[=+\-*/%&|!<>]/.test(trimmed)) return false;
	// Prose needs either whitespace or a leading capital/digit+letter mix.
	if (!/\s/.test(trimmed) && !/^[A-Z0-9]/.test(trimmed)) return false;
	return true;
};

const isUserFacingAttr = (name: string): boolean =>
	USER_FACING_ATTRS.has(name) ||
	USER_FACING_ATTR_SUFFIX.test(name) ||
	// Any aria-* attribute may carry spoken text (aria-description,
	// aria-valuetext, …); boolean-ish values are rejected by prose filter.
	name.startsWith("aria-");

const JSX_ATTR_RE = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(["'])([^"'\n]{2,300})\2/g;
// JSX text may span lines; `[^<>{}]` keeps expression containers as
// boundaries so `{expr}` never leaks into a match.
const JSX_TEXT_RE = />([^<>{}]*[A-Za-z][^<>{}]*)</g;
const TS_KEY_RE =
	/(?:^|[\s{,])([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(["'`])([^"'`\n]{2,300})\2/g;

/**
 * `throw new Error("…")` in app code can surface in dialogs/status UI.
 * `.ext.ts` host-bridge files are excluded — they speak the host
 * protocol, not the localized UI.
 */
const THROW_ERROR_RE =
	/throw\s+new\s+\w*Error\(\s*(["'`])((?:(?!\1)[\s\S]){10,400}?)\1/g;

/**
 * JSX expression containers holding a template literal, e.g.
 * `{`Open group ${name}`}` or `title={`Select ${file}`}`.
 * i18next `t()` calls and log prefixes are filtered by the caller.
 */
const JSX_TEMPLATE_RE = /\{\s*`([^`]*)`\s*\}/g;

const scanFile = async (file: string): Promise<Finding[]> => {
	const findings: Finding[] = [];
	const content = await readFile(file, "utf8");
	const rel = path.relative(ROOT, file);
	const isTsx = file.endsWith(".tsx");
	const lines = content.split("\n");

	const push = (index: number, kind: string, text: string) => {
		const trimmed = text.trim();
		if (!looksLikeProse(trimmed)) return;
		// `// i18n-exempt` on the same or previous line marks intentionally
		// non-localized literals (protocol payloads, logs, code samples).
		// For throw-error, the marker may also sit on the next line inside
		// the call's argument list (biome's canonical comment placement).
		const exemptRe = /\/\/\s*i18n-exempt\b/;
		const exemptCandidates =
			kind === "throw-error"
				? [lines[index], lines[index - 1], lines[index + 1]]
				: [lines[index], lines[index - 1]];
		if (exemptCandidates.some((l) => exemptRe.test(l ?? ""))) return;
		if (kind === "jsx-text") {
			// The multiline JSX-text heuristic also catches `>`/`<` inside
			// ordinary code (generics, comparisons, arrows, comments, regex
			// literals). Real JSX text is short prose; reject code-shaped blobs.
			if (trimmed.length > 400) return;
			// Reject matches that live on a `//` comment line (e.g. `=> Partial<S>`).
			const srcLine = lines[index] ?? "";
			const commentIdx = srcLine.indexOf("//");
			if (commentIdx >= 0 && !srcLine.slice(0, commentIdx).includes(">"))
				return;
			if (
				/[;]|\b(const|let|var|return|import|export|function|await|typeof|instanceof|new)\b/.test(
					trimmed,
				)
			)
				return;
			if (/(^|\n)\s*\/\//.test(trimmed)) return; // line comments
			if (/\(\//.test(trimmed)) return; // regex literal
			if (/`/.test(trimmed)) return; // code spans in comments/prose
			if (/\b\w+\.\w+\s*\(/.test(trimmed)) return; // method call
			if (/===|!==|\?\s*\(|\)\s*:/.test(trimmed)) return; // ternary/code
		}
		findings.push({ file: rel, line: index + 1, kind, text: trimmed });
	};

	const pushAt = (index: number, kind: string, text: string) => {
		// index is a character offset into `content`; map to a line number.
		let line = 0;
		let pos = 0;
		while (pos <= index && line < lines.length) {
			pos += lines[line].length + 1;
			line += 1;
		}
		push(line - 1, kind, text);
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (isTsx) {
			for (const m of line.matchAll(JSX_ATTR_RE)) {
				const [, name, , value] = m;
				if (!isUserFacingAttr(name)) continue;
				push(i, `jsx-attr:${name}`, value);
			}
		}

		for (const m of line.matchAll(USER_FACING_CALLS)) {
			// The regex only proves a quote follows '('; re-extract the literal.
			const after = line.slice(m.index);
			const lit = after.match(/^[^(]*\(\s*(["'`])([^"'`\n]{2,300})\1/);
			if (lit) push(i, "ui-call", lit[2]);
		}

		for (const m of line.matchAll(TS_KEY_RE)) {
			const [, key, , value] = m;
			if (!USER_FACING_KEYS.has(key) && !USER_FACING_KEY_SUFFIX.test(key))
				continue;
			push(i, `object-key:${key}`, value);
		}
	}

	// Content-level scan: throw literals may span multiple lines.
	for (const m of content.matchAll(THROW_ERROR_RE)) {
		pushAt(m.index ?? 0, "throw-error", m[2]);
	}

	if (isTsx) {
		for (const m of content.matchAll(JSX_TEXT_RE)) {
			const idx = m.index ?? 0;
			// Skip `>` that is part of `=>` or `>>` (generics/arrows in code).
			const prev = content[idx - 1];
			if (prev === "=" || prev === ">") continue;
			pushAt(idx, "jsx-text", m[1]);
		}

		for (const m of content.matchAll(JSX_TEMPLATE_RE)) {
			const idx = m.index ?? 0;
			// Skip templates produced by t()/i18n.t()/console/log calls —
			// those resolve through locale resources or are not UI copy.
			const before = content.slice(Math.max(0, idx - 30), idx);
			if (
				/\b(?:i18n\.t|\bt|console\.\w+|log|throw|import|require)\s*\(?\s*$/.test(
					before,
				)
			)
				continue;
			// className / css() / cx() templates are styling, not copy.
			if (
				/(?:class|className)\s*=\s*$|\b(?:css|cx|clsx|cn)\s*\(\s*$/.test(before)
			)
				continue;
			// Literal segments only — ${...} interpolations are data.
			const literalText = m[1].replace(/\$\{[^}]*\}/g, " ");
			const words = literalText.match(/[A-Za-z]{2,}/g) ?? [];
			if (words.length < 2) continue;
			pushAt(idx, "jsx-template", m[1].replace(/\s+/g, " ").trim());
		}
	}

	return findings;
};

const walk = async (dir: string, out: string[] = []): Promise<string[]> => {
	let entries: import("node:fs").Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return out;
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
	return out;
};

const isAllowlisted = (f: Finding): boolean =>
	ALLOWLIST.some(
		(a) =>
			f.file.endsWith(a.file) &&
			// marker checked against the source line is done by caller; here we
			// only match file + we store the text fragment as marker fallback.
			(a.marker === "" || f.text.includes(a.marker)),
	);

export const main = async (): Promise<number> => {
	const files: string[] = [];
	for (const dir of SCAN_DIRS) {
		await walk(dir, files);
	}

	const findings: Finding[] = [];
	for (const file of files) {
		findings.push(...(await scanFile(file)));
	}

	const lines = await Promise.all(
		[...new Set(findings.map((f) => f.file))].map(async (f) => ({
			file: f,
			content: await readFile(path.join(ROOT, f), "utf8").catch(() => ""),
		})),
	);
	const lineCache = new Map(lines.map((l) => [l.file, l.content.split("\n")]));

	const reported = findings.filter((f) => {
		if (isAllowlisted(f)) return false;
		const srcLine = lineCache.get(f.file)?.[f.line - 1] ?? "";
		return !ALLOWLIST.some(
			(a) => f.file.endsWith(a.file) && srcLine.includes(a.marker),
		);
	});

	if (reported.length === 0) {
		console.log(
			"i18n hardcoded-string check PASSED — no user-facing literals found.",
		);
		return 0;
	}

	console.error(
		`i18n hardcoded-string check FAILED — ${reported.length} user-facing literal(s) found.`,
	);
	console.error(
		"Move them into locale resources (src/management/i18n/locales or apps/web i18n) and reference via t().",
	);
	for (const f of reported) {
		console.error(
			`  ${f.file}:${f.line} [${f.kind}] ${JSON.stringify(f.text)}`,
		);
	}
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
