#!/usr/bin/env bun
/**
 * check-css-validity.ts
 *
 * Generated-CSS validity gate for the PandaCSS pipeline. Panda passes
 * unrecognized string values through verbatim, so a style object like
 * `gridTemplateColumns: "8 minmax(0, 1fr)"` or
 * `marginTop: "calc((1 - 4) / 2)"` emits syntactically invalid CSS that the
 * browser silently drops — the layout then collapses with no build error
 * (the failure mode behind the Appearance color-picker regression).
 *
 * The check regenerates `styled-system/styles.css` via `panda cssgen`
 * (static extraction covers every `css()` call, including currently-unused
 * ones) and validates each declaration against the property classes that
 * were observed to fail:
 *
 *   - dimensional properties: bare non-zero numbers and math functions
 *     (`calc`/`clamp`/`min`/`max`) whose arguments contain no unit, `%`, or
 *     `var()` are invalid — CSS requires a <length>/<time>/<percentage>.
 *   - `grid-template-*`: top-level track tokens that are bare non-zero
 *     numbers are invalid track sizes.
 *   - token-path leakage: Panda passes unknown token names through
 *     verbatim, so `color: "text.secondary"` or a `color-mix()` string
 *     containing `status.error` emits a bare dotted identifier that is
 *     never valid CSS (custom idents cannot contain `.`). Any dotted
 *     identifier outside `var()`/`url()`/strings is rejected.
 *   - interpolation-space loss: `color-mix(in_oklab, …)` keeps the
 *     underscore literally (Panda only converts `_` to space inside
 *     arbitrary-value brackets), producing an invalid interpolation
 *     hint.
 *   - `font-size` keywords: a bare identifier that is not a CSS font-size
 *     keyword (`medium`, `smaller`, …) is an unresolved token such as
 *     `text-sm` or `shell-text-xs`.
 *
 * Unitless `0` is always allowed (CSS permits unitless zero lengths/times).
 * Properties that legitimately accept unitless numbers (`opacity`,
 * `z-index`, `flex`, `scale`, `line-height`, SVG stroke metrics, …) are
 * deliberately not in scope.
 *
 * Exit codes:
 *   0 - Generated CSS is valid
 *   1 - cssgen failed or one or more invalid declarations were found
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const STYLES_CSS = join(REPO_ROOT, "styled-system", "styles.css");

export type CssViolation = {
	line: number;
	prop: string;
	value: string;
	reason: string;
};

const BARE_NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
const UNITLESS_ZERO_RE = /^[+-]?0+(?:\.0+)?$/;
const HAS_UNIT_OR_VAR_RE = /[a-zA-Z%]/;

/** Properties whose values must resolve to a <length>-like dimension. */
const DIMENSIONAL_PROPS = new Set([
	// box sizes
	"width",
	"min-width",
	"max-width",
	"height",
	"min-height",
	"max-height",
	"inline-size",
	"min-inline-size",
	"max-inline-size",
	"block-size",
	"min-block-size",
	"max-block-size",
	// positioning
	"inset",
	"top",
	"right",
	"bottom",
	"left",
	"perspective",
	"background-position",
	"object-position",
	"perspective-origin",
	"mask-position",
	// flex/grid gaps and bases
	"gap",
	"row-gap",
	"column-gap",
	"flex-basis",
	// margin / padding families (physical + logical)
	"margin",
	"margin-top",
	"margin-right",
	"margin-bottom",
	"margin-left",
	"margin-block",
	"margin-block-start",
	"margin-block-end",
	"margin-inline",
	"margin-inline-start",
	"margin-inline-end",
	"padding",
	"padding-top",
	"padding-right",
	"padding-bottom",
	"padding-left",
	"padding-block",
	"padding-block-start",
	"padding-block-end",
	"padding-inline",
	"padding-inline-start",
	"padding-inline-end",
	"scroll-margin",
	"scroll-margin-top",
	"scroll-margin-right",
	"scroll-margin-bottom",
	"scroll-margin-left",
	"scroll-margin-block",
	"scroll-margin-block-start",
	"scroll-margin-block-end",
	"scroll-margin-inline",
	"scroll-margin-inline-start",
	"scroll-margin-inline-end",
	"scroll-padding",
	"scroll-padding-top",
	"scroll-padding-right",
	"scroll-padding-bottom",
	"scroll-padding-left",
	"scroll-padding-block",
	"scroll-padding-block-start",
	"scroll-padding-block-end",
	"scroll-padding-inline",
	"scroll-padding-inline-start",
	"scroll-padding-inline-end",
	// border / outline metrics (keywords like thin/medium are fine — only
	// bare numbers and unitless math are rejected)
	"border",
	"border-top",
	"border-right",
	"border-bottom",
	"border-left",
	"border-block",
	"border-inline",
	"border-width",
	"border-top-width",
	"border-right-width",
	"border-bottom-width",
	"border-left-width",
	"border-block-width",
	"border-inline-width",
	"border-radius",
	"border-top-left-radius",
	"border-top-right-radius",
	"border-bottom-right-radius",
	"border-bottom-left-radius",
	"border-start-start-radius",
	"border-start-end-radius",
	"border-end-start-radius",
	"border-end-end-radius",
	"outline",
	"outline-width",
	"outline-offset",
	"border-spacing",
	// text metrics
	"font-size",
	"letter-spacing",
	"word-spacing",
	"text-indent",
	"text-underline-offset",
	// columns / shapes / motion offsets
	"column-width",
	"column-gap",
	"column-rule-width",
	"shape-margin",
	"shape-outset",
	"translate",
	"translate-x",
	"translate-y",
	"translate-z",
]);

