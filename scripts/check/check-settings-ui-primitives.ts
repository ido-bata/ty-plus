#!/usr/bin/env bun
/**
 * check-settings-ui-primitives.ts
 *
 * Enforces shared UI primitives inside Settings dialog section leaf
 * components (`src/management/setting/dialog/sections/*.tsx`):
 *
 * 1. No raw `<button>` JSX — actions must use `Button` / `IconButton`
 *    from `@/shared/component/controls` so variants, focus rings, and
 *    disabled styling stay consistent.
 * 2. No raw `<a>` JSX — external links must use `Button` (or another
 *    shared control) wired to `openUrlInDefaultBrowser`.
 * 3. No `style={{ ... }}` inline styles — styling must go through
 *    `css()` so generated CSS stays token-valid and gate-checked.
 * 4. `<ListSelect>` must be pinned to the canonical settings control
 *    height — `triggerClassName={SETTINGS_CONTROL_HEIGHT_CLASS}` or
 *    `uiSize="sm"`. The component's default `md` trigger is 36px while
 *    every other settings control (Input/Button md, the shared height
 *    class) is 32px; an unpinned select breaks row alignment.
 * 5. No inline-level element (`<span>`, `<em>`, `<strong>`, …) as a
 *    direct child of `<SettingsField>`. Inline elements size to their
 *    text content, so the field's content width is no longer bound to
 *    the six-column grid cell — the "free width" anti-case. Read-only
 *    values must use `SettingsFieldValue` (full cell width, canonical
 *    32px value band) or a block-level wrapper.
 * 6. `Button` / `IconButton` anywhere inside a `SettingsField` must
 *    fill their grid cell — `fullWidth` (or an equivalent
 *    `width: "full"` class). Content-width buttons leave part of the
 *    cell unconstrained, the same "free width" anti-case as rule 5 —
 *    including buttons inside `SettingsFieldValue` composite rows. A
 *    button that acts on a field value still gets its own grid cell.
 * 7. Direct children of `SettingsGrid` must be `SettingsField` or
 *    `SettingsSectionHeading` — never raw `<div>`/`<p>` with hand-rolled
 *    `gridColumn` spans. Bypassing `SettingsField` duplicates the span
 *    contract outside the shared component (and its static checks).
 *
 * Disclosure/navigation primitives (accordion triggers, sidebar tabs)
 * intentionally live outside `sections/` (`dialog/layout/`,
 * `SettingsSidebar.tsx`) because they need raw `<button>` semantics
 * (`aria-expanded`, `role="tab"`) that `Button` does not express.
 *
 * Exit codes:
 *   0 - No violations
 *   1 - One or more violations detected
 */

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const SECTIONS_DIR = resolve(
	"src",
	"management",
	"setting",
	"dialog",
	"sections",
);

