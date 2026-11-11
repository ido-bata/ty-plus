#!/usr/bin/env bun
/**
 * check-storage-forbidden.ts
 *
 * Forbids static storage (localStorage, sessionStorage, runtime-memory-storage)
 * and writes to <supportRoot>/ty-plus/data/ in protected management domains.
 *
 * These domains manage UI state that must survive via the workspace lifecycle
 * and must NOT leak into CEP localStorage (persistent across sessions, unsafe
 * for multi-workspace isolation) or rely on in-memory bridges that are
 * unavailable in the ES runtime context.
 *
 * Allowed exceptions for runtime-memory-storage:
 *   - src/shared/debug   — transient debug utilities
 *   - src/shared/interceptor — transient request/response interceptors
 *   - src/shared/ipc     — IPC bridge files only
 *
 * Legacy read fallback functions (data/settings.json / data/* owner files) are
 * allowed ONLY in these explicitly named store/migration files:
 *   - workspace-layout-store.ts
 *   - catalog-files-store.ts
 *   - settings-files-store.ts
 *   - widget-state-store.ts
 *   - snapshot-store.ts
 *   - cache-store.ts
 *   - storage-migration.ts
 *
 * Exit codes:
 *   0 - No forbidden storage usage found (pass)
 *   1 - Forbidden storage usage detected (fail)
 */

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// Protected domains that must not use static storage
const PROTECTED_DOMAINS = [
	resolve("src", "management", "workspace"),
	resolve("src", "management", "panel", "control"),
	resolve("src", "management", "setting"),
	resolve("src", "management", "i18n"),
	resolve("src", "shared", "i18n"),
	resolve("src", "management", "online", "notification"),
];

// Transient domains exempt from the rule
const EXEMPT_PREFIXES = [
	resolve("src", "shared", "debug"),
	resolve("src", "shared", "interceptor"),
	resolve("src", "shared", "ipc"),
];

// Legacy store files that are allowed to read from data/settings.json or data/* owner files
// for backward compatibility during migration. All new code must use the proper owner stores.
const ALLOWED_LEGACY_STORE_FILES = new Set([
	"workspace-layout-store.ts",
	"catalog-files-store.ts",
	"settings-files-store.ts",
	"widget-state-store.ts",
	"snapshot-store.ts",
	"cache-store.ts",
	"storage-migration.ts",
]);

// Forbidden import targets
const FORBIDDEN_IMPORTS = ["runtime-memory-storage"];

// Forbidden browser APIs
const FORBIDDEN_APIS = ["localStorage", "sessionStorage"];

// Patterns that indicate writes to the forbidden data/ directory
const FORBIDDEN_DATA_PATTERNS = [
	// Direct writes to data/settings.json or data/* owner files
	/data\/settings\.json/,
	/data\/[a-z-]+-store\.json/,
	/data\/[a-z-]+-records\.json/,
];

const SKIP_DIRS = new Set(["node_modules", ".git", "docs", "archive"]);

/**
 * Strip comments from content to avoid false positives in documentation.
 */
function stripComments(content) {
	// Remove single-line comments
	let stripped = content.replace(/\/\/[^\n]*/g, "");
	// Remove multi-line comments
	stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, "");
	return stripped;
}

/**
 * Join multi-line import statements into a single line for regex matching.
 * Detects when a line ends with a continuation character or is inside brackets.
 */