/** Properties whose values must resolve to a <time> dimension. */
const TIME_PROPS = new Set([
	"transition-duration",
	"transition-delay",
	"animation-duration",
	"animation-delay",
]);

const GRID_TEMPLATE_PROPS = new Set([
	"grid-template",
	"grid-template-columns",
	"grid-template-rows",
]);

const MATH_FN_RE = /(^|[^\w-])(calc|clamp|min|max)\(/g;

function isBareNonZeroNumber(token: string): boolean {
	return BARE_NUMBER_RE.test(token) && !UNITLESS_ZERO_RE.test(token);
}

/** Extract balanced-paren bodies of calc()/clamp()/min()/max() calls. */
function mathFunctionBodies(value: string): string[] {
	const bodies: string[] = [];
	MATH_FN_RE.lastIndex = 0;
	for (
		let match = MATH_FN_RE.exec(value);
		match !== null;
		match = MATH_FN_RE.exec(value)
	) {
		const bodyStart = match.index + match[0].length;
		let depth = 1;
		let i = bodyStart;
		while (i < value.length && depth > 0) {
			const ch = value[i];
			if (ch === "(") {
				depth += 1;
			} else if (ch === ")") {
				depth -= 1;
			}
			i += 1;
		}
		bodies.push(value.slice(bodyStart, i - 1));
	}
	return bodies;
}

function checkMathFunctions(value: string): { ok: boolean; reason?: string } {
	for (const body of mathFunctionBodies(value)) {
		if (!HAS_UNIT_OR_VAR_RE.test(body)) {
			return {
				ok: false,
				reason:
					"math function resolves to a unitless number; dimensional properties require a unit, %, or var()",
			};
		}
	}
	return { ok: true };
}

/** Split on top-level commas, ignoring separators inside () and []. */
function splitTopLevel(value: string, separator: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = "";
	for (const ch of value) {
		if (ch === "(" || ch === "[") {
			depth += 1;
		} else if (ch === ")" || ch === "]") {
			depth -= 1;
		}
		if (ch === separator && depth === 0) {
			parts.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	parts.push(current);
	return parts;
}

function checkGridTemplate(value: string): { ok: boolean; reason?: string } {
	for (const row of splitTopLevel(value, ",")) {
		for (const token of row.split(/\s+/)) {
			if (token === "") {
				continue;
			}
			// Only flag bare numbers at top level — numbers inside
			// repeat()/minmax()/line-name brackets are legitimate.
			if (!/[([]/.test(token) && isBareNonZeroNumber(token)) {
				return {
					ok: false,
					reason:
						"bare number used as a grid track size; tracks require a unit, %, fr, keyword, or function",
				};
			}
		}
	}
	return { ok: true };
}

const DECL_RE = /^\s*([a-zA-Z-][a-zA-Z0-9-]*)\s*:\s*(.+?)\s*;?\s*$/;

/**
 * Functions whose arguments may legitimately contain dotted idents
 * (custom property names, urls, env lookups). Their bodies are masked
 * before token-path scanning.
 */
const MASKED_FN_RE = /\b(var|url|env|attr|local|src)\(/g;

/** Strip quoted strings and masked-function bodies from a declaration value. */
function maskCssValue(value: string): string {
	let out = "";
	let i = 0;
	while (i < value.length) {
		const ch = value[i];
		if (ch === '"' || ch === "'") {
			const quote = ch;
			i += 1;
			while (i < value.length && value[i] !== quote) {
				i += 1;
			}
			i += 1;
			continue;
		}
		MASKED_FN_RE.lastIndex = i;
		const fnMatch = MASKED_FN_RE.exec(value);
		if (fnMatch && fnMatch.index === i) {
			// Skip the balanced-paren body of var()/url()/etc.
			let depth = 0;
			while (i < value.length) {
				const c = value[i];
				if (c === "(") {
					depth += 1;
				} else if (c === ")") {
					depth -= 1;
					if (depth === 0) {
						i += 1;
						break;
					}
				}
				i += 1;
			}
			out += " ";
			continue;
		}
		out += ch;
		i += 1;
	}
	return out;
}

/** Dotted identifier (`foo.bar`) — never a valid CSS value token. */
const DOTTED_IDENT_RE = /[a-zA-Z_][\w-]*\.[\w-]+/;

/** `in_<colorspace>` — underscore where CSS requires a space. */
const INTERPOLATION_UNDERSCORE_RE =
	/\bin_(?:oklab|oklch|srgb|hsl|hwb|lab|lch|xyz|display-p3)\b/;

/** Bare identifiers that are valid `font-size` keywords. */
const FONT_SIZE_KEYWORDS = new Set([
	"xx-small",
	"x-small",
	"small",
	"medium",
	"large",
	"x-large",
	"xx-large",
	"xxx-large",
	"smaller",
	"larger",
	"inherit",
	"initial",
	"unset",
	"revert",
]);

const BARE_IDENT_RE = /^-{0,2}[a-zA-Z][\w-]*$/;

/**
 * Bare identifiers that are legitimate CSS keywords for dimensional
 * properties (`auto`, `min-content`, `solid`, …). A single-token value
 * outside this set — e.g. `width: px`, `border-radius: shell-md` — is an
 * unresolved token or Tailwind-ism that the browser drops.
 */
const DIMENSIONAL_KEYWORDS = new Set([
	"auto",
	"none",
	"min-content",
	"max-content",
	"fit-content",
	"stretch",
	"fill",
	"available",
	"content",
	"normal",
	"thin",
	"medium",
	"thick",
	"solid",
	"dashed",
	"dotted",
	"double",
	"groove",
	"ridge",
	"inset",
	"outset",
	"hidden",
	"scroll",
	"visible",
	"collapse",
	"absolute",
	"relative",
	"fixed",
	"sticky",
	"pointer",
	"default",
	"cover",
	"contain",
	"repeat",
	"no-repeat",
	"round",
	"space",
	"center",
	"left",
	"right",
	"top",
	"bottom",
	"start",
	"end",
	"baseline",
	"wrap",
	"nowrap",
	"pre",
	"pre-wrap",
	"pre-line",
	"break-word",
	"ellipsis",
	"clip",
	"uppercase",
	"lowercase",
	"capitalize",
	"italic",
	"oblique",
	"bold",
	"bolder",
	"lighter",
	"underline",
	"overline",
	"line-through",
	"disc",
	"circle",
	"square",
	"decimal",
	"lower-alpha",
	"upper-alpha",
	"lower-roman",
	"upper-roman",
	"list-item",
	"table",
	"flow-root",
	"static",
	"multiply",
	"screen",
	"darken",
	"lighten",
	"color-dodge",
	"color-burn",
	"hard-light",
	"soft-light",
	"difference",
	"exclusion",
	"hue",
	"saturation",
	"color",
	"luminosity",
	"plus-lighter",
	"minus-darker",
	"contrast",
	"grayscale",
	"invert",
	"opacity",
	"saturate",
	"sepia",
	"blur",
	"brightness",
	"drop-shadow",
	"hue-rotate",
	"all",
	"overlay",
	"isolate",
	"ease",
	"linear",
	"infinite",
	"forwards",
	"backwards",
	"both",
	"alternate",
	"reverse",
	"running",
	"paused",
	"local",
	"smooth",
	"currentcolor",
	"transparent",
	"separate",
	"border-box",
	"padding-box",
	"content-box",
	"lr",
	"rl",
	"tb",
	"vertical-rl",
	"horizontal-tb",
	"safe",
	"unsafe",
	"inside",
	"outside",
	"drag",
	"no-drop",
	"copy",
	"move",
	"alias",
	"context-menu",
	"cell",
	"crosshair",
	"col-resize",
	"row-resize",
	"text",
	"vertical-text",
	"zoom-in",
	"zoom-out",
	"xx-small",
	"x-small",
	"small",
	"large",
	"x-large",
	"xx-large",
	"xxx-large",
	"smaller",
	"larger",
	"inherit",
	"initial",
	"unset",
	"revert",
]);

/** CSS-wide keywords valid on every property. */
const CSS_WIDE_KEYWORDS = new Set(["inherit", "initial", "unset", "revert"]);

/**
 * Scan generated CSS text and return every declaration that is syntactically
 * invalid for its property class. Line numbers are 1-based into `cssText`.
 */
export function findCssViolations(cssText: string): CssViolation[] {
	const violations: CssViolation[] = [];
	const lines = cssText.split("\n");
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		const match = DECL_RE.exec(line);
		if (!match) {
			continue;
		}
		const prop = match[1].toLowerCase();
		const value = match[2].trim();
		if (prop.startsWith("--") || value === "") {
			continue;
		}
		const lineNo = i + 1;
		const masked = maskCssValue(value);

		if (DOTTED_IDENT_RE.test(masked)) {
			violations.push({
				line: lineNo,
				prop,
				value,
				reason:
					'dotted identifier is not valid CSS — likely an unresolved design-token path (e.g. color: "text.secondary")',
			});
			continue;
		}

		if (INTERPOLATION_UNDERSCORE_RE.test(masked)) {
			violations.push({
				line: lineNo,
				prop,
				value,
				reason:
					"underscore inside a color function — CSS requires a space (write 'in oklab', not 'in_oklab')",
			});
			continue;
		}

		if (
			prop === "font-size" &&
			BARE_IDENT_RE.test(masked.trim()) &&
			!FONT_SIZE_KEYWORDS.has(masked.trim().toLowerCase())
		) {
			violations.push({
				line: lineNo,
				prop,
				value,
				reason:
					"bare identifier is not a CSS font-size keyword — likely an unresolved fontSize token",
			});
			continue;
		}

		if (GRID_TEMPLATE_PROPS.has(prop)) {
			const grid = checkGridTemplate(value);
			if (!grid.ok) {
				violations.push({
					line: lineNo,
					prop,
					value,
					reason: grid.reason ?? "invalid grid template",
				});
			}
			continue;
		}

		const isDimensional = DIMENSIONAL_PROPS.has(prop);
		const isTime = TIME_PROPS.has(prop);
		if (!isDimensional && !isTime) {
			continue;
		}

		if (isBareNonZeroNumber(value)) {
			violations.push({
				line: lineNo,
				prop,
				value,
				reason: `unitless number is not a valid ${isTime ? "<time>" : "<length>"} value`,
			});
			continue;
		}

		const maskedTrim = masked.trim();
		if (
			BARE_IDENT_RE.test(maskedTrim) &&
			!(isTime ? CSS_WIDE_KEYWORDS : DIMENSIONAL_KEYWORDS).has(
				maskedTrim.toLowerCase(),
			)
		) {
			violations.push({
				line: lineNo,
				prop,
				value,
				reason: `bare identifier is not a valid ${isTime ? "<time>" : "<length>"} keyword — likely an unresolved token (e.g. width: "px")`,
			});
			continue;
		}

		const math = checkMathFunctions(value);
		if (!math.ok) {
			violations.push({
				line: lineNo,
				prop,
				value,
				reason: math.reason ?? "invalid math function",
			});
		}
	}
	return violations;
}

function main(): void {
	const gen = Bun.spawnSync(["bunx", "panda", "cssgen", "--silent"], {
		cwd: REPO_ROOT,
		stdout: "pipe",
		stderr: "pipe",
	});
	if (gen.exitCode !== 0) {
		console.error(
			`check-css-validity: panda cssgen failed (exit ${gen.exitCode})`,
		);
		console.error(gen.stderr.toString());
		process.exit(1);
	}

	const cssText = readFileSync(STYLES_CSS, "utf8");
	const violations = findCssViolations(cssText);
	const declCount = cssText
		.split("\n")
		.filter((line) => DECL_RE.test(line)).length;

	if (violations.length > 0) {
		console.error(
			`check-css-validity: ${violations.length} invalid declaration(s) in styled-system/styles.css`,
		);
		for (const v of violations) {
			console.error(
				`  styles.css:${v.line}  ${v.prop}: ${v.value}  — ${v.reason}`,
			);
		}
		process.exit(1);
	}

	console.log(
		`check-css-validity: OK (${declCount} declarations scanned, 0 violations)`,
	);
}

if (import.meta.main) {
	main();
}