const RAW_BUTTON_RE = /<button(?=[\s/>])/g;
const RAW_ANCHOR_RE = /<a(?=[\s/>])/g;
const INLINE_STYLE_RE = /style=\{\{/g;
const LIST_SELECT_RE = /<ListSelect\b/g;
// `uiSize="sm"` pins the trigger to the same 32px band; any
// `triggerClassName` is trusted to carry the canonical height class.
const LIST_SELECT_HEIGHT_OK_RE = /triggerClassName|uiSize=\{?["']sm["']\}?/;

// Inline-level elements shrink to their text content. As a direct
// `SettingsField` child they escape the grid cell's width; block-level
// wrappers (`<p>`, `<div>`, components) fill the cell and are fine.
const INLINE_LEAF_TAGS = new Set([
	"a",
	"abbr",
	"b",
	"bdi",
	"bdo",
	"cite",
	"code",
	"data",
	"dfn",
	"em",
	"i",
	"kbd",
	"mark",
	"q",
	"s",
	"samp",
	"small",
	"span",
	"strong",
	"sub",
	"sup",
	"time",
	"u",
	"var",
	"wbr",
]);

const SETTINGS_FIELD_OPEN_RE = /<SettingsField(?=[\s/>])/g;
const SETTINGS_GRID_OPEN_RE = /<SettingsGrid(?=[\s/>])/g;
const JSX_TAG_RE = /<\/?[A-Za-z][A-Za-z0-9._-]*|<>|<\/>/g;
const GRID_CHILD_ALLOWED = new Set(["SettingsField", "SettingsSectionHeading"]);

export type PrimitiveViolation = {
	line: number;
	col: number;
	rule:
		| "raw-button"
		| "raw-anchor"
		| "inline-style"
		| "listselect-height"
		| "inline-leaf"
		| "action-width"
		| "grid-child";
	snippet: string;
};

function stripComments(content: string): string {
	return content
		.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
		.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function lineColAt(
	content: string,
	index: number,
): { line: number; col: number } {
	const before = content.slice(0, index);
	const line = before.split("\n").length;
	const col = index - before.lastIndexOf("\n");
	return { line, col };
}

function snippetAt(content: string, index: number): string {
	const lineStart = content.lastIndexOf("\n", index) + 1;
	const lineEnd = content.indexOf("\n", index);
	return content
		.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
		.trim()
		.slice(0, 120);
}

/**
 * Finds the `>` that closes the JSX tag starting at `ltIndex` (`<`),
 * skipping `>` inside quoted strings and `{...}` expression containers
 * (arrow functions, comparisons, nested JSX in props).
 */
function findTagEnd(src: string, ltIndex: number): number {
	let quote: string | null = null;
	let braceDepth = 0;
	for (let i = ltIndex + 1; i < src.length; i++) {
		const ch = src[i];
		if (quote !== null) {
			if (ch === "\\") i++;
			else if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === "`") {
			quote = ch;
			continue;
		}
		if (ch === "{") braceDepth++;
		else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
		else if (ch === ">" && braceDepth === 0) return i;
	}
	return -1;
}

type FieldChildElement = {
	index: number;
	name: string;
	tagEnd: number;
	/** Ancestor element names inside the field (fragments excluded). */
	ancestors: string[];
};

/**
 * Walks the children of the `<SettingsField>` opening at `fieldIndex`
 * and returns every element start tag with its ancestor chain, plus the
 * indices of inline-level direct children. Depth is tracked over JSX
 * tags only; `{...}` expression containers are transparent so
 * `{cond && <span/>}` still counts as a direct child.
 */
function scanFieldChildren(
	stripped: string,
	fieldIndex: number,
): { leafHits: number[]; elements: FieldChildElement[] } {
	const openEnd = findTagEnd(stripped, fieldIndex);
	const leafHits: number[] = [];
	const elements: FieldChildElement[] = [];
	if (openEnd === -1) return { leafHits, elements };
	let k = openEnd - 1;
	while (k > fieldIndex && /\s/.test(stripped[k])) k--;
	if (stripped[k] === "/") return { leafHits, elements }; // self-closing

	const stack: string[] = [];
	JSX_TAG_RE.lastIndex = openEnd + 1;
	let match: RegExpExecArray | null = JSX_TAG_RE.exec(stripped);
	while (match !== null) {
		const idx = match.index;
		const token = match[0];
		// A `<` embedded in an expression (`a<b`) or string literal is not
		// a tag. Real JSX tags follow whitespace, `>`, `{`, `(`, etc.;
		// closing tags may directly follow text (`status</Label>`), so the
		// heuristic applies to open tags only.
		const isCloseToken = token.startsWith("</");
		const prev = stripped[idx - 1] ?? "";
		if (!isCloseToken && /[\w$"'`]/.test(prev)) {
			JSX_TAG_RE.lastIndex = idx + token.length;
			match = JSX_TAG_RE.exec(stripped);
			continue;
		}
		const tagEnd = findTagEnd(stripped, idx);
		if (tagEnd === -1) break;
		const isClose = token.startsWith("</");
		// `<>` and `<Fragment>` are transparent wrappers: they neither
		// nest depth nor count as field/grid children themselves.
		const isFragment =
			token === "<>" ||
			token === "</>" ||
			token.replace(/^<\/?/, "") === "Fragment";
		if (isClose) {
			if (!isFragment) {
				const name = token.replace(/^<\//, "");
				const at = stack.lastIndexOf(name);
				if (at === -1) break; // </SettingsField> or mismatched close
				stack.length = at;
			}
		} else if (!isFragment) {
			const name = token.replace(/^<\/?/, "");
			let c = tagEnd - 1;
			while (c > idx && /\s/.test(stripped[c])) c--;
			const selfClosing = stripped[c] === "/";
			const ancestors = [...stack];
			elements.push({ index: idx, name, tagEnd, ancestors });
			if (stack.length === 0 && INLINE_LEAF_TAGS.has(name)) {
				leafHits.push(idx);
			}
			if (!selfClosing) stack.push(name);
		}
		JSX_TAG_RE.lastIndex = tagEnd + 1;
		match = JSX_TAG_RE.exec(stripped);
	}
	return { leafHits, elements };
}

export function scanSectionSource(content: string): PrimitiveViolation[] {
	const stripped = stripComments(content);
	const violations: PrimitiveViolation[] = [];
	const rules: Array<{
		re: RegExp;
		rule: PrimitiveViolation["rule"];
		message: string;
	}> = [
		{
			re: RAW_BUTTON_RE,
			rule: "raw-button",
			message:
				"raw <button> — use Button/IconButton from @/shared/component/controls",
		},
		{
			re: RAW_ANCHOR_RE,
			rule: "raw-anchor",
			message: "raw <a> — use Button + openUrlInDefaultBrowser",
		},
		{
			re: INLINE_STYLE_RE,
			rule: "inline-style",
			message: "style={{ }} — use css() from @/styled-system/css",
		},
	];
	for (const { re, rule, message } of rules) {
		re.lastIndex = 0;
		let match: RegExpExecArray | null = re.exec(stripped);
		while (match !== null) {
			const { line, col } = lineColAt(stripped, match.index);
			violations.push({
				line,
				col,
				rule,
				snippet: `${message} | ${snippetAt(stripped, match.index)}`,
			});
			match = re.exec(stripped);
		}
	}

	// Rule 4: ListSelect must be pinned to the canonical control height.
	LIST_SELECT_RE.lastIndex = 0;
	let selectMatch: RegExpExecArray | null = LIST_SELECT_RE.exec(stripped);
	while (selectMatch !== null) {
		const tagEnd = stripped.indexOf("/>", selectMatch.index);
		const closeTag = stripped.indexOf("</ListSelect>", selectMatch.index);
		const endCandidates = [tagEnd, closeTag].filter((i) => i !== -1);
		const propsEnd = endCandidates.length > 0 ? Math.min(...endCandidates) : -1;
		const props =
			propsEnd === -1 ? "" : stripped.slice(selectMatch.index, propsEnd);
		if (!LIST_SELECT_HEIGHT_OK_RE.test(props)) {
			const { line, col } = lineColAt(stripped, selectMatch.index);
			violations.push({
				line,
				col,
				rule: "listselect-height",
				snippet: `unpinned <ListSelect> — add triggerClassName={SETTINGS_CONTROL_HEIGHT_CLASS} or uiSize="sm" | ${snippetAt(stripped, selectMatch.index)}`,
			});
		}
		selectMatch = LIST_SELECT_RE.exec(stripped);
	}

	// Rules 5+6: walk each SettingsField's children once. Inline-level
	// direct children escape the cell width (rule 5); Button/IconButton
	// inside a field must fill their grid cell (rule 6).
	SETTINGS_FIELD_OPEN_RE.lastIndex = 0;
	let fieldMatch: RegExpExecArray | null =
		SETTINGS_FIELD_OPEN_RE.exec(stripped);
	while (fieldMatch !== null) {
		const { leafHits, elements } = scanFieldChildren(
			stripped,
			fieldMatch.index,
		);
		for (const idx of leafHits) {
			const { line, col } = lineColAt(stripped, idx);
			violations.push({
				line,
				col,
				rule: "inline-leaf",
				snippet: `inline element as direct <SettingsField> child — wrap in SettingsFieldValue or a block element | ${snippetAt(stripped, idx)}`,
			});
		}
		for (const el of elements) {
			if (el.name !== "Button" && el.name !== "IconButton") continue;
			const tagText = stripped.slice(el.index, el.tagEnd + 1);
			if (/\bfullWidth\b|width:\s*["']full["']/.test(tagText)) continue;
			const { line, col } = lineColAt(stripped, el.index);
			violations.push({
				line,
				col,
				rule: "action-width",
				snippet: `<${el.name}> inside <SettingsField> must fill its grid cell — add fullWidth and give the action its own SettingsField span | ${snippetAt(stripped, el.index)}`,
			});
		}
		fieldMatch = SETTINGS_FIELD_OPEN_RE.exec(stripped);
	}

	// Rule 7: SettingsGrid children must use the shared field/heading
	// primitives, not raw elements with hand-rolled gridColumn spans.
	SETTINGS_GRID_OPEN_RE.lastIndex = 0;
	let gridMatch: RegExpExecArray | null = SETTINGS_GRID_OPEN_RE.exec(stripped);
	while (gridMatch !== null) {
		const { elements } = scanFieldChildren(stripped, gridMatch.index);
		for (const el of elements) {
			if (el.ancestors.length > 0) continue;
			if (GRID_CHILD_ALLOWED.has(el.name)) continue;
			const { line, col } = lineColAt(stripped, el.index);
			violations.push({
				line,
				col,
				rule: "grid-child",
				snippet: `<${el.name}> is not a SettingsGrid child primitive — use SettingsField span={N} or SettingsSectionHeading | ${snippetAt(stripped, el.index)}`,
			});
		}
		gridMatch = SETTINGS_GRID_OPEN_RE.exec(stripped);
	}

	return violations.sort((a, b) => a.line - b.line || a.col - b.col);
}

function walkSectionFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "__screenshots__") continue;
			results.push(...walkSectionFiles(full));
		} else if (
			entry.isFile() &&
			entry.name.endsWith(".tsx") &&
			!entry.name.endsWith(".stories.tsx") &&
			!entry.name.endsWith(".test.tsx")
		) {
			results.push(full);
		}
	}
	return results;
}

async function main(): Promise<void> {
	const files = walkSectionFiles(SECTIONS_DIR);
	const all: Array<{ file: string; violations: PrimitiveViolation[] }> = [];

	for (const file of files) {
		const content = await Bun.file(file).text();
		const violations = scanSectionSource(content);
		if (violations.length > 0) {
			all.push({ file, violations });
		}
	}

	if (all.length === 0) {
		console.log(
			`check-settings-ui-primitives: PASS — ${files.length} section file(s) scanned, no violations.`,
		);
		return;
	}

	console.error("check-settings-ui-primitives: FAIL — violations detected:");
	console.error("");
	for (const { file, violations } of all) {
		const rel = file.replace(`${process.cwd()}/`, "");
		for (const v of violations) {
			console.error(`  ${rel}:${v.line}:${v.col} [${v.rule}]`);
			console.error(`    ${v.snippet}`);
		}
	}
	console.error("");
	console.error(
		"Settings sections must compose shared primitives: Button/IconButton for actions,",
	);
	console.error(
		"Button + openUrlInDefaultBrowser for links, css() for styling.",
	);
	console.error(
		"Disclosure/navigation primitives belong in dialog/layout/ or SettingsSidebar.tsx.",
	);
	process.exit(1);
}

if (import.meta.main) {
	await main();
}
