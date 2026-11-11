#!/usr/bin/env bun
/**
 * check-no-tailwind-literals.ts
 *
 * Active-runtime Tailwind utility literal detector. The PandaCSS migration
 * (ADR `docs/decisions/2026-09-12-pandacss-adoption.md`) requires every active
 * runtime path to express styling through PandaCSS `css()` / `styled()` /
 * recipes. Tailwind utility literals left over on the active runtime path
 * produce zero CSS in the Panda-only bundle and silently break the layout
 * (the failure mode #127 captured).
 *
 * Scope:
 *   - active src tree (TypeScript and TSX, excluding test/story fixtures)
 *   - Flags raw class strings (string literals or template literals) that
 *     contain a recognizable Tailwind utility token.
 *   - Allows intentional semantic hook classes (e.g. `onboarding-text`,
 *     `control-panel`, `ty-...`) used by the appearance-boot CSS layer.
 *
 * Exit codes:
 *   0 - All checks pass
 *   1 - One or more violations detected
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = process.cwd();

const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	"docs",
	"archive",
	"dist",
	"coverage",
	".tmp",
]);

/**
 * Recognized Tailwind utility tokens. Tightened to the patterns that have
 * actually appeared in this codebase (see #127). Tokens are tested against
 * className string / template literals after comments are stripped.
 */
