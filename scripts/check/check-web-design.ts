/**
 * check-web-design — enforces the official site's design contract.
 *
 * Scope: apps/web/src (all .ts/.tsx/.css files).
 *
 * TSX rules (AST-based):
 *  - Raw <button>/<input>/<select>/<textarea> JSX is banned; use @ty-plus/ui.
 *  - The `style` JSX attribute is banned (no inline-style bypass).
 *  - Inside css()/css.raw()/cva() style objects, token-managed properties
 *    (colors, fonts, radii, shadows, borders) must reference tokens or CSS
 *    vars — literal colors and unit-suffixed values are violations.
 *
 * CSS rules (declaration-level parse):
 *  - Custom properties may only be defined for shared token namespaces
 *    (--ty-*, --color-*, --scrollbar-*). Web-specific token systems are banned.
 *  - Literal colors (hex/rgb/hsl/oklch/color-mix) are banned.
 *  - font-family must reference var(--*) — literal stacks are banned.
 *  - Selectors targeting raw form controls or control-lookalike classes
 *    (.btn/.badge/.card/.chip/.pill/.notice/.toast) are banned.
 *
 * Violations already present are tracked in
 * apps/web/design-lint-allowlist.json; entries that no longer violate fail
 * the check so the allowlist shrinks to zero. New violations always fail.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript5";

const ROOT = process.cwd();
const SCAN_DIR = join(ROOT, "apps", "web", "src");
const ALLOWLIST_PATH = join(ROOT, "apps", "web", "design-lint-allowlist.json");

export type Violation = {
	file: string;
	line: number;
	rule: string;
	message: string;
};

const RAW_CONTROL_TAGS = new Set(["button", "input", "select", "textarea"]);

// Properties whose values must come from the shared token contract.
const COLOR_PROPS = new Set([
	"color",
	"background",
	"backgroundColor",
	"borderColor",
	"borderTopColor",
	"borderRightColor",
	"borderBottomColor",
	"borderLeftColor",
	"outlineColor",
	"textDecorationColor",
	"caretColor",
	"fill",
	"stroke",
	"columnRuleColor",
	"accentColor",
	"boxShadow",
	"textShadow",
]);
const RADIUS_PROPS = new Set([
	"borderRadius",
	"borderTopLeftRadius",
	"borderTopRightRadius",
	"borderBottomLeftRadius",
	"borderBottomRightRadius",
]);
const FONT_PROPS = new Set([
	"fontFamily",
	"fontSize",
	"fontWeight",
	"lineHeight",
	"letterSpacing",
]);
const BORDER_PROPS = new Set([
	"borderWidth",
	"borderTopWidth",
	"borderRightWidth",
	"borderBottomWidth",
	"borderLeftWidth",
	"outlineWidth",
	"outlineOffset",
]);

const BARE_OK = new Set([
	"transparent",
	"currentColor",
	"currentcolor",
	"inherit",
	"none",
	"0",
	"auto",
	"full",
	"unset",
]);
const COLOR_LITERAL =
	/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(|color-mix\(|\b(?:red|blue|green|black|white|yellow|purple|orange|pink|gray|grey|silver|navy|teal|cyan|magenta|lime|maroon|olive|aqua|fuchsia|coral|salmon|khaki|indigo|violet|crimson|tomato)\b/i;
const UNIT_VALUE = /^-?[\d.]+(?:px|rem|em|%|vh|vw|vmin|vmax|fr|s|ms|deg)$/;

function* walk(dir: string): Generator<string> {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) yield* walk(p);
		else if (
			/\.(tsx?|css)$/.test(name) &&
			!name.endsWith(".test.ts") &&
			!name.endsWith(".test.tsx")
		)
			yield p;
	}
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
	return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function propName(name: ts.PropertyName | undefined): string | null {
	if (!name) return null;
	if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
	return null;
}

function stringValue(expr: ts.Expression | undefined): string | null {
	if (!expr) return null;
	if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr))
		return expr.text;
	return null;
}

function checkStyleObject(
	sf: ts.SourceFile,
	obj: ts.ObjectLiteralExpression,
	file: string,
	out: Violation[],
) {
	for (const prop of obj.properties) {
		if (!ts.isPropertyAssignment(prop)) continue;
		const key = propName(prop.name);
		if (!key) continue;
		const val = stringValue(prop.initializer);
		if (val === null) continue;
		const line = lineOf(sf, prop);
		const add = (rule: string, message: string) =>
			out.push({ file, line, rule, message });
		if (COLOR_PROPS.has(key)) {
			if (
				COLOR_LITERAL.test(val) ||
				(!val.includes(".") &&
					!val.includes("var(") &&
					!BARE_OK.has(val.toLowerCase()) &&
					!val.startsWith("["))
			) {
				add("token-color", `${key}: "${val}" is not a shared token/var`);
			}
		}
		if (
			RADIUS_PROPS.has(key) &&
			(UNIT_VALUE.test(val) || COLOR_LITERAL.test(val))
		) {
			add("token-radius", `${key}: "${val}" must use a radius token`);
		}
		if (
			FONT_PROPS.has(key) &&
			(UNIT_VALUE.test(val) ||
				COLOR_LITERAL.test(val) ||
				(key === "fontFamily" && !val.includes("var(") && !val.includes(".")))
		) {
			add("token-font", `${key}: "${val}" must use a font token/var`);
		}
		if (BORDER_PROPS.has(key) && UNIT_VALUE.test(val) && val !== "0") {
			add("token-border", `${key}: "${val}" must use a border token`);
		}
		// Nested objects (e.g. _hover) — recurse.
		if (ts.isObjectLiteralExpression(prop.initializer)) {
			checkStyleObject(sf, prop.initializer, file, out);
		}
	}
}

function isStyleCall(expr: ts.Expression): boolean {
	const text = expr.getText();
	return /^(css(\.raw)?|cva|sva)$/.test(text);
}

function checkTsx(file: string, src: string, out: Violation[]) {
	const sf = ts.createSourceFile(
		file,
		src,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const visit = (node: ts.Node) => {
		if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
			const tag = node.tagName.getText();
			const line = lineOf(sf, node);
			if (RAW_CONTROL_TAGS.has(tag)) {
				out.push({
					file,
					line,
					rule: "raw-control",
					message: `raw <${tag}> is banned; use a @ty-plus/ui primitive`,
				});
			}
			for (const attr of node.attributes.properties) {
				if (ts.isJsxAttribute(attr) && attr.name.getText() === "style") {
					out.push({
						file,
						line: lineOf(sf, attr),
						rule: "inline-style",
						message: "style attribute is banned",
					});
				}
			}
		}
		if (ts.isCallExpression(node) && isStyleCall(node.expression)) {
			for (const arg of node.arguments) {
				if (ts.isObjectLiteralExpression(arg))
					checkStyleObject(sf, arg, file, out);
				else if (ts.isArrayLiteralExpression(arg)) {
					for (const el of arg.elements) {
						if (ts.isObjectLiteralExpression(el))
							checkStyleObject(sf, el, file, out);
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
}

const CONTROL_CLASS =
	/\.(?:btn|button|badge|card|chip|pill|notice|toast|tag|eyebrow)(?=[\s.:[{>+~]|$)/i;
const CONTROL_ELEMENT =
	/(?:^|[\s>+~,(])(?:button|input|select|textarea)(?=[\s.:[{>+~,:]|$)/i;
const COLOR_LITERAL_CSS =
	/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(|color-mix\(|\b(?:red|blue|green|black|white|yellow|purple|orange|pink|gray|grey|silver|navy|teal|cyan|magenta|lime|maroon|olive|aqua|fuchsia|coral|salmon|khaki|indigo|violet|crimson|tomato)\b/i;
const ALLOWED_CUSTOM_PROP = /^--(?:ty-|color-|scrollbar-)/;

function checkCss(file: string, src: string, out: Violation[]) {
	const clean = src.replace(/\/\*[\s\S]*?\*\//g, "");
	const lineAt = (pos: number) => clean.slice(0, pos).split("\n").length;

	const checkSelector = (sel: string, pos: number) => {
		if (CONTROL_ELEMENT.test(sel) || CONTROL_CLASS.test(sel)) {
			out.push({
				file,
				line: lineAt(pos),
				rule: "control-selector",
				message: `selector "${sel.trim().slice(0, 60)}" styles a raw control / control-lookalike class`,
			});
		}
	};

	const checkDeclarations = (body: string, bodyPos: number) => {
		for (const decl of body.split(";")) {
			const m = decl.match(/^\s*([^{}:]+?)\s*:\s*([\s\S]+)$/);
			if (!m) continue;
			const prop = m[1].trim();
			const value = m[2].trim();
			const line = lineAt(bodyPos + decl.length);
			const add = (rule: string, message: string) =>
				out.push({ file, line, rule, message });
			if (prop.startsWith("--")) {
				if (!ALLOWED_CUSTOM_PROP.test(prop)) {
					add(
						"web-token",
						`custom property "${prop}" defines a web-specific token; use shared --ty-* tokens`,
					);
				}
				continue;
			}
			if (prop === "font-family" && !value.includes("var(")) {
				add(
					"literal-font",
					`font-family "${value.slice(0, 60)}" must reference var(--*)`,
				);
			}
			if (COLOR_LITERAL_CSS.test(value) && !value.includes("var(")) {
				add(
					"literal-color",
					`${prop}: "${value.slice(0, 60)}" is a literal color; use shared tokens`,
				);
			}
			// References to custom properties must stay inside shared namespaces.
			for (const m of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
				if (!ALLOWED_CUSTOM_PROP.test(m[1])) {
					add(
						"web-token",
						`${prop} references "${m[1]}"; only --ty-*/--color-*/--scrollbar-* vars are allowed`,
					);
				}
			}
		}
	};

	// Recursive region parser: selector{body} pairs; @-rules recurse.
	const parseRegion = (start: number, end: number) => {
		let i = start;
		let bufStart = start;
		while (i < end) {
			if (clean[i] === "{") {
				const sel = clean.slice(bufStart, i).trim();
				// find matching close
				let depth = 1;
				let j = i + 1;
				while (j < end && depth > 0) {
					if (clean[j] === "{") depth++;
					else if (clean[j] === "}") depth--;
					j++;
				}
				const bodyStart = i + 1;
				const bodyEnd = j - 1;
				if (sel.startsWith("@")) {
					parseRegion(bodyStart, bodyEnd);
				} else {
					if (sel) checkSelector(sel, bufStart);
					checkDeclarations(clean.slice(bodyStart, bodyEnd), bodyStart);
				}
				i = j;
				bufStart = j;
			} else {
				// A ';' outside any block ends a statement (e.g. @import ...;)
				// — drop it so it can't glue onto the next selector.
				if (clean[i] === ";") bufStart = i + 1;
				i++;
			}
		}
	};
	parseRegion(0, clean.length);
}

export function collectViolations(
	scanDir: string = SCAN_DIR,
	root: string = ROOT,
): Violation[] {
	const out: Violation[] = [];
	for (const file of walk(scanDir)) {
		const rel = relative(root, file);
		const src = readFileSync(file, "utf8");
		if (file.endsWith(".css")) checkCss(rel, src, out);
		else checkTsx(rel, src, out);
	}
	return out;
}

export function loadAllowlist(): Violation[] {
	try {
		return JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
	} catch {
		return [];
	}
}

export function key(v: Violation): string {
	return `${v.file}:${v.line}:${v.rule}`;
}

export function partitionViolations(
	violations: Violation[],
	allowlist: Violation[],
): { fresh: Violation[]; stale: Violation[] } {
	const allowed = new Set(allowlist.map(key));
	const live = new Set(violations.map(key));
	return {
		fresh: violations.filter((v) => !allowed.has(key(v))),
		stale: allowlist.filter((v) => !live.has(key(v))),
	};
}

function main() {
	const violations = collectViolations();
	const { fresh, stale } = partitionViolations(violations, loadAllowlist());

	for (const v of fresh) {
		console.error(`FAIL ${v.file}:${v.line} [${v.rule}] ${v.message}`);
	}
	for (const v of stale) {
		console.error(
			`STALE ${v.file}:${v.line} [${v.rule}] allowlist entry no longer violates — remove it`,
		);
	}
	if (fresh.length || stale.length) {
		console.error(
			`\nweb-design: ${fresh.length} new violation(s), ${stale.length} stale allowlist entrie(s)`,
		);
		process.exit(1);
	}
	console.log(`web-design: ok (${violations.length} allowlisted, 0 new)`);
}

import { fileURLToPath } from "node:url";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
	main();
