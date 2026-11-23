#!/usr/bin/env bun
/**
 * app-ui-design — enforces the shared design-system contract on the
 * CEP application code (`src/**`).
 *
 * WHY THIS EXISTS
 *
 * The shared design system lives in `packages/ui` and is imported as
 * `@ty-plus/ui`. The official site (`apps/web/src`) has been held to that
 * contract since it was written (`scripts/check/web-design.ts`), which
 * is why it has zero violations. The CEP app was written before the shared
 * package existed and was never held to it, so the same interaction is
 * implemented over and over with hand-written `css()`:
 *
 *   - raw `<button>` / `<input>` / `<select>` / `<textarea>` — every one of
 *     them is a shared control that carries the focus ring, the disabled
 *     treatment, and the size scale. A hand-rolled one has none of them.
 *   - hand-drawn `<svg>` path data — the shared `Icon` applies a
 *     size-dependent `strokeWidth`, so raw SVG renders at a different weight
 *     from every other icon.
 *   - `className`/`css` overrides on a `@ty-plus/ui` component — this is how
 *     a shared control gets re-skinned into something that no longer matches
 *     the shared one.
 *   - deep imports (`@ty-plus/ui/fields/Input`) — the barrel is the reviewed
 *     public surface; a deep import bypasses it.
 *
 * RULES
 *
 *   raw-control   raw <button|input|select|textarea> — use a shared primitive
 *   raw-svg       raw <svg> — use `Icon` with a lucide icon
 *   ui-override   appearance props (color/background/border/radius/font/
 *                 shadow/box metrics/padding) passed to a shared component
 *                 through `className`/`css` — use variant/size/tone props
 *   deep-import   `@ty-plus/ui/<subpath>` — import from the barrel
 *   inline-style  `style={{...}}` — styling goes through `css()`
 *
 * `packages/ui` itself is exempt: it IS the implementation of the contract.
 *
 * VIOLATIONS THAT ALREADY EXIST
 *
 * Tracked in `scripts/check/app-ui-design-allowlist.json`, one entry per
 * violation with the reason it is tolerated. An allowlist entry that no
 * longer violates fails the check, so the list can only shrink. New
 * violations always fail.
 *
 * Exit codes:
 *   0 - no new violations
 *   1 - violations detected
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript5";
import { DESIGN_TOKENS_DEFAULTS } from "../../packages/ui/src/tokens/design-tokens-defaults";
import { themeVarsToCssBlock } from "../../packages/ui/src/tokens/theme-css";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const APP_DIR = join(ROOT, "src");
const ALLOWLIST_PATH = join(
	ROOT,
	"scripts",
	"check",
	"app-ui-design-allowlist.json",
);

export type Violation = {
	file: string;
	line: number;
	rule: string;
	message: string;
};

const RAW_CONTROL_TAGS = new Set(["button", "input", "select", "textarea"]);

/**
 * The one focus indicator. Every focusable control paints it, so a focused
 * field looks the same as a focused button. The value lives in the theme
 * (`--color-focus-ring`) rather than in each component's style, so the
 * geometry cannot drift.
 */
const CANONICAL_FOCUS_RING = "var(--color-focus-ring)";

/** The CSS conditions that express "this control has focus". */
const FOCUS_CONDITIONS = new Set(["_focus", "_focusVisible", "_focusWithin"]);

/**
 * The theme's custom properties. A `var(--x)` that is not one of them does
 * not resolve, so the property it feeds silently falls back — a focus ring
 * that names a token that does not exist paints nothing.
 */
const DEFINED_VARS = new Set(
	[
		...themeVarsToCssBlock(DESIGN_TOKENS_DEFAULTS).matchAll(/(--[\w-]+)\s*:/g),
	].map((m) => m[1]),
);

/**
 * Variables that are not part of the theme but are legitimately defined
 * outside it (the CEP panel's scrollbar geometry).
 */
const EXTERNAL_VARS = new Set([
	"--scrollbar-width",
	"--scrollbar-track-bg",
	"--scrollbar-thumb-bg",
	"--scrollbar-thumb-radius",
	"--scrollbar-transition-duration",
]);

/**
 * Properties that decide how a control *looks*. A shared component must not
 * receive these through `className`/`css`: they belong to the component's
 * own variant/size/tone props, and overriding them is how two surfaces end
 * up rendering the same control differently.
 */