const TAILWIND_UTILITIES = [
	// layout primitives
	"flex",
	"grid",
	"block",
	"inline",
	"inline-block",
	"inline-flex",
	"hidden",
	// spacing
	"p-0",
	"p-1",
	"p-2",
	"p-3",
	"p-4",
	"p-5",
	"p-6",
	"p-8",
	"p-10",
	"p-12",
	"px-0",
	"px-1",
	"px-2",
	"px-3",
	"px-4",
	"px-5",
	"px-6",
	"px-8",
	"px-10",
	"py-0",
	"py-1",
	"py-2",
	"py-3",
	"py-4",
	"py-5",
	"py-6",
	"py-8",
	"py-10",
	"m-0",
	"m-1",
	"m-2",
	"m-3",
	"m-4",
	"m-5",
	"m-6",
	"m-8",
	"m-10",
	"mx-0",
	"mx-1",
	"mx-2",
	"mx-3",
	"mx-4",
	"mx-5",
	"mx-6",
	"my-0",
	"my-1",
	"my-2",
	"my-3",
	"my-4",
	"my-5",
	"my-6",
	"mt-0",
	"mt-1",
	"mt-2",
	"mt-3",
	"mt-4",
	"mt-5",
	"mt-6",
	"mt-8",
	"mt-10",
	"mb-0",
	"mb-1",
	"mb-2",
	"mb-3",
	"mb-4",
	"mb-5",
	"mb-6",
	"mb-8",
	"mb-10",
	"ml-0",
	"ml-1",
	"ml-2",
	"ml-3",
	"ml-4",
	"ml-5",
	"ml-6",
	"mr-0",
	"mr-1",
	"mr-2",
	"mr-3",
	"mr-4",
	"mr-5",
	"mr-6",
	// sizing
	"h-0",
	"h-1",
	"h-2",
	"h-3",
	"h-4",
	"h-5",
	"h-6",
	"h-7",
	"h-8",
	"h-9",
	"h-10",
	"h-12",
	"h-16",
	"h-20",
	"h-24",
	"h-32",
	"h-40",
	"h-48",
	"h-full",
	"h-screen",
	"h-max",
	"h-min",
	"h-fit",
	"w-0",
	"w-1",
	"w-2",
	"w-3",
	"w-4",
	"w-5",
	"w-6",
	"w-7",
	"w-8",
	"w-9",
	"w-10",
	"w-12",
	"w-16",
	"w-20",
	"w-24",
	"w-32",
	"w-40",
	"w-48",
	"w-full",
	"w-screen",
	"w-max",
	"w-min",
	"w-fit",
	"min-w-0",
	"min-w-full",
	"max-w-0",
	"max-w-1",
	"max-w-2",
	"max-w-3",
	"max-w-4",
	"max-w-5",
	"max-w-6",
	"max-w-full",
	"max-w-xs",
	"max-w-sm",
	"max-w-md",
	"max-w-lg",
	"max-w-xl",
	"max-w-2xl",
	"max-w-3xl",
	"max-w-4xl",
	"max-w-5xl",
	"min-h-0",
	"min-h-full",
	"min-h-screen",
	"max-h-full",
	"max-h-screen",
	// position
	"fixed",
	"absolute",
	"relative",
	"sticky",
	"static",
	"top-0",
	"top-1",
	"top-2",
	"top-4",
	"top-8",
	"top-10",
	"bottom-0",
	"bottom-1",
	"bottom-2",
	"bottom-4",
	"bottom-8",
	"bottom-10",
	"bottom-11",
	"left-0",
	"left-1",
	"left-2",
	"left-4",
	"right-0",
	"right-1",
	"right-2",
	"right-4",
	"left-1/2",
	"left-1/3",
	"right-1/2",
	"right-1/3",
	"top-1/2",
	"top-1/3",
	"bottom-1/2",
	"bottom-1/3",
	"left-auto",
	"right-auto",
	"top-auto",
	"bottom-auto",
	"inset-0",
	"inset-x-0",
	"inset-y-0",
	"inset-1",
	"inset-2",
	"inset-4",
	// z-index
	"z-0",
	"z-10",
	"z-20",
	"z-30",
	"z-40",
	"z-50",
	// flex/grid helpers
	"flex-col",
	"flex-row",
	"flex-wrap",
	"flex-nowrap",
	"flex-1",
	"items-start",
	"items-center",
	"items-end",
	"items-stretch",
	"justify-start",
	"justify-center",
	"justify-end",
	"justify-between",
	"justify-around",
	"justify-evenly",
	"gap-0",
	"gap-1",
	"gap-2",
	"gap-3",
	"gap-4",
	"gap-5",
	"gap-6",
	"gap-8",
	"gap-10",
	"grid-cols-1",
	"grid-cols-2",
	"grid-cols-3",
	"grid-cols-4",
	"grid-cols-6",
	"grid-cols-12",
	"grid-rows-1",
	"grid-rows-2",
	"grid-rows-3",
	"grid-rows-4",
	"col-span-1",
	"col-span-2",
	"col-span-3",
	"col-span-4",
	"col-span-6",
	"col-span-full",
	"row-span-1",
	"row-span-2",
	"row-span-3",
	"row-span-full",
	// sizing helpers
	"box-border",
	"box-content",
	"overflow-hidden",
	"overflow-auto",
	"overflow-x-hidden",
	"overflow-x-auto",
	"overflow-y-hidden",
	"overflow-y-auto",
	// borders
	"rounded",
	"rounded-sm",
	"rounded-md",
	"rounded-lg",
	"rounded-full",
	"border",
	"border-0",
	"border-2",
	"border-4",
	"border-t",
	"border-b",
	"border-l",
	"border-r",
	// text
	"text-xs",
	"text-sm",
	"text-base",
	"text-lg",
	"text-xl",
	"text-2xl",
	"text-3xl",
	"text-4xl",
	"text-5xl",
	"font-bold",
	"font-semibold",
	"font-medium",
	"font-normal",
	"font-light",
	"italic",
	"underline",
	"no-underline",
	// color (named tailwind color prefixes)
	"bg-app",
	"bg-widget",
	"bg-dialog",
	"bg-overlay",
	"text-primary",
	"text-muted",
	"text-accent",
	// transition
	"transition",
	"transition-colors",
	"transition-all",
	"transition-opacity",
	"duration-100",
	"duration-200",
	"duration-300",
	// shadows
	"shadow-sm",
	"shadow-md",
	"shadow-lg",
	"shadow-xl",
] as const;

const TAILWIND_REGEX = new RegExp(`\\b(?:${TAILWIND_UTILITIES.join("|")})\\b`);

/**
 * Semantic hook classes that are NOT Tailwind utilities. They are intentional
 * markers consumed by the appearance-boot CSS layer (`src/management/panel/styles/app.css`)
 * and the styled-system token layer. These must remain available.
 */
