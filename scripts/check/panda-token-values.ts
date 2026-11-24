#!/usr/bin/env bun
/**
 * panda-token-values.ts
 *
 * Guards against Panda `css()` values that are valid CSS but almost always a
 * token-namespace mistake. The observed failure mode (#434): `lineHeight: "6"`
 * looks like a spacing token but `lineHeight` has no spacing fallback, so it
 * compiles to `line-height: 6` — a 6em multiplier that exploded every line of
 * the markdown editor to ~96px.
 *
 * Rules:
 *   - `lineHeight` must not be a bare number >= 3. Unitless line-height is a
 *     multiplier, so values like 1 / 1.2 / 1.5 are legitimate; anything larger
 *     is a spacing-token confusion. Use rem/px, a named token (tight/snug/
 *     normal/relaxed), or an explicit multiplier <= 2.9.
 *   - `color-mix(...)` arguments must not contain `_`. Panda does not turn
 *     underscores into spaces inside these strings, so `in_oklab` or
 *     `)_15%` reach the stylesheet verbatim and the whole declaration is
 *     dropped by the browser (observed: FileEntryList row state fills, #470).
 *   - Quoted css() values must not place `_` inside `[...]` arbitrary-value
 *     brackets. Panda keeps underscores verbatim there too, so
 *     `"[2.25rem_2rem_minmax(0,1fr)_auto]"` compiles to an invalid
 *     `grid-template-columns` declaration the browser drops — the grid
 *     collapses to a single column and every row stacks (observed:
 *     preset list icons centered in a broken row, #582). Write the value
 *     as a plain space-separated string instead.
 *
 * Exit codes:
 *   0 - All checks pass
 *   1 - One or more violations detected
 */

import type { Dirent } from "node:fs";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();

const SCAN_DIRS = ["src", "apps", "packages"];

const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"coverage",
	".tmp",
	"storybook-static",
	"styled-system",
]);

const SKIP_FILES = /\.(test|spec)\.[tj]sx?$/;

/**
 * Matches `lineHeight:` followed by a string or numeric literal. Object keys
 * may be quoted; values may be single/double quoted or bare numbers.
 */
const LINE_HEIGHT_VALUE =
	/lineHeight\s*:\s*(?:"([^"]*)"|'([^']*)'|([0-9]+(?:\.[0-9]+)?))/g;

/**
 * Matches one `color-mix(...)` call, tolerating a single level of nested
 * parens (`var(--x)`). Args live inside a JS string, so the match runs on
 * the raw source line.
 */
const COLOR_MIX_CALL = /color-mix\((?:[^()]|\([^()]*\))*\)/g;

const colorMixHasUnderscore = (call: string): boolean => {
	// Custom property names inside var() may legitimately contain `_`;
	// everywhere else in a color-mix argument an underscore is a space that
	// Panda failed to emit.
	const stripped = call.replace(/var\([^)]*\)/g, "var()");
	return stripped.includes("_");
};

/**
 * Matches a css-object property whose quoted value is a `[...]` arbitrary
 * value containing `_`. Inside Panda arbitrary-value brackets underscores
 * are emitted verbatim (not converted to spaces), producing invalid
 * declarations. Scoped to `key: "value"` pairs so attribute-selector
 * strings (`"[data-x=...]"`) and template literals do not match.
 */
const BRACKET_UNDERSCORE_VALUE =
	/\b[A-Za-z_$][\w$]*\s*:\s*["'](\[[^\]"']*_[^\]"']*\][^"']*)["']/g;

const isUnitlessMultiplier = (raw: string): boolean => {
	if (!/^[0-9]+(?:\.[0-9]+)?$/.test(raw)) return false;
	return Number(raw) >= 3;
};

const collectFiles = (dir: string): string[] => {
	const out: string[] = [];
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const ent of entries) {
		const p = join(dir, ent.name);
		if (ent.isDirectory()) {
			if (!SKIP_DIRS.has(ent.name)) out.push(...collectFiles(p));
		} else if (/\.[tj]sx?$/.test(ent.name) && !SKIP_FILES.test(ent.name)) {
			out.push(p);
		}
	}
	return out;
};

const violations: {
	file: string;
	line: number;
	kind: "lineHeight" | "color-mix" | "bracket-underscore";
	value: string;
}[] = [];

for (const dir of SCAN_DIRS) {
	for (const file of collectFiles(join(REPO_ROOT, dir))) {
		const text = readFileSync(file, "utf8");
		if (
			!text.includes("lineHeight") &&
			!text.includes("color-mix(") &&
			!text.includes("[")
		)
			continue;
		const lines = text.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? "";
			LINE_HEIGHT_VALUE.lastIndex = 0;
			for (
				let m = LINE_HEIGHT_VALUE.exec(line);
				m !== null;
				m = LINE_HEIGHT_VALUE.exec(line)
			) {
				const raw = m[1] ?? m[2] ?? m[3] ?? "";
				if (isUnitlessMultiplier(raw)) {
					violations.push({
						file: file.slice(REPO_ROOT.length + 1),
						line: i + 1,
						kind: "lineHeight",
						value: raw,
					});
				}
			}
			COLOR_MIX_CALL.lastIndex = 0;
			for (
				let m = COLOR_MIX_CALL.exec(line);
				m !== null;
				m = COLOR_MIX_CALL.exec(line)
			) {
				if (colorMixHasUnderscore(m[0])) {
					violations.push({
						file: file.slice(REPO_ROOT.length + 1),
						line: i + 1,
						kind: "color-mix",
						value: m[0],
					});
				}
			}
			BRACKET_UNDERSCORE_VALUE.lastIndex = 0;
			for (
				let m = BRACKET_UNDERSCORE_VALUE.exec(line);
				m !== null;
				m = BRACKET_UNDERSCORE_VALUE.exec(line)
			) {
				violations.push({
					file: file.slice(REPO_ROOT.length + 1),
					line: i + 1,
					kind: "bracket-underscore",
					value: m[1] ?? m[0],
				});
			}
		}
	}
}

if (violations.length > 0) {
	const lineHeightHits = violations.filter((v) => v.kind === "lineHeight");
	const colorMixHits = violations.filter((v) => v.kind === "color-mix");
	const bracketHits = violations.filter((v) => v.kind === "bracket-underscore");
	if (lineHeightHits.length > 0) {
		console.error(
			"panda-token-values: unitless lineHeight >= 3 detected (spacing-token confusion?):",
		);
		for (const v of lineHeightHits) {
			console.error(`  ${v.file}:${v.line}  lineHeight: "${v.value}"`);
		}
	}
	if (colorMixHits.length > 0) {
		console.error(
			"panda-token-values: underscore inside color-mix() (Panda emits it verbatim; the declaration is dropped):",
		);
		for (const v of colorMixHits) {
			console.error(`  ${v.file}:${v.line}  ${v.value}`);
		}
	}
	if (bracketHits.length > 0) {
		console.error(
			"panda-token-values: underscore inside [...] arbitrary value (Panda emits it verbatim; the declaration is dropped):",
		);
		for (const v of bracketHits) {
			console.error(`  ${v.file}:${v.line}  "${v.value}"`);
		}
	}
	console.error(
		"\nUse a rem/px value or named token for lineHeight; write color-mix() arguments and bracket arbitrary values as valid CSS with real spaces.",
	);
	process.exit(1);
}

console.log("panda-token-values: ok");
