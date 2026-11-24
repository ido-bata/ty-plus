/**
 * web-design — enforces the official site's design contract.
 *
 * Scopes:
 *  - apps/web/src: full contract (raw controls, inline styles, token
 *    literals, web token definitions, undefined token paths, appearance
 *    overrides on @ty-plus/ui components).
 *  - packages/ui/src: shared components must not use responsive
 *    breakpoint conditions — layout conditions are platform-specific and
 *    live in each app's own Panda config (web: real breakpoints, CEP:
 *    pinned 0rem).
 *
 * Token registries are derived from the actual sources of truth, not
 * hardcoded lists:
 *  - DEFINED_VARS: every custom property emitted by
 *    themeVarsToCssBlock(DESIGN_TOKENS_DEFAULTS) — the exact set injected
 *    into :root on web. Web CSS may only (re)define names in this set and
 *    may only reference names in this set plus the scrollbar vars.
 *  - PANDA_TOKENS: flattened token paths per category from
 *    panda.tokens.ts, used to reject undefined dotted token references
 *    (e.g. `color: "text.bogus"`).
 *
 * Violations already present are tracked in
 * apps/web/design-lint-allowlist.json; entries that no longer violate fail
 * the check so the allowlist shrinks to zero. New violations always fail.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript5";
import { DESIGN_TOKENS_DEFAULTS } from "../../packages/ui/src/tokens/design-tokens-defaults";
import { themeVarsToCssBlock } from "../../packages/ui/src/tokens/theme-css";
import * as pandaTokens from "../../panda.tokens";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const WEB_DIR = join(ROOT, "apps", "web", "src");
const _SHARED_UI_DIR = join(ROOT, "packages", "ui", "src");
const ALLOWLIST_PATH = join(ROOT, "apps", "web", "design-lint-allowlist.json");

export type Violation = {
	file: string;
	line: number;
	rule: string;
	message: string;
};

const RAW_CONTROL_TAGS = new Set(["button", "input", "select", "textarea"]);

// ---------------------------------------------------------------------------
// Token registries
// ---------------------------------------------------------------------------

/** Every `--*` custom property the web :root actually defines. */
const DEFINED_VARS = new Set(
	[
		...themeVarsToCssBlock(DESIGN_TOKENS_DEFAULTS).matchAll(/(--[\w-]+)\s*:/g),
	].map((m) => m[1]),
);

/** Scrollbar vars are CEP-panel internals referenced with fallbacks; web may
 * reference the known names but never define them. */
const SCROLLBAR_VARS = new Set([
	"--scrollbar-width",
	"--scrollbar-track-bg",
	"--scrollbar-thumb-bg",
	"--scrollbar-thumb-radius",
	"--scrollbar-transition-duration",
]);

/** panda.tokens.ts export name -> Panda token category used in css(). */
const PANDA_CATEGORY_EXPORTS: Record<string, string> = {
	colors: "colors",
	opacities: "opacity",
	spacing: "spacing",
	radii: "radii",
	sizes: "sizes",
	fonts: "fonts",
	fontSizes: "fontSizes",
	borderWidths: "borderWidths",
	shadows: "shadows",
	durations: "durations",
};

function flattenTokenPaths(node: unknown, prefix: string, out: Set<string>) {
	if (!node || typeof node !== "object") return;
	for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
		if (key === "value") {
			if (prefix) out.add(prefix);
			continue;
		}
		flattenTokenPaths(val, prefix ? `${prefix}.${key}` : key, out);
	}
}

/** category -> set of dotted token paths (e.g. colors -> "surface.panel"). */
const PANDA_TOKENS: Record<string, Set<string>> = {};
for (const [exportName, category] of Object.entries(PANDA_CATEGORY_EXPORTS)) {
	const set = new Set<string>();
	flattenTokenPaths(
		(pandaTokens as Record<string, unknown>)[exportName],
		"",
		set,
	);
	PANDA_TOKENS[category] = set;
}

// ---------------------------------------------------------------------------
// Property -> token category mapping
// ---------------------------------------------------------------------------

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
]);
const SHADOW_PROPS = new Set(["boxShadow", "textShadow"]);
/** Shorthand props that can smuggle a literal color (e.g. "1px solid red").
 * Only literal colors are banned here — the shorthand itself is layout. */