const SEMANTIC_HOOK_ALLOWLIST = [
	"onboarding-text",
	"onboarding-text--caption",
	"onboarding-text--muted",
	"control-panel",
	"ty-control-panel",
	"ty-shell-directory-scroll",
	"dbg-input",
	"dbg-resize",
] as const;

/**
 * Extract class-string literals from the source. We scan `className="..."`
 * and `class=` (template) occurrences and ignore `className={css({...})}` and
 * `className={cx(...)}` expressions (those are Panda-driven).
 */
const CLASS_STRING_PATTERN =
	/(?:className|class)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const CLASS_TEMPLATE_PATTERN = /(?:className|class)\s*=\s*`([^`]*)`/g;

/**
 * Imperative DOM updates that add/remove/toggle Tailwind utility classes by
 * name. They must use PandaCSS recipe class strings instead — Tailwind tokens
 * silently no-op against a Panda-only bundle.
 */
const CLASSLIST_LITERAL_PATTERN =
	/classList\.(?:add|remove|toggle|replace)\(\s*(?:"([^"]*)"|'([^']*)')/g;

type Violation = {
	file: string;
	line: number;
	token: string;
	excerpt: string;
};

function stripComments(content: string): string {
	let stripped = content.replace(/\/\/[^\n]*/g, "");
	stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, "");
	return stripped;
}

function walkFiles(dir: string): string[] {
	const results: string[] = [];
	let entries: { name: string; isFile(): boolean; isDirectory(): boolean }[];
	try {
		entries = readdirSync(dir, { withFileTypes: true }) as never;
	} catch {
		return results;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			results.push(...walkFiles(full));
			continue;
		}
		if (!entry.isFile()) continue;
		if (
			/\.(ts|tsx)$/.test(entry.name) &&
			!/\.test\.(ts|tsx)$/.test(entry.name) &&
			!/\.stories\.tsx$/.test(entry.name)
		) {
			results.push(full);
		}
	}
	return results;
}

function lineNumberAt(text: string, offset: number): number {
	let count = 1;
	for (let i = 0; i < offset && i < text.length; i++) {
		if (text.charCodeAt(i) === 10) count++;
	}
	return count;
}

function scanFile(filePath: string): Violation[] {
	const violations: Violation[] = [];
	const text = stripComments(readFileSync(filePath, "utf8"));

	const scanMatch = (raw: string, pattern: RegExp): void => {
		let match: RegExpExecArray | null;
		pattern.lastIndex = 0;
		while ((match = pattern.exec(raw)) !== null) {
			const value = match[1] ?? match[2] ?? "";
			if (!value) continue;
			const tokens = value.split(/\s+/);
			for (const token of tokens) {
				if (!token) continue;
				if (
					SEMANTIC_HOOK_ALLOWLIST.some(
						(allowed) => token === allowed || token.startsWith(`${allowed}__`),
					)
				) {
					continue;
				}
				if (TAILWIND_REGEX.test(token)) {
					violations.push({
						file: filePath,
						line: lineNumberAt(raw, match.index),
						token,
						excerpt: value.trim().slice(0, 80),
					});
				}
			}
		}
	};

	scanMatch(text, CLASS_STRING_PATTERN);
	scanMatch(text, CLASS_TEMPLATE_PATTERN);
	scanMatch(text, CLASSLIST_LITERAL_PATTERN);
	return violations;
}

const allViolations: Violation[] = [];
for (const file of walkFiles(resolve(REPO_ROOT, "src"))) {
	allViolations.push(...scanFile(file));
}

if (allViolations.length === 0) {
	process.stdout.write(
		"[check-no-tailwind-literals] ✓ no active Tailwind utility literals in src/\n",
	);
	process.exit(0);
}

process.stderr.write(
	`[check-no-tailwind-literals] ✗ ${allViolations.length} Tailwind utility literal(s) on the active runtime path:\n`,
);
for (const v of allViolations) {
	const rel = v.file.replace(`${REPO_ROOT}/`, "");
	process.stderr.write(
		`  ${rel}:${v.line}  token="${v.token}"  excerpt="${v.excerpt}"\n`,
	);
}
process.exit(1);
