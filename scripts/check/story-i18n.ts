#!/usr/bin/env bun
/**
 * story-i18n.ts
 *
 * Guards Storybook stories against key-echoing translator stubs. Components
 * that accept an injected `t` prop must receive real translations in stories
 * (`storyT("<ns>")` from `src/storybook/i18n-story-t.ts`); a stub that returns
 * the key renders raw i18n keys into screenshots, which silently invalidates
 * every visual review and snapshot comparison built on them (#435).
 *
 * Flagged patterns in `*.stories.tsx` / `*.stories.ts`:
 *   - any identifier containing `stubT`
 *   - arrow/function translators that echo their key argument
 *     (`(key) => key`, `function t(key) { return key }`)
 *   - `?? key` fallbacks inside translator-shaped helpers
 *
 * Exit codes:
 *   0 - All checks pass
 *   1 - One or more violations detected
 */

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

const STORY_FILE = /\.stories\.[tj]sx?$/;

const PATTERNS_ALWAYS: { re: RegExp; label: string }[] = [
	{ re: /\bstubT\b/, label: "stubT identifier" },
];

// Echo patterns only apply to files that inject a `t` prop — elsewhere a
// bare `key`/`return key` is ordinary code, not a translator stub.
const PATTERNS_T_PROP: { re: RegExp; label: string }[] = [
	{
		re: /=>\s*(?:\(\s*)?key\s*\)?\s*;?/,
		label: "arrow returning its key argument",
	},
	{ re: /return\s+key\s*;/, label: "translator returning its key argument" },
	{ re: /\?\?\s*key\b/, label: "`?? key` fallback in translator" },
];

const T_PROP_RE = /\bt=\{/;

const collectFiles = (dir: string): string[] => {
	const out: string[] = [];
	let entries: ReturnType<typeof readdirSync>;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const ent of entries) {
		const p = join(dir, ent.name);
		if (ent.isDirectory()) {
			if (!SKIP_DIRS.has(ent.name)) out.push(...collectFiles(p));
		} else if (STORY_FILE.test(ent.name)) {
			out.push(p);
		}
	}
	return out;
};

const violations: { file: string; line: number; label: string }[] = [];

for (const dir of SCAN_DIRS) {
	for (const file of collectFiles(join(REPO_ROOT, dir))) {
		const text = readFileSync(file, "utf8");
		const patterns = T_PROP_RE.test(text)
			? [...PATTERNS_ALWAYS, ...PATTERNS_T_PROP]
			: PATTERNS_ALWAYS;
		const lines = text.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? "";
			for (const { re, label } of patterns) {
				re.lastIndex = 0;
				if (re.test(line)) {
					violations.push({
						file: file.slice(REPO_ROOT.length + 1),
						line: i + 1,
						label,
					});
					break;
				}
			}
		}
	}
}

if (violations.length > 0) {
	console.error(
		"story-i18n: key-echoing translator stubs found in stories (use storyT from src/storybook/i18n-story-t):",
	);
	for (const v of violations) {
		console.error(`  ${v.file}:${v.line}  ${v.label}`);
	}
	process.exit(1);
}

console.log("story-i18n: ok");