const APPEARANCE_PROPS = new Set([
	"background",
	"backgroundColor",
	"border",
	"borderBlock",
	"borderBlockEnd",
	"borderBlockStart",
	"borderBottom",
	"borderBottomColor",
	"borderBottomLeftRadius",
	"borderBottomRightRadius",
	"borderColor",
	"borderInline",
	"borderInlineEnd",
	"borderInlineStart",
	"borderLeft",
	"borderLeftColor",
	"borderRadius",
	"borderRight",
	"borderRightColor",
	"borderStyle",
	"borderTop",
	"borderTopColor",
	"borderTopLeftRadius",
	"borderTopRightRadius",
	"borderWidth",
	"boxShadow",
	"color",
	"fontSize",
	"fontWeight",
	"opacity",
	"outline",
]);

/**
 * Box metrics. For `IconButton` these ARE the size scale (the component has
 * no other way to express "6x6"), so overriding them breaks the scale. For
 * the other controls the box is host layout — a row button that fills the
 * row, a card button that fills the card — and overriding it is legitimate.
 */
const BOX_METRIC_PROPS = new Set([
	"height",
	"width",
	"padding",
	"paddingBlock",
	"paddingBlockEnd",
	"paddingBlockStart",
	"paddingBottom",
	"paddingInline",
	"paddingInlineEnd",
	"paddingInlineStart",
	"paddingLeft",
	"paddingRight",
	"paddingTop",
]);

/** Shared components whose own box is part of their contract. */
const CONTROL_COMPONENTS = new Set([
	"Button",
	"Checkbox",
	"ColorSwatch",
	"IconButton",
	"Input",
	"ListSelect",
	"NumberField",
	"PathField",
	"RangeField",
	"SearchField",
	"SegmentedControl",
	"Textarea",
]);

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function* walk(dir: string): Generator<string> {
	let entries: ReturnType<typeof readdirSync>;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else if (
			/\.(tsx|css)$/.test(entry.name) &&
			!entry.name.endsWith(".test.tsx") &&
			!entry.name.endsWith(".stories.tsx")
		)
			yield full;
	}
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
	return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/**
 * The custom properties a file sets through an inline style object.
 */
