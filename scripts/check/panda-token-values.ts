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

const violations: { file: string; line: number; value: string }[] = [];

for (const dir of SCAN_DIRS) {
	for (const file of collectFiles(join(REPO_ROOT, dir))) {
		const text = readFileSync(file, "utf8");
		if (!text.includes("lineHeight")) continue;
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
						value: raw,
					});
				}
			}
		}
	}
}

if (violations.length > 0) {
	console.error(
		"panda-token-values: unitless lineHeight >= 3 detected (spacing-token confusion?):",
	);
	for (const v of violations) {
		console.error(`  ${v.file}:${v.line}  lineHeight: "${v.value}"`);
	}
	console.error(
		"\nUse a rem/px value, a named token (tight/snug/normal/relaxed), or an explicit multiplier <= 2.9.",
	);
	process.exit(1);
}

console.log("panda-token-values: ok");
