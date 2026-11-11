#!/usr/bin/env bun

import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

type RedundancyKind = "path" | "vertical" | "horizontal";

type Warning = {
	file: string;
	kind: RedundancyKind;
	word: string;
	count: number;
	detail: string;
};

type SegmentTokens = {
	segment: string;
	tokens: string[];
};

const DEFAULT_ROOTS = ["src"];
const SKIP_DIRS = new Set([
	".git",
	"archive",
	"coverage",
	"dist",
	"docs",
	"node_modules",
	"ty-plus-worktrees",
]);

const DEFAULT_IGNORE_WORDS = new Set([
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
]);

const parseArgs = (args: string[]) => {
	const roots: string[] = [];
	let strict = false;
	let maxPathRepeats = 2;
	let maxVerticalRepeats = 1;
	let maxHorizontalRepeats = 1;

	for (let i = 2; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--strict") {
			strict = true;
			continue;
		}
		if (arg === "--root" && args[i + 1]) {
			roots.push(args[i + 1]);
			i++;
			continue;
		}
		if (arg === "--max-path-repeats" && args[i + 1]) {
			maxPathRepeats = Number(args[i + 1]);
			i++;
			continue;
		}
		if (arg === "--max-vertical-repeats" && args[i + 1]) {
			maxVerticalRepeats = Number(args[i + 1]);
			i++;
			continue;
		}
		if (arg === "--max-horizontal-repeats" && args[i + 1]) {
			maxHorizontalRepeats = Number(args[i + 1]);
			i++;
		}
	}

	return {
		roots: roots.length > 0 ? roots : DEFAULT_ROOTS,
		strict,
		maxPathRepeats,
		maxVerticalRepeats,
		maxHorizontalRepeats,
	};
};

const splitCamelCase = (value: string): string =>
	value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

const tokenizeSegment = (segment: string): string[] => {
	const withoutExtension = segment.replace(/\.[^.]+$/u, "");
	const normalized = splitCamelCase(withoutExtension)
		.replace(/[_\-\s.()[\]{}]+/gu, " ")
		.replace(/[^A-Za-z0-9]+/gu, " ");

	return normalized
		.split(/\s+/u)
		.map((token) => token.trim().toLowerCase())
		.filter((token) => token.length >= 2)
		.filter((token) => !DEFAULT_IGNORE_WORDS.has(token));
};

const listFiles = (root: string): string[] => {
	const out: string[] = [];
	if (!existsSync(root)) return out;

	const visit = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (SKIP_DIRS.has(entry.name)) continue;
				visit(fullPath);
				continue;
			}
			if (entry.isFile()) out.push(fullPath);
		}
	};

	visit(root);
	return out;
};

const pathSegmentsFor = (file: string): string[] =>
	relative(process.cwd(), file).split(/[\\/]+/u);

const countByWord = (tokens: string[]): Map<string, number> => {
	const counts = new Map<string, number>();
	for (const token of tokens) {
		counts.set(token, (counts.get(token) ?? 0) + 1);
	}
	return counts;
};

const findWarnings = (
	file: string,
	limits: {
		maxPathRepeats: number;
		maxVerticalRepeats: number;
		maxHorizontalRepeats: number;
	},
): Warning[] => {
	const segments = pathSegmentsFor(file);
	const segmentTokens: SegmentTokens[] = segments.map((segment) => ({
		segment,
		tokens: tokenizeSegment(segment),
	}));
	const warnings: Warning[] = [];
	const rel = relative(process.cwd(), file).replace(/\\/g, "/");

	for (const { segment, tokens } of segmentTokens) {
		for (const [word, count] of countByWord(tokens)) {
			if (count > limits.maxHorizontalRepeats) {
				warnings.push({
					file: rel,
					kind: "horizontal",
					word,
					count,
					detail: `segment "${segment}" repeats "${word}" ${count} times`,
				});
			}
		}
	}

	const segmentsByWord = new Map<string, Set<string>>();
	const allTokens: string[] = [];
	for (const { segment, tokens } of segmentTokens) {
		for (const token of tokens) {
			allTokens.push(token);
			const set = segmentsByWord.get(token) ?? new Set<string>();
			set.add(segment);
			segmentsByWord.set(token, set);
		}
	}

	for (const [word, segmentsWithWord] of segmentsByWord) {
		if (segmentsWithWord.size > limits.maxVerticalRepeats) {
			warnings.push({
				file: rel,
				kind: "vertical",
				word,
				count: segmentsWithWord.size,
				detail: `"${word}" appears in ${segmentsWithWord.size} path levels: ${[
					...segmentsWithWord,
				].join(" / ")}`,
			});
		}
	}

	for (const [word, count] of countByWord(allTokens)) {
		if (count > limits.maxPathRepeats) {
			warnings.push({
				file: rel,
				kind: "path",
				word,
				count,
				detail: `"${word}" appears ${count} times in the full path`,
			});
		}
	}

	return warnings;
};

const main = () => {
	const options = parseArgs(process.argv);
	const files = options.roots.flatMap((root) => listFiles(resolve(root)));
	const warnings = files.flatMap((file) => findWarnings(file, options));

	if (warnings.length === 0) {
		console.log("naming-redundancy: PASS - no redundant path naming found.");
		return;
	}

	console.log(
		`naming-redundancy: ${warnings.length} warning(s) found across ${files.length} file(s).`,
	);
	for (const warning of warnings) {
		console.log(
			`${warning.file} [${warning.kind}] ${warning.word} x${warning.count}`,
		);
		console.log(`  ${warning.detail}`);
	}

	if (options.strict) {
		process.exit(1);
	}
};

main();
