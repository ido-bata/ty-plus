#!/usr/bin/env bun
/**
 * check-static-guardrail.ts
 *
 * Consolidated static guardrail that checks:
 * 1. Forbidden storage imports/usages (localStorage, sessionStorage, runtime-memory-storage)
 * 2. Writes to <supportRoot>/ty-plus/data/ in protected domains
 * 3. Workspace-specific CSS class hooks in active workspace code
 * 4. Preview mocks in production paths
 * 5. Dialog roots returning null
 *
 * Exit codes:
 *   0 - All checks pass
 *   1 - One or more violations detected
 */

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set(["node_modules", ".git", "docs", "archive", "dist"]);
const SKIP_WORKSPACE_HOOKS_FILES = new Set(["PlacementItemContainer.tsx"]);

function stripComments(content: string): string {
	let stripped = content.replace(/\/\/[^\n]*/g, "");
	stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, "");
	return stripped;
}

function normalizeForImportSearch(content: string): string {
	const lines = content.split("\n");
	const joined = [];
	let buffer = "";

	for (const line of lines) {
		buffer += line;
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

function walkFiles(dir: string): string[] {
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

// ---------------------------------------------------------------------------
// Check 1: Forbidden storage imports/usages
// ---------------------------------------------------------------------------

const PROTECTED_DOMAINS = [
	resolve("src", "management", "workspace"),
	resolve("src", "management", "panel", "control"),
	resolve("src", "management", "setting"),
	resolve("src", "management", "i18n"),
	resolve("src", "shared", "i18n"),
	resolve("src", "management", "online", "notification"),
];

const EXEMPT_PREFIXES = [
	resolve("src", "shared", "debug"),
	resolve("src", "shared", "interceptor"),
	resolve("src", "shared", "ipc"),
];

const FORBIDDEN_IMPORTS = ["runtime-memory-storage"];
const FORBIDDEN_APIS = ["localStorage", "sessionStorage"];

// Legacy store files allowed to read from data/settings.json or data/* owner files
const ALLOWED_LEGACY_STORE_FILES = new Set([
	"workspace-layout-store.ts",
	"catalog-files-store.ts",
	"settings-files-store.ts",
	"widget-state-store.ts",
	"snapshot-store.ts",
	"cache-store.ts",
	"storage-migration.ts",
]);

// Patterns for writes to the forbidden data/ directory
const FORBIDDEN_DATA_PATTERNS = [
	/data\/settings\.json/,
	/data\/[a-z-]+-store\.json/,
	/data\/[a-z-]+-records\.json/,
];

function scanForbiddenStorage(filePath: string, content: string) {
	const violations = [];
	const normalized = normalizeForImportSearch(stripComments(content));

	for (const imp of FORBIDDEN_IMPORTS) {
		const importPattern = new RegExp(
			`(?:import\\s[^;]*from\\s+["'][^"']*${imp}["']|require\\(["'][^"']*${imp}["']\\))`,
		);
		const match = importPattern.exec(normalized);
		if (match !== null) {
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

	const lines = content.split("\n");
	for (let li = 0; li < lines.length; li++) {
		const line = lines[li];
		const trimmed = line.trim();

		if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
			continue;
		}

		for (const api of FORBIDDEN_APIS) {
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

// ---------------------------------------------------------------------------
// Check 2: Workspace CSS class hooks
// ---------------------------------------------------------------------------

const WORKSPACE_SRC = resolve("src", "management", "workspace");
const FUNCTION_WIDGET = resolve("src", "function", "widget", "workspace");

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

const CLASS_ATTR_PATTERN = /(?:className|class)=["']([^"']+)["']/g;
const LITERAL_CLASS_EXTRACT =
	/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;

function scanWorkspaceHooks(filePath: string, content: string) {
	const violations = [];
	const lines = content.split("\n");

	for (let li = 0; li < lines.length; li++) {
		const line = lines[li];
		const trimmed = line.trim();

		if (
			trimmed.startsWith("//") ||
			trimmed.startsWith("*") ||
			trimmed.startsWith("/*")
		) {
			continue;
		}

		const SELECTOR_PATTERNS = [
			/\bquerySelector[A-Za-z]*\s*\(/,
			/\bmatches\s*\(/,
			/\.closest\s*\(/,
		];
		if (SELECTOR_PATTERNS.some((p) => p.test(trimmed))) continue;

		if (/^\s*["'][.[]/.test(trimmed)) continue;

		let m: RegExpExecArray | null = null;
		CLASS_ATTR_PATTERN.lastIndex = 0;
		m = CLASS_ATTR_PATTERN.exec(line);
		while (m !== null) {
			const attrValue = m[1];
			for (const hook of PROTECTED_HOOKS) {
				const tokenPattern = new RegExp(
					`(?<![A-Za-z0-9_-])${hook}(?![A-Za-z0-9_-])`,
				);
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

		let m2: RegExpExecArray | null = null;
		LITERAL_CLASS_EXTRACT.lastIndex = 0;
		m2 = LITERAL_CLASS_EXTRACT.exec(line);
		while (m2 !== null) {
			const str = m2[1] ?? m2[2];
			if (str) {
				for (const hook of PROTECTED_HOOKS) {
					const tokenPattern = new RegExp(
					`(?<![A-Za-z0-9_-])${hook}(?![A-Za-z0-9_-])`,
				);
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

// ---------------------------------------------------------------------------
// Check 3: Preview mocks in production paths
// ---------------------------------------------------------------------------

// Patterns that indicate preview/mock utilities that should not be in production
const PREVIEW_MOCK_PATTERNS = [
	/\bpreviewPreview\b/,
	/\b__preview\b/,
	/\bcreatePreviewMock\b/,
	/\bMockPreview\b/,
	/\bmockFactory\b/i,
	/\b__mock__\b/,
];

// Production paths that should not contain preview mock utilities
const PRODUCTION_PATH_PREFIXES = [
	resolve("src", "management"),
	resolve("src", "function", "widget"),
];

function scanPreviewMocks(filePath: string, content: string) {
	const violations = [];

	// Only scan production paths
	const isProduction = PRODUCTION_PATH_PREFIXES.some((prefix) =>
		filePath.startsWith(prefix),
	);
	if (!isProduction) return violations;

	const lines = content.split("\n");
	for (let li = 0; li < lines.length; li++) {
		const line = lines[li];
		const trimmed = line.trim();

		// Skip test files and comment-only lines
		if (
			trimmed.startsWith("//") ||
			trimmed.startsWith("*") ||
			trimmed.startsWith("/*")
		) {
			continue;
		}

		for (const pattern of PREVIEW_MOCK_PATTERNS) {
			const match = pattern.exec(trimmed);
			if (match !== null) {
				violations.push({
					line: li + 1,
					col: match.index,
					pattern: pattern.source,
					snippet: line.trim().slice(0, 120),
				});
			}
		}
	}

	return violations;
}

// ---------------------------------------------------------------------------
// Check 4: Dialog roots returning null unconditionally
// ---------------------------------------------------------------------------

// DialogRoot components that should not unconditionally return null in production
const DIALOG_ROOT_GLOB = [
	resolve("src", "management", "dialog"),
	resolve("src", "management", "ae", "cep", "entry"),
];

// Pattern to detect: export const DialogRoot = (...) => { ... return null; }
// where null is the only return (unconditional stub)
const DIALOG_NULL_PATTERN = /return\s+null\s*;?\s*\}\s*$/;

function scanDialogRoots(filePath: string, content: string) {
	const violations = [];

	// Only scan dialog root files
	const isDialogRoot = DIALOG_ROOT_GLOB.some((prefix) =>
		filePath.startsWith(prefix),
	);
	if (!isDialogRoot) return violations;

	// Check if file is a DialogRoot component that returns null
	if (
		!filePath.endsWith("DialogRoot.tsx") &&
		!filePath.endsWith("DialogRoot.ts")
	) {
		return violations;
	}

	const lines = content.split("\n");
	let inDialogRoot = false;
	let dialogStartLine = 0;

	for (let li = 0; li < lines.length; li++) {
		const line = lines[li];

		// Detect DialogRoot function/component declaration
		if (/export\s+(?:const|function)\s+DialogRoot\b/.test(line)) {
			inDialogRoot = true;
			dialogStartLine = li + 1;
		}

		// If we found a DialogRoot and it returns null as the final statement
		if (inDialogRoot) {
			const trimmed = line.trim();

			// Skip comments and empty lines
			if (
				trimmed.startsWith("//") ||
				trimmed.startsWith("*") ||
				trimmed === ""
			) {
				continue;
			}

			// Check for unconditional null return at the end of the component
			if (trimmed === "return null;" || trimmed === "return null") {
				// Look ahead to see if there's more after this (if so, it's conditional)
				const remainingLines = lines
					.slice(li + 1)
					.join("")
					.trim();
				if (!remainingLines || remainingLines === "}") {
					violations.push({
						line: li + 1,
						col: 1,
						type: "stub",
						snippet: line.trim(),
						context: `DialogRoot declared at line ${dialogStartLine}`,
					});
				}
			}

			// Reset if we hit the end of the function
			if (trimmed === "}" && li > dialogStartLine) {
				break;
			}
		}
	}

	return violations;
}

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------

interface Violation {
	file: string;
	violations: Array<Record<string, unknown>>;
	checkName: string;
}

async function main() {
	const allViolations: Violation[] = [];
	const cwd = resolve();

	// Check 1: Forbidden storage
	const storageFiles = PROTECTED_DOMAINS.flatMap((d) => walkFiles(d));
	for (const file of storageFiles) {
		const isExempt = EXEMPT_PREFIXES.some((prefix) => file.startsWith(prefix));
		if (isExempt) continue;

		const content = await Bun.file(file).text();
		const violations = scanForbiddenStorage(file, content);
		if (violations.length > 0) {
			allViolations.push({
				file,
				violations,
				checkName: "forbidden-storage",
			});
		}
	}

	// Check 2: Workspace CSS class hooks
	const workspaceFiles = [
		...walkFiles(WORKSPACE_SRC),
		...walkFiles(FUNCTION_WIDGET),
	];
	for (const file of workspaceFiles) {
		const fileName = file.split(/[/\\]/).pop() ?? "";
		if (SKIP_WORKSPACE_HOOKS_FILES.has(fileName)) continue;
		const content = await Bun.file(file).text();
		const violations = scanWorkspaceHooks(file, content);
		if (violations.length > 0) {
			allViolations.push({
				file,
				violations,
				checkName: "workspace-hooks",
			});
		}
	}

	// Check 3: Preview mocks in production paths
	const productionFiles = PRODUCTION_PATH_PREFIXES.flatMap((d) => walkFiles(d));
	for (const file of productionFiles) {
		const content = await Bun.file(file).text();
		const violations = scanPreviewMocks(file, content);
		if (violations.length > 0) {
			allViolations.push({
				file,
				violations,
				checkName: "preview-mocks",
			});
		}
	}

	// Check 4: Dialog roots returning null
	const dialogFiles = DIALOG_ROOT_GLOB.flatMap((d) => walkFiles(d));
	for (const file of dialogFiles) {
		const content = await Bun.file(file).text();
		const violations = scanDialogRoots(file, content);
		if (violations.length > 0) {
			allViolations.push({
				file,
				violations,
				checkName: "dialog-null-return",
			});
		}
	}

	// Report results
	if (allViolations.length === 0) {
		console.log(
			"check-static-guardrail: PASS — no static guardrail violations found.",
		);
		console.log("  - Forbidden storage usage: none");
		console.log("  - Forbidden data/ writes: none");
		console.log("  - Workspace CSS class hooks: none");
		console.log("  - Preview mocks in production: none");
		console.log("  - DialogRoot null stubs: none");
		process.exit(0);
	}

	console.error("check-static-guardrail: FAIL — violations detected:");
	console.error("");

	for (const { file, violations, checkName } of allViolations) {
		const rel = file.replace(`${cwd}\\`, "").replace(`${cwd}/`, "");

		for (const v of violations) {
			switch (checkName) {
				case "forbidden-storage":
					if (v.type === "import") {
						console.error(
							`  ${rel}:${v.line}:${v.col} [forbidden-storage] — import "${v.target}"`,
						);
					} else if (v.type === "data-write") {
						console.error(
							`  ${rel}:${v.line}:${v.col} [forbidden-storage] — write to forbidden path "${v.target}"`,
						);
					} else {
						console.error(
							`  ${rel}:${v.line}:${v.col} [forbidden-storage] — use of ${v.target}`,
						);
					}
					break;
				case "workspace-hooks":
					console.error(
						`  ${rel}:${v.line}:${v.col} [workspace-hooks] — protected hook "${v.hook}"`,
					);
					break;
				case "preview-mocks":
					console.error(
						`  ${rel}:${v.line}:${v.col} [preview-mocks] — pattern "${v.pattern}"`,
					);
					break;
				case "dialog-null-return":
					console.error(
						`  ${rel}:${v.line}:${v.col} [dialog-null-return] — ${v.type}: ${v.context}`,
					);
					break;
			}
			console.error(`    ${v.snippet}`);
		}
	}

	console.error("");
	console.error("Static guardrail summary:");
	console.error(
		"  - Protected domains must not use runtime-memory-storage, localStorage, or sessionStorage",
	);
	console.error(
		"  - Protected domains must not write to <supportRoot>/ty-plus/data/settings.json or data/* owner files",
	);
	console.error(
		"  - Workspace class hooks (ws-item, ws-tile, etc.) are reserved for host-page CSS injection",
	);
	console.error(
		"  - Preview mock utilities must not appear in production source paths",
	);
	console.error(
		"  - DialogRoot components must not unconditionally return null in production",
	);

	process.exit(1);
}

main();