function collectRuntimeCustomProps(sf: ts.SourceFile): Set<string> {
	const names = new Set<string>();
	const visit = (node: ts.Node): void => {
		if (ts.isJsxAttribute(node) && node.name.getText(sf) === "style") {
			const initializer = node.initializer;
			if (!initializer || !ts.isJsxExpression(initializer)) return;
			const expr = initializer.expression;
			const object = ts.isAsExpression(expr) ? expr.expression : expr;
			if (!object || !ts.isObjectLiteralExpression(object)) return;
			for (const prop of object.properties) {
				if (!ts.isPropertyAssignment(prop)) continue;
				const key = propName(prop.name);
				if (key?.startsWith("--")) names.add(key);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return names;
}

/**
 * The `var(--name, …)` references in a value, with whether each one has a
 * fallback. The scan tracks nested parentheses so `var(--a, var(--b))` is
 * read as one reference with a fallback.
 */
export function parseVarCalls(
	value: string,
): { name: string; hasFallback: boolean }[] {
	const out: { name: string; hasFallback: boolean }[] = [];
	const re = /var\(\s*(--[\w-]+)/g;
	for (let match = re.exec(value); match !== null; match = re.exec(value)) {
		const start = match.index + match[0].length;
		let depth = 1;
		let i = start;
		for (; i < value.length; i++) {
			if (value[i] === "(") depth++;
			else if (value[i] === ")") {
				depth--;
				if (depth === 0) break;
			}
		}
		const body = value.slice(start, i);
		out.push({ name: match[1], hasFallback: body.includes(",") });
		re.lastIndex = i;
	}
	return out;
}

function stringValue(expr: ts.Expression | undefined): string | null {
	if (!expr) return null;
	if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
		return expr.text;
	}
	return null;
}

function propName(name: ts.PropertyName | undefined): string | null {
	if (!name) return null;
	if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
	return null;
}

/**
 * Local `const X = css({...})` declarations, so a shared component's
 * `className={someConst}` can be resolved to the style object it carries.
 */
function collectCssConsts(
	sf: ts.SourceFile,
): Map<string, ts.ObjectLiteralExpression> {
	const consts = new Map<string, ts.ObjectLiteralExpression>();
	for (const stmt of sf.statements) {
		if (!ts.isVariableStatement(stmt)) continue;
		for (const decl of stmt.declarationList.declarations) {
			if (!ts.isIdentifier(decl.name)) continue;
			const init = decl.initializer;
			if (!init || !ts.isCallExpression(init)) continue;
			const callee = init.expression.getText(sf);
			if (!/^css(\.raw)?$/.test(callee)) continue;
			const arg = init.arguments[0];
			if (arg && ts.isObjectLiteralExpression(arg)) {
				consts.set(decl.name.text, arg);
			}
		}
	}
	return consts;
}

function appearancePropsOf(
	obj: ts.ObjectLiteralExpression,
	tag: string,
): string[] {
	// Only controls carry an appearance contract. A glyph (`Icon`) may be
	// tinted, a container (`ScrollArea`, `Surface`) may carry a background —
	// neither is a re-skin of a control.
	if (!CONTROL_COMPONENTS.has(tag)) return [];
	const found: string[] = [];
	for (const prop of obj.properties) {
		if (!ts.isPropertyAssignment(prop)) continue;
		const key = propName(prop.name);
		if (!key) continue;
		if (APPEARANCE_PROPS.has(key)) {
			found.push(key);
			continue;
		}
		if (BOX_METRIC_PROPS.has(key) && tag === "IconButton") {
			found.push(key);
		}
	}
	return found;
}

/** Names imported from the shared package barrel. */
function collectUiImports(sf: ts.SourceFile): Set<string> {
	const names = new Set<string>();
	for (const stmt of sf.statements) {
		if (
			!ts.isImportDeclaration(stmt) ||
			!ts.isStringLiteral(stmt.moduleSpecifier) ||
			stmt.moduleSpecifier.text !== "@ty-plus/ui"
		)
			continue;
		const clause = stmt.importClause;
		if (!clause?.namedBindings) continue;
		if (!ts.isNamedImports(clause.namedBindings)) continue;
		for (const el of clause.namedBindings.elements) {
			names.add(el.name.text);
		}
	}
	return names;
}

/**
 * True when a `style={{...}}` attribute sets nothing but CSS custom
 * properties. Those carry runtime-computed values that `css()` cannot
 * express, so they are the one legitimate use of an inline style object.
 */
function isCustomPropertyOnlyStyle(attr: ts.JsxAttribute): boolean {
	const initializer = attr.initializer;
	if (!initializer || !ts.isJsxExpression(initializer)) return false;
	const expr = initializer.expression;
	if (!expr || !ts.isObjectLiteralExpression(expr)) return false;
	const props = expr.properties;
	if (props.length === 0) return false;
	for (const prop of props) {
		if (!ts.isPropertyAssignment(prop)) return false;
		const key = propName(prop.name);
		if (!key?.startsWith("--")) return false;
	}
	return true;
}

/**
 * Appearance properties set through an inline `style` object. Runtime
 * positioning and sizing are allowed; runtime appearance is not.
 */
function inlineStyleAppearanceProps(attr: ts.JsxAttribute): string[] {
	const initializer = attr.initializer;
	if (!initializer || !ts.isJsxExpression(initializer)) return [];
	const expr = initializer.expression;
	if (!expr || !ts.isObjectLiteralExpression(expr)) return [];
	const found: string[] = [];
	for (const prop of expr.properties) {
		if (!ts.isPropertyAssignment(prop)) continue;
		const key = propName(prop.name);
		if (!key) continue;
		if (key.startsWith("--")) continue;
		if (STYLE_APPEARANCE_PROPS.has(key)) found.push(key);
	}
	return found;
}

/**
 * Appearance properties inside a `style` object. Runtime *position* and
 * *size* values (a measured popover origin, a zoom factor) are legitimate
 * inline-style uses in the CEP app; runtime *appearance* is not — those
 * must come from the token system.
 */
const STYLE_APPEARANCE_PROPS = new Set([
	"background",
	"backgroundColor",
	"border",
	"borderBottomColor",
	"borderColor",
	"borderLeftColor",
	"borderRightColor",
	"borderTopColor",
	"boxShadow",
	"color",
	"fill",
	"fontSize",
	"fontWeight",
	"opacity",
	"outline",
	"stroke",
	"textShadow",
]);

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

/**
 * The properties that make a style recipe a *treatment* rather than a box
 * arrangement. A recipe that only lays out (display / flexDirection / gap /
 * minWidth) says nothing about how the app looks and is left alone; one
 * that colours, borders or types something is an identity, and identities
 * belong to the shared design system.
 */
const TREATMENT_PROPS = new Set([
	"background",
	"backgroundColor",
	"borderBlock",
	"borderBlockEnd",
	"borderBlockStart",
	"borderBottom",
	"borderBottomColor",
	"borderBottomLeftRadius",
	"borderBottomRightRadius",
	"borderBottomStyle",
	"borderBottomWidth",
	"borderColor",
	"borderInline",
	"borderInlineEnd",
	"borderInlineStart",
	"borderLeft",
	"borderLeftColor",
	"borderLeftStyle",
	"borderLeftWidth",
	"borderRadius",
	"borderRight",
	"borderRightColor",
	"borderRightStyle",
	"borderRightWidth",
	"borderStyle",
	"borderTop",
	"borderTopColor",
	"borderTopLeftRadius",
	"borderTopRightRadius",
	"borderTopStyle",
	"borderTopWidth",
	"borderWidth",
	"boxShadow",
	"color",
	"fontFamily",
	"fontSize",
	"fontWeight",
	"letterSpacing",
	"opacity",
	"textAlign",
	"textDecoration",
	"textTransform",
]);

/**
 * A style recipe: the exact property/value pairs of a `css()` object.
 * Two recipes are the same when every property and every value matches.
 */
export type StyleRecipe = {
	properties: { name: string; value: string }[];
	/** The file the recipe was found in. */
	file: string;
	line: number;
};

export function collectStyleRecipes(file: string, src: string): StyleRecipe[] {
	const sf = ts.createSourceFile(
		file,
		src,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const out: StyleRecipe[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node)) {
			const callee = node.expression.getText(sf);
			if (/^css(\.raw)?$/.test(callee)) {
				for (const arg of node.arguments) {
					if (!ts.isObjectLiteralExpression(arg)) continue;
					const properties: { name: string; value: string }[] = [];
					for (const prop of arg.properties) {
						if (!ts.isPropertyAssignment(prop)) continue;
						const name = propName(prop.name);
						const value = stringValue(prop.initializer);
						if (!name || value === null) continue;
						properties.push({ name, value });
					}
					if (properties.length < 3) continue;
					if (!properties.some((prop) => TREATMENT_PROPS.has(prop.name)))
						continue;
					out.push({
						properties: [...properties].sort((a, b) =>
							a.name.localeCompare(b.name),
						),
						file,
						line: lineOf(sf, arg),
					});
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return out;
}

const recipeKey = (recipe: StyleRecipe): string =>
	recipe.properties.map((p) => `${p.name}:${p.value}`).join(";");

export function checkAppSource(
	file: string,
	src: string,
	options: { sharedPackage?: boolean } = {},
): Violation[] {
	const out: Violation[] = [];
	const sf = ts.createSourceFile(
		file,
		src,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const uiNames = collectUiImports(sf);
	const cssConsts = collectCssConsts(sf);
	/**
	 * Custom properties this file sets through an inline style. They are
	 * defined at runtime on the element that sets them, so a `var(--x)` that
	 * reads them resolves — the value is not known at build time, which is
	 * exactly why it travels as a custom property.
	 */
	const runtimeCustomProps = collectRuntimeCustomProps(sf);

	const add = (node: ts.Node, rule: string, message: string): void => {
		out.push({ file, line: lineOf(sf, node), rule, message });
	};

	const resolveStyleObject = (
		expr: ts.Expression,
	): ts.ObjectLiteralExpression | null => {
		if (ts.isCallExpression(expr)) {
			const callee = expr.expression.getText(sf);
			if (!/^css(\.raw)?$/.test(callee)) return null;
			const arg = expr.arguments[0];
			return arg && ts.isObjectLiteralExpression(arg) ? arg : null;
		}
		if (ts.isIdentifier(expr)) {
			return cssConsts.get(expr.text) ?? null;
		}
		return null;
	};

	/**
	 * Walk a style object: check the focus conditions against the canonical
	 * indicator, and check every `var(--x)` against the theme.
	 */
	const checkStyleObject = (obj: ts.ObjectLiteralExpression): void => {
		for (const prop of obj.properties) {
			if (ts.isSpreadAssignment(prop)) continue;
			if (!ts.isPropertyAssignment(prop)) continue;
			const key = propName(prop.name);
			const init = prop.initializer;

			if (key && FOCUS_CONDITIONS.has(key)) {
				if (!ts.isObjectLiteralExpression(init)) continue;
				// A focus rule that paints a shadow IS the focus indicator, so
				// it has to be the canonical one. A focus rule that only
				// recolours (the error state) or moves (a pressed transform)
				// is not an indicator and is left alone.
				let ring: string | null = null;
				for (const inner of init.properties) {
					if (!ts.isPropertyAssignment(inner)) continue;
					if (propName(inner.name) !== "boxShadow") continue;
					ring = stringValue(inner.initializer);
				}
				if (ring === null) continue;
				if (ring === CANONICAL_FOCUS_RING) continue;
				add(
					init,
					"focus-ring-divergent",
					`${key} paints "${ring}" — the one focus indicator is ${CANONICAL_FOCUS_RING}`,
				);
			}

			if (ts.isObjectLiteralExpression(init)) {
				checkStyleObject(init);
				continue;
			}
			const value = stringValue(init);
			if (value === null) continue;
			// `var(--x, fallback)` resolves through the fallback, so only an
			// undefined name with no fallback leaves the property unset.
			for (const { name, hasFallback } of parseVarCalls(value)) {
				if (hasFallback) continue;
				if (
					DEFINED_VARS.has(name) ||
					EXTERNAL_VARS.has(name) ||
					runtimeCustomProps.has(name)
				)
					continue;
				add(
					init,
					"unknown-css-var",
					`var(${name}) is not a defined theme variable — it does not resolve, so the property it feeds falls back silently`,
				);
			}
		}
	};

	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node)) {
			const callee = node.expression.getText(sf);
			if (/^css(\.raw)?$/.test(callee)) {
				for (const arg of node.arguments) {
					if (ts.isObjectLiteralExpression(arg)) checkStyleObject(arg);
				}
			}
		}
		if (
			ts.isImportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			const specifier = node.moduleSpecifier.text;
			// `tokens/*` is the design-token registry, not the component
			// surface: it stays importable by path. Everything else must go
			// through the barrel.
			// Inside the shared package a deep import is how a module reaches
			// a sibling; the barrel rule is for its consumers.
			if (
				!options.sharedPackage &&
				specifier.startsWith("@ty-plus/ui/") &&
				!specifier.startsWith("@ty-plus/ui/tokens/")
			) {
				add(
					node,
					"deep-import",
					`import from "${specifier}" bypasses the @ty-plus/ui barrel — import from "@ty-plus/ui"`,
				);
			}
		}

		if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
			const tag = node.tagName.getText(sf);
			// The shared package *is* the implementation of these controls, so
			// it is the one place a raw `<button>` belongs.
			if (RAW_CONTROL_TAGS.has(tag) && !options.sharedPackage) {
				add(
					node,
					"raw-control",
					`raw <${tag}> is banned; use a @ty-plus/ui primitive`,
				);
			}
			if (tag === "Icon") {
				for (const attr of node.attributes.properties) {
					if (!ts.isJsxAttribute(attr)) continue;
					if (attr.name.getText(sf) !== "size") continue;
					const initializer = attr.initializer;
					if (!initializer || !ts.isJsxExpression(initializer)) continue;
					const expr = initializer.expression;
					if (!expr || !ts.isNumericLiteral(expr)) continue;
					const raw = expr.text;
					const px = ICON_SIZE_SCALE[raw] ?? Number(raw);
					if (ICON_SIZES_PX.has(px)) continue;
					add(
						attr,
						"icon-size-off-scale",
						`the shared icon scale is 3 (12px), 4 (16px) and 5 (20px); ${px}px is not one of them`,
					);
				}
			}
			if (tag === "svg" && !options.sharedPackage) {
				add(
					node,
					"raw-svg",
					"raw <svg> is banned; use `Icon` with a lucide icon",
				);
			}
			if (uiNames.has(tag)) {
				for (const attr of node.attributes.properties) {
					if (!ts.isJsxAttribute(attr)) continue;
					const attrName = attr.name.getText(sf);
					if (attrName !== "className" && attrName !== "css") continue;
					const initializer = attr.initializer;
					if (!initializer || !ts.isJsxExpression(initializer)) continue;
					const expr = initializer.expression;
					if (!expr) continue;
					const styleObject = resolveStyleObject(expr);
					if (!styleObject) continue;
					const props = appearancePropsOf(styleObject, tag);
					if (props.length === 0) continue;
					add(
						attr,
						"ui-override",
						`<${tag}> is a shared @ty-plus/ui component; ${props.join(", ")} must come from its variant/size/tone props, not ${attrName}`,
					);
				}
			}
			for (const attr of node.attributes.properties) {
				if (!ts.isJsxAttribute(attr)) continue;
				if (attr.name.getText(sf) !== "style") continue;
				// A `style` object that only sets CSS custom properties is the
				// documented escape hatch for runtime-computed values
				// (a zoom factor, a measured offset) — `css()` cannot express
				// them because they are not known at build time.
				if (isCustomPropertyOnlyStyle(attr)) continue;
				const appearance = inlineStyleAppearanceProps(attr);
				if (appearance.length === 0) continue;
				add(
					attr,
					"inline-style",
					`inline style sets ${appearance.join(", ")} — appearance must come from css() and the token system`,
				);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return out;
}

// ---------------------------------------------------------------------------
// Barrel completeness
// ---------------------------------------------------------------------------

/**
 * Every public component of the shared package must be reachable from the
 * barrel. A component that exists but is not exported is either dead code
 * or a deep-import escape hatch — both are the defect this rule removes.
 */
export function checkUiBarrel(uiSrcDir: string, root = ROOT): Violation[] {
	const barrelPath = join(uiSrcDir, "index.ts");
	if (!existsSync(barrelPath)) {
		return [
			{
				file: relative(root, barrelPath),
				line: 1,
				rule: "missing-barrel",
				message: "the shared package has no index.ts barrel",
			},
		];
	}
	const barrel = readFileSync(barrelPath, "utf8");
	const exported = new Set<string>();
	for (const m of barrel.matchAll(/export\s*\{([^}]*)\}/g)) {
		for (const part of m[1].split(",")) {
			const name = part
				.trim()
				.split(/\s+as\s+/)
				.pop()
				?.trim();
			if (name) exported.add(name);
		}
	}
	for (const m of barrel.matchAll(/export\s*\*\s*as\s+(\w+)/g)) {
		exported.add(m[1]);
	}

	const out: Violation[] = [];
	const files: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (
				/\.tsx$/.test(entry.name) &&
				!entry.name.endsWith(".test.tsx") &&
				!entry.name.endsWith(".stories.tsx")
			)
				files.push(full);
		}
	};
	walk(uiSrcDir);

	for (const file of files) {
		const src = readFileSync(file, "utf8");
		for (const m of src.matchAll(
			/export\s+(?:const|function|class)\s+([A-Z]\w*)/g,
		)) {
			const name = m[1];
			if (exported.has(name)) continue;
			out.push({
				file: relative(root, file),
				line: src.slice(0, m.index).split("\n").length,
				rule: "barrel-gap",
				message: `${name} is not exported from the @ty-plus/ui barrel`,
			});
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/**
 * The same treatment written out in two places is two treatments that will
 * drift. A recipe that more than one surface uses belongs to the shared
 * design system, so the app says it once.
 */
export function checkDuplicateRecipes(recipes: StyleRecipe[]): Violation[] {
	const byRecipe = new Map<string, StyleRecipe[]>();
	for (const recipe of recipes) {
		const key = recipeKey(recipe);
		const list = byRecipe.get(key);
		if (list) list.push(recipe);
		else byRecipe.set(key, [recipe]);
	}
	const out: Violation[] = [];
	for (const list of byRecipe.values()) {
		const files = new Set(list.map((r) => r.file));
		if (files.size < 2) continue;
		const described = list[0].properties
			.map((p) => `${p.name}: ${p.value}`)
			.join(", ");
		for (const recipe of list) {
			out.push({
				file: recipe.file,
				line: recipe.line,
				rule: "duplicate-style-recipe",
				message: `the same treatment (${described}) is written out in ${files.size} files — it belongs to the shared design system`,
			});
		}
	}
	return out;
}

/**
 * The scopes the design contract covers.
 *
 * - `src` — the CEP panel and the widget layer
 * - `packages/ui` — the shared design system itself; its own focus and
 *   variable references are held to the same contract, because the
 *   vocabulary is what everything else copies
 * - `apps/web` — the official site, which uses the same shared package
 */
export const CONTRACT_SCOPES = [
	"src",
	"packages/ui/src",
	"apps/web/src",
] as const;

/**
 * The shared icon's size scale: 3 = 12px, 4 = 16px, 5 = 20px. An icon at
 * another size is an icon the design system does not have, so it renders at an
 * optical size nothing else matches.
 */
const ICON_SIZE_SCALE: Record<string, number> = { "3": 12, "4": 16, "5": 20 };
const ICON_SIZES_PX = new Set([12, 16, 20]);

/**
 * The CSS files of the same scopes. They carry custom properties too, and a
 * name that does not resolve leaves the declaration unset — the same failure
 * the style objects have.
 */
export function checkCssVariables(file: string, src: string): Violation[] {
	const out: Violation[] = [];
	// A comment may mention a variable name; only the declarations count.
	const declarations = src.replace(/\/\*[\s\S]*?\*\//g, "");
	for (const { name, hasFallback } of parseVarCalls(declarations)) {
		if (hasFallback) continue;
		if (DEFINED_VARS.has(name) || EXTERNAL_VARS.has(name)) continue;
		const line = declarations
			.slice(0, declarations.indexOf(name))
			.split("\n").length;
		out.push({
			file,
			line,
			rule: "unknown-css-var",
			message: `var(${name}) is not a defined theme variable — it does not resolve, so the declaration it feeds falls back silently`,
		});
	}
	return out;
}

/**
 * A file that takes the native focus indicator away (`outline: none`) has to
 * put one back. The check is per file, because the indicator and the rule
 * that removes the outline often live in different style objects that are
 * combined at the call site.
 */
export function checkFocusIndicator(file: string, src: string): Violation[] {
	if (!/outline\s*:\s*(?:"none"|none|0)(?![\w-])/.test(src)) return [];
	if (src.includes(CANONICAL_FOCUS_RING)) return [];
	return [
		{
			file,
			line: 1,
			rule: "focus-indicator-missing",
			message: `this file removes the native focus indicator but never paints ${CANONICAL_FOCUS_RING} — a focusable control here would show nothing`,
		},
	];
}

export function collectViolations(root = ROOT): Violation[] {
	const out: Violation[] = [];
	const recipes: StyleRecipe[] = [];
	// The shared package's own recipes are the reference: a treatment that
	// the vocabulary already has must be used, not written out again.
	const vocabulary: StyleRecipe[] = [];

	for (const scope of CONTRACT_SCOPES) {
		const dir = join(root, scope);
		if (!existsSync(dir)) continue;
		for (const file of walk(dir)) {
			const rel = relative(root, file).replace(/\\/g, "/");
			const src = readFileSync(file, "utf8");
			if (!file.endsWith(".css")) {
				out.push(
					...checkAppSource(rel, src, {
						sharedPackage: scope === "packages/ui/src",
					}),
				);
			}
			if (file.endsWith(".css")) {
				out.push(...checkCssVariables(rel, src));
			}
			out.push(...checkFocusIndicator(rel, src));
			const found = collectStyleRecipes(rel, src);
			if (scope === "packages/ui/src") vocabulary.push(...found);
			else recipes.push(...found);
		}
	}
	out.push(...checkDuplicateRecipes(recipes));
	out.push(...checkVocabularyCopies(recipes, vocabulary));
	out.push(...checkUiBarrel(join(root, "packages", "ui", "src"), root));
	return out.sort((a, b) =>
		a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
	);
}

/**
 * A treatment the shared package already provides, written out again in the
 * app. The vocabulary is the answer; copying it is what makes the two drift.
 */
export function checkVocabularyCopies(
	recipes: StyleRecipe[],
	vocabulary: StyleRecipe[],
): Violation[] {
	const known = new Map<string, StyleRecipe>();
	for (const recipe of vocabulary) {
		const key = recipeKey(recipe);
		if (!known.has(key)) known.set(key, recipe);
	}
	const out: Violation[] = [];
	for (const recipe of recipes) {
		const owner = known.get(recipeKey(recipe));
		if (!owner) continue;
		out.push({
			file: recipe.file,
			line: recipe.line,
			rule: "vocabulary-copy",
			message: `this treatment already exists in the shared package (${owner.file}) — use it instead of writing it out again`,
		});
	}
	return out;
}

/**
 * Default reason per rule, used when the baseline is (re)generated. Each one
 * names the migration that clears the entry, so an allowlist entry always
 * says what would remove it.
 */
const DEFAULT_REASON: Record<string, string> = {
	"raw-control":
		"hand-rolled control predates the shared design system; replace it with the matching @ty-plus/ui primitive",
	"raw-svg":
		"hand-drawn icon predates the shared design system; replace it with `Icon` and a lucide icon",
	"ui-override":
		"the shared control is re-skinned locally; move the appearance into a shared variant/size/tone prop",
	"deep-import":
		"deep import of the shared package; move it to the @ty-plus/ui barrel",
	"inline-style":
		"inline style sets appearance; move it into css() and the token system",
	"barrel-gap":
		"the shared component is not exported from the barrel; export it or delete it",
	"duplicate-style-recipe":
		"this treatment is written out in more than one place; it belongs to the shared design system — migrate it when the surfaces change together",
	"vocabulary-copy":
		"this treatment already exists in the shared package — use it instead of writing it out again",
	"icon-size-off-scale":
		"this icon is not at a size the shared scale has (3 = 12px, 4 = 16px, 5 = 20px) — move it to a step, or say why it is a media glyph rather than an icon",
	"focus-indicator-missing":
		"this file removes the native focus indicator — put the shared ring back, or say why the control does not need one",
};

export type AllowlistEntry = {
	file: string;
	/** The line the violation was on when the baseline was written. */
	line: number;
	rule: string;
	/** The violation message; part of the entry's identity. */
	message: string;
	/** Why the violation is tolerated, and what would clear it. */
	reason: string;
};

export function loadAllowlist(path = ALLOWLIST_PATH): AllowlistEntry[] {
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(entry): entry is AllowlistEntry =>
				typeof entry === "object" &&
				entry !== null &&
				typeof (entry as AllowlistEntry).file === "string" &&
				typeof (entry as AllowlistEntry).line === "number" &&
				typeof (entry as AllowlistEntry).rule === "string" &&
				typeof (entry as AllowlistEntry).message === "string" &&
				typeof (entry as AllowlistEntry).reason === "string",
		);
	} catch {
		return [];
	}
}

/**
 * The identity of an allowlisted violation.
 *
 * Deliberately NOT line-number based: an allowlist keyed by line number is
 * invalidated by any edit above the violation, so a file with an
 * allowlisted violation has to have its whole allowlist regenerated after
 * every change to it. The file, the rule and the message identify the
 * violation and survive line shifts.
 */
export function violationKey(v: {
	file: string;
	line: number;
	rule: string;
	message: string;
}): string {
	return `${v.file}::${v.rule}::${v.message}`;
}

export function partitionViolations(
	violations: Violation[],
	allowlist: AllowlistEntry[],
): { fresh: Violation[]; stale: AllowlistEntry[] } {
	const allowed = new Set(
		allowlist.map((e) => violationKey(e as unknown as Violation)),
	);
	const live = new Set(violations.map(violationKey));
	return {
		fresh: violations.filter((v) => !allowed.has(violationKey(v))),
		stale: allowlist.filter((entry) => !live.has(violationKey(entry))),
	};
}

function main(): void {
	if (!existsSync(APP_DIR)) {
		console.error("app-ui-design: src/ not found");
		process.exit(1);
	}
	const violations = collectViolations();
	const allowlist = loadAllowlist();

	if (process.argv.includes("--write-baseline")) {
		const existing = new Map(allowlist.map((e) => [violationKey(e), e.reason]));
		const merged = violations.map((v) => ({
			file: v.file,
			line: v.line,
			rule: v.rule,
			message: v.message,
			reason: existing.get(violationKey(v)) ?? DEFAULT_REASON[v.rule],
		}));
		writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(merged, null, "\t")}\n`);
		console.log(
			`app-ui-design: wrote ${merged.length} baseline entr(ies) to ${relative(ROOT, ALLOWLIST_PATH)}`,
		);
		return;
	}

	const { fresh, stale } = partitionViolations(violations, allowlist);
	for (const v of fresh) {
		console.error(`FAIL ${v.file}:${v.line} [${v.rule}] ${v.message}`);
	}
	for (const entry of stale) {
		console.error(
			`STALE ${entry.file}:${entry.line} [${entry.rule}] allowlist entry no longer violates — remove it`,
		);
	}
	if (fresh.length > 0 || stale.length > 0) {
		console.error(
			`\napp-ui-design: ${fresh.length} new violation(s), ${stale.length} stale allowlist entry(ies)`,
		);
		process.exit(1);
	}
	console.log(`app-ui-design: ok (${violations.length} allowlisted, 0 new)`);
}

if (import.meta.main) {
	main();
}