function normalizeForImportSearch(content) {
	// Join lines that appear to continue import statements
	const lines = content.split("\n");
	const joined = [];
	let buffer = "";

	for (const line of lines) {
		buffer += line;
		// Continue if line ends with , { ( or is clearly a continuation
		if (/[,{([]\s*$/.test(line) || /import\s+.*[^)]$/.test(buffer)) {
			buffer += " ";
		} else {
			joined.push(buffer);
			buffer = "";
		}
	}
	if (buffer.trim()) joined.push(buffer);

	return joined.join("\n");
}

/**
 * Detect forbidden imports or API usage in a file's text content.
 */
function scanFile(filePath, content) {
	const violations = [];

	// Check for forbidden imports — normalize multi-line imports first
	const normalized = normalizeForImportSearch(stripComments(content));
	for (const imp of FORBIDDEN_IMPORTS) {
		// Match: import ... from "...runtime-memory-storage" or require("...")
		const importPattern = new RegExp(
			`(?:import\\s[^;]*from\\s+["'][^"']*${imp}["']|require\\(["'][^"']*${imp}["']\\))`,
		);
		const match = importPattern.exec(normalized);
		if (match !== null) {
			// Find which original line this corresponds to (approximate)
			const lineNum = normalized.substring(0, match.index).split("\n").length;
			violations.push({
				line: lineNum,
				col: 1,
				type: "import",
				target: imp,
				snippet: match[0].slice(0, 120),
			});
		}
	}

	// Check for forbidden API usage — scan line by line
	const lines = content.split("\n");
	for (let li = 0; li < lines.length; li++) {
		const line = lines[li];
		const trimmed = line.trim();

		// Skip comment lines
		if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
			continue;
		}

		for (const api of FORBIDDEN_APIS) {
			// Match: localStorage[ or localStorage. or localStorage( but NOT in comments
			const apiPattern = new RegExp(`(?<![\\w"'])(${api})\\s*[\\[\\.(]`);
			const match = apiPattern.exec(trimmed);
			if (match !== null) {
				violations.push({
					line: li + 1,
					col: match.index,
					type: "api",
					target: api,
					snippet: line.trim().slice(0, 120),
				});
			}
		}

		// Check for forbidden data/ writes (settings.json, *-store.json, *-records.json)
		// Only allowed in explicitly named legacy store files
		for (const pattern of FORBIDDEN_DATA_PATTERNS) {
			const match = pattern.exec(trimmed);
			if (match !== null) {
				const fileName = filePath.split(/[/\\]/).pop() ?? "";
				const isAllowedLegacyStore = ALLOWED_LEGACY_STORE_FILES.has(fileName);
				if (!isAllowedLegacyStore) {
					violations.push({
						line: li + 1,
						col: match.index,
						type: "data-write",
						target: match[0],
						snippet: `write to forbidden path: ${match[0]}. Use the proper owner store instead.`,
					});
				}
			}
		}
	}

	return violations;
}

function isExempt(filePath) {
	for (const prefix of EXEMPT_PREFIXES) {
		if (filePath.startsWith(prefix)) {
			return true;
		}
	}
	return false;
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
	const files = PROTECTED_DOMAINS.flatMap((d) => walkFiles(d));

	const allViolations = [];

	for (const file of files) {
		if (isExempt(file)) continue;
		const content = await Bun.file(file).text();
		const violations = scanFile(file, content);
		if (violations.length > 0) {
			allViolations.push({ file, violations });
		}
	}

	if (allViolations.length === 0) {
		console.log(
			"check-storage-forbidden: PASS — no forbidden storage usage in protected domains.",
		);
		process.exit(0);
	}

	console.error(
		"check-storage-forbidden: FAIL — forbidden storage usage detected:",
	);
	console.error("");
	for (const { file, violations } of allViolations) {
		const cwd = resolve();
		const rel = file.replace(`${cwd}\\`, "").replace(`${cwd}/`, "");
		for (const v of violations) {
			let label: string;
			let hint = "";
			switch (v.type) {
				case "import":
					label = `import "${v.target}"`;
					hint = ". Use workspace store or proper owner store instead.";
					break;
				case "api":
					label = `use of ${v.target}`;
					hint =
						". Use file-based storage (workspace-store, settings-store) instead.";
					break;
				case "data-write":
					label = `write to forbidden path "${v.target}"`;
					hint = ". Use the proper owner store for this data domain.";
					break;
				default:
					label = `${v.type}: ${v.target}`;
			}
			console.error(`  ${rel}:${v.line}:${v.col} — ${label}${hint}`);
			console.error(`    ${v.snippet}`);
		}
	}
	console.error("");
	console.error("Storage policy:");
	console.error(
		"  - Protected domains must not use runtime-memory-storage, localStorage, or sessionStorage",
	);
	console.error(
		"  - Protected domains must not write to <supportRoot>/ty-plus/data/settings.json or data/* owner files",
	);
	console.error(
		"  - Allowed transient exceptions: src/shared/debug, src/shared/interceptor, src/shared/ipc",
	);
	console.error(
		"  - Legacy data/ reads allowed only in: workspace-layout-store.ts, catalog-files-store.ts,",
	);
	console.error(
		"    settings-files-store.ts, widget-state-store.ts, snapshot-store.ts, cache-store.ts, storage-migration.ts",
	);

	process.exit(1);
}

main();
