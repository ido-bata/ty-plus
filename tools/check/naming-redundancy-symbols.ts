#!/usr/bin/env bun

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
	getNamedSymbols as extractNamedSymbols,
	type NamedSymbol,
} from "./lib/extract.js";

type WarningKind = "symbol-path" | "symbol-self";

type Warning = {
	file: string;
	line: number;
	kind: WarningKind;
	symbol: string;
	word: string;
	count: number;
	detail: string;
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

const parseArgs = (args: string[]) => {
	const roots: string[] = [];
	let strict = false;
	let maxSymbolPathRepeats = 1;
	let maxSymbolSelfRepeats = 1;

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
		if (arg === "--max-symbol-path-repeats" && args[i + 1]) {
			maxSymbolPathRepeats = Number(args[i + 1]);
			i++;
			continue;
		}
		if (arg === "--max-symbol-self-repeats" && args[i + 1]) {
			maxSymbolSelfRepeats = Number(args[i + 1]);
			i++;
		}
	}

	return {
		roots: roots.length > 0 ? roots : DEFAULT_ROOTS,
		strict,
		maxSymbolPathRepeats,
		maxSymbolSelfRepeats,
	};
};

const splitCamelCase = (value: string): string =>
	value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

const tokenize = (value: string): string[] => {
	const withoutExtension = value.replace(/\.[^.]+$/u, "");
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
			if (entry.isFile() && /\.(ts|tsx)$/u.test(entry.name)) {
				out.push(fullPath);
			}
		}
	};

	visit(root);
	return out;
};

const countByWord = (tokens: string[]): Map<string, number> => {
	const counts = new Map<string, number>();
	for (const token of tokens) {
		counts.set(token, (counts.get(token) ?? 0) + 1);
	}
	return counts;
};

const getNamedSymbols = (filePath: string): NamedSymbol[] => {
	const sourceText = readFileSync(filePath, "utf-8");
	return extractNamedSymbols(filePath, sourceText);
};

const pathTokensFor = (file: string): string[] =>
	relative(process.cwd(), file)
		.split(/[\\/]+/u)
		.flatMap((segment) => tokenize(segment));

const findWarnings = (
	file: string,
	limits: {
		maxSymbolPathRepeats: number;
		maxSymbolSelfRepeats: number;
	},
): Warning[] => {
	const rel = relative(process.cwd(), file).replace(/\\/g, "/");
	const pathTokenCounts = countByWord(pathTokensFor(file));
	const warnings: Warning[] = [];

	for (const symbol of getNamedSymbols(file)) {
		const symbolTokens = tokenize(symbol.name);
		for (const [word, count] of countByWord(symbolTokens)) {
			if (count > limits.maxSymbolSelfRepeats) {
				warnings.push({
					file: rel,
					line: symbol.line,
					kind: "symbol-self",
					symbol: symbol.name,
					word,
					count,
					detail: `symbol "${symbol.name}" repeats "${word}" ${count} times`,
				});
			}
		}

		for (const word of new Set(symbolTokens)) {
			const pathCount = pathTokenCounts.get(word) ?? 0;
			if (pathCount > limits.maxSymbolPathRepeats) {
				warnings.push({
					file: rel,
					line: symbol.line,
					kind: "symbol-path",
					symbol: symbol.name,
					word,
					count: pathCount,
					detail: `symbol "${symbol.name}" repeats path word "${word}" found ${pathCount} time(s) in path`,
				});
			}
		}
	}

	return warnings;
};

const main = () => {
	const options = parseArgs(process.argv);
	const files = options.roots.flatMap((root) => listFiles(resolve(root)));
	const warnings = files.flatMap((file) => findWarnings(file, options));

	if (warnings.length === 0) {
		console.log(
			"naming-redundancy-symbols: PASS - no redundant function naming found.",
		);
		return;
	}

	console.log(
		`naming-redundancy-symbols: ${warnings.length} warning(s) found across ${files.length} file(s).`,
	);
	for (const warning of warnings) {
		console.log(
			`${warning.file}:${warning.line} [${warning.kind}] ${warning.symbol} -> ${warning.word} x${warning.count}`,
		);
		console.log(`  ${warning.detail}`);
	}

	if (options.strict) {
		process.exit(1);
	}
};

main();
