#!/usr/bin/env node
/**
 * check-workspace-class-hooks.ts
 *
 * Forbids workspace-specific CSS class hooks / selectors in active workspace implementation.
 *
 * Workspace widgets are rendered into a Shadow DOM shell. The host page applies a
 * post-processing step (see background-canvas-style.ts) that uses CSS class names as
 * hooks to inject Tailwind-generated styles. If a workspace file contains a hardcoded
 * class name that overlaps with those hooks, the post-processing will misfire on
 * unrelated elements.
 *
 * This script scans workspace source files for string literals and template
 * expressions that look like CSS class names, catching regressions early.
 *
 * Exit codes:
 *   0 - No workspace-specific class patterns found (pass)
 *   1 - Workspace-specific class patterns detected (fail)
 */

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// Workspace source root
const WORKSPACE_SRC = resolve("src", "management", "workspace");
const FUNCTION_WIDGET = resolve("src", "function", "widget", "workspace");

// Post-processing hooks used by background-canvas-style.ts
// These class names are consumed by the host-page CSS injection and must NOT appear
// in workspace source as class attribute strings.
const PROTECTED_HOOKS = new Set([
	"ws-item",
	"ws-tile",
	"ws-grid",
	"ws-grid-item",
	"ws-placement",
	"ws-selection-rect",
	"ws-placeholder",
	"ws-widget",
]);

// Regex to match class attribute values — both JSX className and HTML class attribute
const CLASS_ATTR_PATTERN = /(?:className|class)=["']([^"']+)["']/g;

// Regex to detect string literals in template literals (double or single quoted)
const LITERAL_CLASS_EXTRACT =
	/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;

const SKIP_DIRS = new Set(["node_modules", ".git", "docs", "archive"]);

/**
 * Scan a JS/TS/TSX file for class attribute values that contain workspace hooks.
 */
function scanFile(filePath, content) {
	const violations = [];
	const lines = content.split("\n");

	for (let li = 0; li < lines.length; li++) {
		const line = lines[li];
		const trimmed = line.trim();

		// Skip comments
		if (
			trimmed.startsWith("//") ||
			trimmed.startsWith("*") ||
			trimmed.startsWith("/*")
		) {
			continue;
		}

		// Skip querySelector[All] / matches / closest — these are CSS selector strings,
		// not DOM class assignments. The risk is class attributes set inside Shadow DOM
		// conflicting with host-page post-processing, not selector lookups.
		const SELECTOR_PATTERNS = [
			/\bquerySelector[A-Za-z]*\s*\(/,
			/\bmatches\s*\(/,
			/\.closest\s*\(/,
		];
		if (SELECTOR_PATTERNS.some((p) => p.test(trimmed))) continue;

		// Skip lines that start with a quote followed by a selector character (. or [)
		// e.g., '.ws-grid' or '[data-foo]' — selector literals, not class assignments
		if (/^\s*["'][.[]/.test(trimmed)) continue;

		// Match class="..." or className="..."
		let m: RegExpExecArray | null = null;
		CLASS_ATTR_PATTERN.lastIndex = 0;
		m = CLASS_ATTR_PATTERN.exec(line);
		while (m !== null) {
			const attrValue = m[1];
			for (const hook of PROTECTED_HOOKS) {
				const tokenPattern = new RegExp(`\\b${hook}\\b`);
				if (tokenPattern.test(attrValue)) {
					violations.push({
						line: li + 1,
						col: m.index + 1,
						hook,
						snippet: line.trim().slice(0, 120),
					});
				}
			}
			m = CLASS_ATTR_PATTERN.exec(line);
		}

		// Check template literal string content for class-like strings
		let m2: RegExpExecArray | null = null;
		LITERAL_CLASS_EXTRACT.lastIndex = 0;
		m2 = LITERAL_CLASS_EXTRACT.exec(line);
		while (m2 !== null) {
			const str = m2[1] ?? m2[2];
			if (str) {
				for (const hook of PROTECTED_HOOKS) {
					const tokenPattern = new RegExp(`\\b${hook}\\b`);
					if (tokenPattern.test(str)) {
						violations.push({
							line: li + 1,
							col: m2.index + 1,
							hook,
							snippet: line.trim().slice(0, 120),
						});
					}
				}
			}
			m2 = LITERAL_CLASS_EXTRACT.exec(line);
		}
	}

	return violations;
}

function walkFiles(dir) {
	const results = [];
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (SKIP_DIRS.has(entry.name)) continue;
				results.push(...walkFiles(full));
			} else if (
				entry.isFile() &&
				/\.(ts|tsx|mjs)$/.test(entry.name) &&
				!/\.test\.(ts|tsx)$/.test(entry.name)
			) {
				results.push(full);
			}
		}
	} catch {
		// Directory doesn't exist
	}
	return results;
}

async function main() {
	const files = [...walkFiles(WORKSPACE_SRC), ...walkFiles(FUNCTION_WIDGET)];

	const allViolations = [];

	for (const file of files) {
		const content = await Bun.file(file).text();
		const violations = scanFile(file, content);
		if (violations.length > 0) {
			allViolations.push({ file, violations });
		}
	}

	if (allViolations.length === 0) {
		console.log(
			"check-workspace-class-hooks: PASS — no workspace-specific class hook regressions found.",
		);
		process.exit(0);
	}

	console.error(
		"check-workspace-class-hooks: FAIL — workspace-specific class hook violations:",
	);
	console.error("");
	for (const { file, violations } of allViolations) {
		const cwd = resolve();
		const rel = file.replace(`${cwd}\\`, "").replace(`${cwd}/`, "");
		for (const v of violations) {
			console.error(`  ${rel}:${v.line}:${v.col} — protected hook "${v.hook}"`);
			console.error(`    ${v.snippet}`);
		}
	}
	console.error("");
	console.error(
		"Workspace class hooks (ws-item, ws-tile, etc.) are consumed by host-page CSS injection.",
	);
	console.error(
		"Do not use these class names in workspace source as class attribute values.",
	);

	process.exit(1);
}

main();
