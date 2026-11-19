#!/usr/bin/env bun
/**
 * Checks that the generated ExtendScript .jsx file is ExtendScript-compatible.
 * Fails if it contains syntax or built-in APIs that the ExtendScript engine
 * cannot parse or execute.
 *
 * ExtendScript (Adobe's JS engine) supports some non-ES3 syntax in practice:
 * - const/let (ES5)
 * - arrow functions (ES6 but supported in ExtendScript)
 * - for...of loops (ES6 but supported in ExtendScript)
 * - template literals (ES6 but supported in ExtendScript)
 *
 * What it does NOT support:
 * - class declarations (needs ES3-compatible alternative)
 * - class extends
 * - async/await (needs transpilation)
 * - Promise, Map, Set, Symbol constructors
 * - Proxy
 * - Object.hasOwn
 * - Array.isArray
 * - Import/export statements
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const JSX_OUTPUT_PATH = join(
	import.meta.dirname,
	"../../dist/cep-dev/jsx/ty-plus-host.jsx",
);

// Patterns that are incompatible with ExtendScript syntax/runtime APIs.
// Note: const/let, arrow functions, for...of ARE supported in ExtendScript engine
const INCOMPATIBLE_PATTERNS = [
	{ pattern: /\bclass\s+\w+/, name: "class declaration" },
	{ pattern: /\bextends\s+/, name: "class extends" },
	{ pattern: /\basync\s+/, name: "async keyword" },
	{ pattern: /\bawait\s+/, name: "await keyword" },
	// Only actual usage, not in comments/strings
	{ pattern: /new\s+Symbol\s*\(/, name: "Symbol constructor" },
	{ pattern: /new\s+Map\s*\(/, name: "Map constructor" },
	{ pattern: /new\s+Set\s*\(/, name: "Set constructor" },
	{ pattern: /new\s+Promise\s*\(/, name: "Promise constructor" },
	{ pattern: /new\s+Proxy\s*\(/, name: "Proxy constructor" },
	{ pattern: /Array\.isArray\s*\(/, name: "Array.isArray call" },
	{ pattern: /Object\.hasOwn\s*\(/, name: "Object.hasOwn call" },
	{ pattern: /\bimport\s+/, name: "import statement" },
	{ pattern: /\bexport\s+/, name: "export statement" },
];

function checkES3Compatibility(filePath: string): boolean {
	if (!existsSync(filePath)) {
		console.error(`! File not found: ${filePath}`);
		console.error(
			"   Run 'bun run build:extendscript-host' to generate the ExtendScript bundle.",
		);
		return false;
	}

	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");
	let hasError = false;

	for (const { pattern, name } of INCOMPATIBLE_PATTERNS) {
		const matches: Array<{ line: number; text: string }> = [];

		for (let i = 0; i < lines.length; i++) {
			if (pattern.test(lines[i])) {
				matches.push({ line: i + 1, text: lines[i].trim() });
			}
		}

		if (matches.length > 0) {
			hasError = true;
			console.error(`[!] Found incompatible syntax: ${name}`);
			for (const match of matches.slice(0, 3)) {
				console.error(`   Line ${match.line}: ${match.text}`);
			}
			if (matches.length > 3) {
				console.error(`   ... and ${matches.length - 3} more`);
			}
		}
	}

	if (!hasError) {
		console.log(`[+] ${filePath} is ExtendScript-compatible`);
	}

	return !hasError;
}

const isCompatible = checkES3Compatibility(JSX_OUTPUT_PATH);
process.exit(isCompatible ? 0 : 1);