const SHORTHAND_COLOR_PROPS = new Set([
	"border",
	"borderTop",
	"borderRight",
	"borderBottom",
	"borderLeft",
	"borderBlock",
	"borderInline",
	"borderBlockStart",
	"borderBlockEnd",
	"borderInlineStart",
	"borderInlineEnd",
	"outline",
	"textDecoration",
	"columnRule",
	"backgroundImage",
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
/** Panda default fontSize keys (theme.extend merges defaults, so bare
 * keys like "xs"/"sm" remain valid alongside our text-* tokens). */
const DEFAULT_FONTSIZE_KEYS = new Set([
	"xs",
	"sm",
	"md",
	"lg",
	"xl",
	"2xl",
	"3xl",
	"4xl",
	"5xl",
	"6xl",
	"7xl",
	"8xl",
	"9xl",
]);

/** property -> Panda token categories it may resolve against. */
const PROP_TOKENS: Record<string, string[]> = {};
for (const p of COLOR_PROPS) PROP_TOKENS[p] = ["colors"];
for (const p of SHADOW_PROPS) PROP_TOKENS[p] = ["shadows"];
for (const p of RADIUS_PROPS) PROP_TOKENS[p] = ["radii"];
for (const p of BORDER_PROPS) PROP_TOKENS[p] = ["borderWidths"];
PROP_TOKENS.fontFamily = ["fonts"];
PROP_TOKENS.fontSize = ["fontSizes", "sizes"];

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
	"initial",
	"px",
]);
const COLOR_LITERAL =
	/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(|color-mix\(|\b(?:red|blue|green|black|white|yellow|purple|orange|pink|gray|grey|silver|navy|teal|cyan|magenta|lime|maroon|olive|aqua|fuchsia|coral|salmon|khaki|indigo|violet|crimson|tomato)\b/i;
const UNIT_VALUE = /^-?[\d.]+(?:px|rem|em|%|vh|vw|vmin|vmax|fr|s|ms|deg)$/;

const BREAKPOINT_KEYS = new Set(["sm", "md", "lg", "xl", "2xl"]);

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function* walk(dir: string): Generator<string> {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) yield* walk(p);
		else if (
			/\.(tsx?|css)$/.test(name) &&
			!name.endsWith(".test.ts") &&
			!name.endsWith(".test.tsx") &&
			!name.endsWith(".stories.tsx")
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

// ---------------------------------------------------------------------------
// Style-object checking (TS/TSX)
// ---------------------------------------------------------------------------

type Ctx = {
	file: string;
	out: Violation[];
	sf: ts.SourceFile;
	/** "web" = full contract; "shared" = only responsive-condition ban
	 * (shared components may legitimately render raw controls). */
	mode: "web" | "shared";
};

function add(ctx: Ctx, node: ts.Node, rule: string, message: string) {
	ctx.out.push({
		file: ctx.file,
		line: lineOf(ctx.sf, node),
		rule,
		message,
	});
}

function checkVarRefs(ctx: Ctx, node: ts.Node, value: string) {
	for (const m of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
		const name = m[1];
		if (DEFINED_VARS.has(name) || SCROLLBAR_VARS.has(name)) continue;
		add(
			ctx,
			node,
			"web-token",
			`var(${name}) is not a defined shared token; only themeVarsToCssBlock names and scrollbar vars are allowed`,
		);
	}
}

function tokenPathExists(prop: string, value: string): boolean {
	const cats = PROP_TOKENS[prop];
	if (!cats) return true; // property not token-managed here
	return cats.some((c) => PANDA_TOKENS[c]?.has(value));
}

/** Validate a scalar (string) value assigned to a style property. */
function checkPropValue(
	ctx: Ctx,
	propNode: ts.Node,
	prop: string,
	expr: ts.Expression,
) {
	if (ctx.mode === "shared") return;
	const val = stringValue(expr);
	if (val === null) return;
	const lower = val.toLowerCase();
	if (val.startsWith("[")) return; // explicit arbitrary-value escape
	if (BARE_OK.has(lower)) return;
	if (val.includes("var(")) {
		checkVarRefs(ctx, propNode, val);
		return;
	}
	if (COLOR_PROPS.has(prop) && COLOR_LITERAL.test(val)) {
		add(
			ctx,
			propNode,
			"token-color",
			`${prop}: "${val}" is a literal color; use a shared token/var`,
		);
		return;
	}
	if (
		(SHADOW_PROPS.has(prop) || SHORTHAND_COLOR_PROPS.has(prop)) &&
		COLOR_LITERAL.test(val)
	) {
		add(
			ctx,
			propNode,
			"token-color",
			`${prop}: "${val}" contains a literal color; use a shadow token`,
		);
		return;
	}
	if (
		RADIUS_PROPS.has(prop) &&
		(UNIT_VALUE.test(val) || COLOR_LITERAL.test(val))
	) {
		add(
			ctx,
			propNode,
			"token-radius",
			`${prop}: "${val}" must use a radius token`,
		);
		return;
	}
	if (
		FONT_PROPS.has(prop) &&
		(UNIT_VALUE.test(val) ||
			COLOR_LITERAL.test(val) ||
			(prop === "fontFamily" && /["',\s]/.test(val)))
	) {
		add(
			ctx,
			propNode,
			"token-font",
			`${prop}: "${val}" must use a font token/var`,
		);
		return;
	}
	if (BORDER_PROPS.has(prop) && UNIT_VALUE.test(val) && val !== "0") {
		add(
			ctx,
			propNode,
			"token-border",
			`${prop}: "${val}" must use a border token`,
		);
		return;
	}
	// Dotted or named token references must resolve in the Panda registry.
	// Spacing/size literals are intentionally NOT enforced here: layout
	// recipes own rational dimensions, and only control appearance is
	// token-managed (colors, fonts, radii, shadows, borders).
	if (PROP_TOKENS[prop] && !tokenPathExists(prop, val)) {
		if (prop === "fontSize" && DEFAULT_FONTSIZE_KEYS.has(val)) return;
		add(
			ctx,
			propNode,
			"token-undefined",
			`${prop}: "${val}" is not a defined ${PROP_TOKENS[prop].join("/")} token`,
		);
	}
}

function isConditionKey(key: string): boolean {
	return (
		BREAKPOINT_KEYS.has(key) ||
		key.startsWith("_") ||
		key.startsWith("&") ||
		key.startsWith("@") ||
		key.startsWith("[")
	);
}

/**
 * Check an object literal used as a Panda style object. `inheritedProp`
 * is set when recursing into a responsive value map (e.g. the object in
 * `color: { base: "red", md: "blue" }` — inner scalars belong to `color`).
 */
function checkStyleObject(
	ctx: Ctx,
	obj: ts.ObjectLiteralExpression,
	inheritedProp: string | null,
) {
	for (const prop of obj.properties) {
		if (ts.isSpreadAssignment(prop)) continue;
		if (!ts.isPropertyAssignment(prop)) continue;
		const key = propName(prop.name) ?? "";
		const init = prop.initializer;

		if (key.startsWith("--")) {
			if (ctx.mode === "web" && !DEFINED_VARS.has(key)) {
				add(
					ctx,
					prop,
					"web-token",
					`custom property "${key}" is not a defined shared token`,
				);
			}
			continue;
		}

		if (inheritedProp) {
			// Inside a responsive/condition value map: breakpoint keys are
			// still violations in shared mode; scalars belong to the parent
			// property; nested objects recurse as conditions.
			if (BREAKPOINT_KEYS.has(key) && ctx.mode === "shared") {
				add(
					ctx,
					prop,
					"responsive-condition",
					`breakpoint condition "${key}" is banned in shared CEP-facing code; layout conditions are platform-specific`,
				);
			}
			if (ts.isObjectLiteralExpression(init)) {
				checkStyleObject(ctx, init, inheritedProp);
			} else {
				checkPropValue(ctx, prop, inheritedProp, init);
			}
			continue;
		}

		if (isConditionKey(key)) {
			if (BREAKPOINT_KEYS.has(key) && ctx.mode === "shared") {
				add(
					ctx,
					prop,
					"responsive-condition",
					`breakpoint condition "${key}" is banned in shared CEP-facing code; layout conditions are platform-specific`,
				);
			}
			if (ts.isObjectLiteralExpression(init)) {
				checkStyleObject(ctx, init, null);
			}
			continue;
		}

		// A style property (or unknown key — checked only when token-managed).
		if (ts.isObjectLiteralExpression(init)) {
			// Responsive value map: { base: "…", md: "…" } or condition map.
			checkStyleObject(ctx, init, key);
		} else if (ts.isArrayLiteralExpression(init)) {
			for (const el of init.elements) {
				if (ts.isObjectLiteralExpression(el)) checkStyleObject(ctx, el, null);
			}
		} else {
			checkPropValue(ctx, prop, key, init);
		}
	}
}

/** cva()/sva() config object: `base`, `variants`, `compoundVariants` etc.
 * contain nested style objects; recurse generically — style objects are
 * validated by checkStyleObject wherever they appear. */
function checkCompoundConfig(ctx: Ctx, obj: ts.ObjectLiteralExpression) {
	for (const prop of obj.properties) {
		if (!ts.isPropertyAssignment(prop)) continue;
		const init = prop.initializer;
		if (ts.isObjectLiteralExpression(init)) {
			// Could be a style object (contains style props) or a variant
			// axis map. checkStyleObject treats unknown keys as props and
			// skips non-string/non-object values, so it is safe for both;
			// however variant option names like `sm` would false-positive
			// as breakpoint conditions — suppress by checking children as
			// plain objects first.
			checkVariantContainer(ctx, init);
		} else if (ts.isArrayLiteralExpression(init)) {
			for (const el of init.elements) {
				if (ts.isObjectLiteralExpression(el)) checkVariantContainer(ctx, el);
			}
		}
	}
}

/** Object inside cva/sva config: keys may be variant axes/options whose
 * values are style objects, or style props directly (compoundVariants). */
function checkVariantContainer(ctx: Ctx, obj: ts.ObjectLiteralExpression) {
	for (const prop of obj.properties) {
		if (!ts.isPropertyAssignment(prop)) continue;
		const key = propName(prop.name) ?? "";
		const init = prop.initializer;
		if (ts.isObjectLiteralExpression(init)) {
			// A value that looks like a style object (has token-managed or
			// common style keys, or condition keys) is checked as styles;
			// otherwise it is a deeper variant map — recurse.
			if (looksLikeStyleObject(init)) {
				checkStyleObject(ctx, init, null);
			} else {
				checkVariantContainer(ctx, init);
			}
		} else if (ts.isArrayLiteralExpression(init)) {
			for (const el of init.elements) {
				if (ts.isObjectLiteralExpression(el)) checkVariantContainer(ctx, el);
			}
		} else {
			// Scalar under a variant option/axis name — not a style value.
			void key;
		}
	}
}

const STYLE_PROP_NAMES = new Set([
	...COLOR_PROPS,
	...SHADOW_PROPS,
	...RADIUS_PROPS,
	...FONT_PROPS,
	...BORDER_PROPS,
	"display",
	"flexDirection",
	"alignItems",
	"justifyContent",
	"flexWrap",
	"gridTemplateColumns",
	"gridTemplateRows",
	"gridColumn",
	"gridRow",
	"position",
	"overflow",
	"overflowX",
	"overflowY",
	"opacity",
	"transform",
	"transition",
	"cursor",
	"pointerEvents",
	"userSelect",
	"whiteSpace",
	"textOverflow",
	"objectFit",
	"zIndex",
	"boxSizing",
	"content",
]);

function looksLikeStyleObject(obj: ts.ObjectLiteralExpression): boolean {
	for (const prop of obj.properties) {
		if (!ts.isPropertyAssignment(prop)) continue;
		const key = propName(prop.name);
		if (!key) continue;
		if (STYLE_PROP_NAMES.has(key) || isConditionKey(key)) return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// TSX checking
// ---------------------------------------------------------------------------

function collectUiImports(sf: ts.SourceFile): {
	names: Set<string>;
	namespaces: Set<string>;
} {
	const names = new Set<string>();
	const namespaces = new Set<string>();
	for (const stmt of sf.statements) {
		if (
			!ts.isImportDeclaration(stmt) ||
			!ts.isStringLiteral(stmt.moduleSpecifier) ||
			stmt.moduleSpecifier.text !== "@ty-plus/ui"
		)
			continue;
		const clause = stmt.importClause;
		if (!clause) continue;
		if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
			namespaces.add(clause.namedBindings.name.text);
		} else if (
			clause.namedBindings &&
			ts.isNamedImports(clause.namedBindings)
		) {
			for (const el of clause.namedBindings.elements) {
				names.add(el.name.text);
			}
		}
	}
	return { names, namespaces };
}

function isUiComponentTag(
	tag: string,
	ui: { names: Set<string>; namespaces: Set<string> },
): boolean {
	if (ui.names.has(tag)) return true;
	const dot = tag.indexOf(".");
	if (dot > 0 && ui.namespaces.has(tag.slice(0, dot))) return true;
	return false;
}

function isStyleCall(expr: ts.Expression): "css" | "cva" | null {
	const text = expr.getText();
	if (/^css(\.raw)?$/.test(text)) return "css";
	if (/^cva$|^sva$/.test(text)) return "cva";
	return null;
}

function checkTsx(
	file: string,
	src: string,
	mode: "web" | "shared",
	out: Violation[],
) {
	const sf = ts.createSourceFile(
		file,
		src,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const ctx: Ctx = { file, out, sf, mode };
	const ui = collectUiImports(sf);

	const visit = (node: ts.Node) => {
		if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
			const tag = node.tagName.getText();
			const line = lineOf(sf, node);
			if (mode === "web" && RAW_CONTROL_TAGS.has(tag)) {
				out.push({
					file,
					line,
					rule: "raw-control",
					message: `raw <${tag}> is banned; use a @ty-plus/ui primitive`,
				});
			}
			if (mode === "web" && isUiComponentTag(tag, ui)) {
				for (const attr of node.attributes.properties) {
					if (
						ts.isJsxAttribute(attr) &&
						["className", "css"].includes(attr.name.getText())
					) {
						out.push({
							file,
							line: lineOf(sf, attr),
							rule: "ui-override",
							message: `<${tag}> is a shared @ty-plus/ui component; appearance must come from variant/size/tone props, not ${attr.name.getText()}`,
						});
					}
				}
			}
			for (const attr of node.attributes.properties) {
				if (
					mode === "web" &&
					ts.isJsxAttribute(attr) &&
					attr.name.getText() === "style"
				) {
					out.push({
						file,
						line: lineOf(sf, attr),
						rule: "inline-style",
						message: "style attribute is banned",
					});
				}
			}
		}
		if (ts.isCallExpression(node)) {
			const kind = isStyleCall(node.expression);
			if (kind === "css") {
				for (const arg of node.arguments) {
					if (ts.isObjectLiteralExpression(arg))
						checkStyleObject(ctx, arg, null);
					else if (ts.isArrayLiteralExpression(arg)) {
						for (const el of arg.elements) {
							if (ts.isObjectLiteralExpression(el))
								checkStyleObject(ctx, el, null);
						}
					}
				}
			} else if (kind === "cva") {
				for (const arg of node.arguments) {
					if (ts.isObjectLiteralExpression(arg)) checkCompoundConfig(ctx, arg);
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
}

// ---------------------------------------------------------------------------
// CSS checking
// ---------------------------------------------------------------------------

const CONTROL_CLASS =
	/\.(?:btn|button|badge|card|chip|pill|notice|toast|tag|eyebrow)(?=[\s.:[{>+~]|$)/i;
const CONTROL_ELEMENT =
	/(?:^|[\s>+~,(])(?:button|input|select|textarea)(?=[\s.:[{>+~,:]|$)/i;
const COLOR_LITERAL_CSS =
	/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(|color-mix\(|\b(?:red|blue|green|black|white|yellow|purple|orange|pink|gray|grey|silver|navy|teal|cyan|magenta|lime|maroon|olive|aqua|fuchsia|coral|salmon|khaki|indigo|violet|crimson|tomato)\b/i;

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
				if (!DEFINED_VARS.has(prop)) {
					add(
						"web-token",
						`custom property "${prop}" is not a defined shared token; web may only redefine themeVarsToCssBlock names`,
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
			// var() references must resolve to defined shared tokens.
			for (const vm of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
				const name = vm[1];
				if (DEFINED_VARS.has(name) || SCROLLBAR_VARS.has(name)) continue;
				add(
					"web-token",
					`${prop} references "${name}" which is not a defined shared token`,
				);
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
				if (clean[i] === ";") bufStart = i + 1;
				i++;
			}
		}
	};
	parseRegion(0, clean.length);
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export function collectViolations(
	scanDir: string = WEB_DIR,
	root: string = ROOT,
	options: { mode?: "web" | "shared" } = {},
): Violation[] {
	const { mode = "web" } = options;
	const out: Violation[] = [];
	for (const file of walk(scanDir)) {
		const rel = relative(root, file);
		const src = readFileSync(file, "utf8");
		if (file.endsWith(".css")) {
			if (mode === "web") checkCss(rel, src, out);
		} else {
			checkTsx(rel, src, mode, out);
		}
	}
	return out;
}

export function collectAllViolations(root: string = ROOT): Violation[] {
	const out: Violation[] = [];
	// Web: full contract.
	out.push(...collectViolations(join(root, "apps", "web", "src"), root));
	// Shared UI: responsive breakpoint conditions are banned (platform
	// layout conditions must not leak into shared components).
	out.push(
		...collectViolations(join(root, "packages", "ui", "src"), root, {
			mode: "shared",
		}),
	);
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
	const violations = collectAllViolations();
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
	main();
