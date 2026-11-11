/**
 * Naming sensor — detects redundant, bloated path and symbol naming.
 *
 * Checks three kinds of path redundancy (horizontal, vertical, path-wide)
 * and two kinds of symbol redundancy (symbol-self, symbol-path).
 *
 * INV-7: severity-ranked, non-blocking.
 * INV-8: additive only.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
	getNamedSymbols as extractNamedSymbols,
	type NamedSymbol,
} from "../../lib/extract.js";
import type { Finding, Severity } from "../types.js";

export function run(srcRoot: string): Finding[] {
	const findings: Finding[] = [];

	if (!existsSync(srcRoot)) return findings;

	const files = collectSourceFiles(srcRoot);

	// Path-level redundancy
	for (const file of files) {
		findings.push(...checkPathRedundancy(file, srcRoot));
	}

	// Symbol-level redundancy (TypeScript only)
	for (const file of files) {
		if (file.endsWith(".ts") || file.endsWith(".tsx")) {
			findings.push(...checkSymbolRedundancy(file, srcRoot));
		}
	}

	return findings;
}

// ---------------------------------------------------------------------------
// Path redundancy
// ---------------------------------------------------------------------------

function checkPathRedundancy(file: string, srcRoot: string): Finding[] {
	const findings: Finding[] = [];
	const rel = relative(process.cwd(), file).replace(/\\/g, "/");
	const segments = rel.split(/[/\\]/u);

	const segmentTokens = segments.map((seg) => ({
		segment: seg,
		tokens: tokenize(seg),
	}));

	const allTokens = segmentTokens.flatMap((s) => s.tokens);
	const tokenCounts = countByWord(allTokens);

	// Horizontal: same token repeats within a single path segment
	for (const { segment, tokens } of segmentTokens) {
		const localCounts = countByWord(tokens);
		for (const [word, count] of localCounts) {
			if (count > 1) {
				findings.push(
					makeFinding(
						severityFor(count, 1, 3),
						file,
						undefined,
						`horizontal: segment "${segment}" repeats "${word}" ${count}x`,
						weightFor(count, 1, 3),
						"naming",
					),
				);
			}
		}
	}

	// Vertical: same token appears across many path levels
	const tokensByWord = new Map<string, Set<string>>();
	for (const { segment, tokens } of segmentTokens) {
		for (const token of tokens) {
			const set = tokensByWord.get(token) ?? new Set<string>();
			set.add(segment);
			tokensByWord.set(token, set);
		}
	}
	for (const [word, segmentsWithWord] of tokensByWord) {
		if (segmentsWithWord.size > 1) {
			findings.push(
				makeFinding(
					severityFor(segmentsWithWord.size, 1, 3),
					file,
					undefined,
					`vertical: "${word}" appears in ${segmentsWithWord.size} path levels`,
					weightFor(segmentsWithWord.size, 1, 3),
					"naming",
				),
			);
		}
	}

	// Path-wide: same token repeats across the entire path
	for (const [word, count] of tokenCounts) {
		if (count > 2) {
			findings.push(
				makeFinding(
					severityFor(count, 2, 4),
					file,
					undefined,
					`path-wide: "${word}" appears ${count}x across full path`,
					weightFor(count, 2, 4),
					"naming",
				),
			);
		}
	}

	return findings;
}

// ---------------------------------------------------------------------------
// Symbol redundancy
// ---------------------------------------------------------------------------

function checkSymbolRedundancy(file: string, srcRoot: string): Finding[] {
	const findings: Finding[] = [];
	const pathTokenCounts = countByWord(pathTokensFor(file, srcRoot));

	const symbols = getNamedSymbols(file);
	for (const symbol of symbols) {
		const symbolTokens = tokenize(symbol.name);
		const symbolTokenCounts = countByWord(symbolTokens);

		// symbol-self: token repeated within the symbol name itself
		for (const [word, count] of symbolTokenCounts) {
			if (count > 1) {
				findings.push(
					makeFinding(
						severityFor(count, 1, 3),
						file,
						symbol.line,
						`symbol-self: "${symbol.name}" repeats "${word}" ${count}x`,
						weightFor(count, 1, 3),
						"naming",
					),
				);
			}
		}

		// symbol-path: symbol name token mirrors a token in the file path
		for (const word of new Set(symbolTokens)) {
			const pathCount = pathTokenCounts.get(word) ?? 0;
			if (pathCount > 1) {
				findings.push(
					makeFinding(
						severityFor(pathCount, 1, 3),
						file,
						symbol.line,
						`symbol-path: "${symbol.name}" shares "${word}" with path (${pathCount}x in path)`,
						weightFor(pathCount, 1, 3),
						"naming",
					),
				);
			}
		}
	}

	return findings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
	".git",
	"archive",
	"coverage",
	"dist",
	"docs",
	"node_modules",
	"ty-plus-worktrees",
]);

const IGNORE_WORDS = new Set([
	"ts",
	"tsx",
	"js",
	"jsx",
	"mjs",
	"cjs",
	"json",
	"css",
	"html",
	"md",
	"test",
	"spec",
	"index",
	"src",
	"use",
	"get",
	"set",
	"on",
	"to",
	"from",
	"create",
	"build",
	"parse",
	"read",
	"write",
	"handle",
]);

const splitCamelCase = (value: string): string =>
	value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

function tokenize(value: string): string[] {
	const withoutExt = value.replace(/\.[^.]+$/u, "");
	const normalized = splitCamelCase(withoutExt)
		.replace(/[_\-\s.()[\]{}]+/gu, " ")
		.replace(/[^A-Za-z0-9]+/gu, " ");

	return normalized
		.split(/\s+/u)
		.map((t) => t.trim().toLowerCase())
		.filter((t) => t.length >= 2)
		.filter((t) => !IGNORE_WORDS.has(t));
}

function countByWord(tokens: string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const token of tokens) {
		counts.set(token, (counts.get(token) ?? 0) + 1);
	}
	return counts;
}

function pathTokensFor(file: string, srcRoot: string): string[] {
	return relative(srcRoot, file)
		.split(/[/\\]+/u)
		.flatMap((seg) => tokenize(seg));
}

function collectSourceFiles(root: string): string[] {
	const files: string[] = [];
	walkDir(root, [".ts", ".tsx"], (file) => {
		files.push(file);
	});
	return files;
}

function walkDir(
	dir: string,
	extensions: string[],
	cb: (file: string) => void,
): void {
	if (!existsSync(dir)) return;
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (SKIP_DIRS.has(entry.name)) continue;
				walkDir(full, extensions, cb);
			} else if (extensions.some((ext) => entry.name.endsWith(ext))) {
				cb(full);
			}
		}
	} catch {
		// skip unreadable dirs
	}
}

function getNamedSymbols(filePath: string): NamedSymbol[] {
	const sourceText = readFileSync(filePath, "utf-8");
	return extractNamedSymbols(filePath, sourceText);
}

function makeFinding(
	severity: Severity,
	file: string,
	line: number | undefined,
	message: string,
	weight: number,
	sensor: string,
): Finding {
	return {
		sensor,
		severity,
		file,
		line,
		message,
		weight,
		ruleRef: "INV-7",
	};
}

function severityFor(
	count: number,
	lowThresh: number,
	highThresh: number,
): Severity {
	if (count > highThresh) return "high";
	if (count > lowThresh) return "medium";
	return "low";
}

function weightFor(
	count: number,
	lowThresh: number,
	highThresh: number,
): number {
	if (count > highThresh) return 4;
	if (count > lowThresh) return 2;
	return 1;
}
