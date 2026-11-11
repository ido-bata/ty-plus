#!/usr/bin/env bun
/**
 * Guard the TypeScript / ExtendScript side of the Rust runtime boundary.
 *
 * Existing migration debt is recorded as an exact file + rule + match-count
 * tuple. Every tuple names the task that removes it. Directory globs and
 * unbounded path exemptions are intentionally unsupported.
 *
 * Usage:
 *   bun scripts/check/check-rust-runtime-boundaries.ts
 *   bun scripts/check/check-rust-runtime-boundaries.ts --self-test
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type RuleId =
	| "node-fs"
	| "child-process"
	| "cep-fs"
	| "product-network"
	| "extendscript-file-folder"
	| "shell-command"
	| "app-root-discovery"
	| "legacy-fallback";

type Violation = {
	file: string;
	rule: RuleId;
	line: number;
	column: number;
	snippet: string;
};

type ExactBoundaryEntry = {
	file: string;
	rule: RuleId;
	expectedMatches: number;
};

type AllowlistEntry = ExactBoundaryEntry & {
	removalTask: MigrationTaskId;
};

type PermanentBoundaryOwner =
	| "cep-binary-resolution"
	| "cep-operation-worker-runner"
	| "static-feed-client";

type PermanentBoundaryEntry = ExactBoundaryEntry & {
	owner: PermanentBoundaryOwner;
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = resolve(repoRoot, "src");

// Only task IDs present in docs/plans/rust-runtime-redesign/migration-map.md
// may own temporary exceptions. Additions must update that map first.
const MIGRATION_TASK_IDS = [
	"FND-002",
	"FND-003",
	"FND-004",
	"FND-005",
	"HFS-002",
	"HFS-003",
	"HFS-006",
	"HFS-012",
	"HFS-013",
	"STO-002",
	"STO-006",
	"STO-007",
	"STO-008",
	"STO-009",
	"STO-010",
	"STO-011",
	"STO-012",
	"STO-013",
	"STO-014",
	"STO-015",
	"STO-016",
	"STO-017",
	"STO-018",
	"STO-019",
	"STO-020",
	"NET-002",
	"NET-003",
	"NET-004",
	"NET-005",
	"NET-006",
	"NET-007",
	"NET-010",
	"LIC-003",
	"LIC-005",
	"LIC-007",
	"LIC-008",
	"LIC-010",
	"ELV-001",
	"ELV-011",
	"PKG-002",
	"PKG-003",
	"PKG-004",
	"PKG-005",
	"DEL-012",
	"VER-001",
] as const;

type MigrationTaskId = (typeof MIGRATION_TASK_IDS)[number];
const knownMigrationTasks = new Set<string>(MIGRATION_TASK_IDS);

const TEMPORARY_ALLOWLIST: readonly AllowlistEntry[] = [
	{
		file: "src/management/ae/jsx/host-bundle.ext.ts",
		rule: "extendscript-file-folder",
		removalTask: "HFS-013",
		expectedMatches: 15,
	},
	{
		file: "src/management/debug/runtime/write-mode.ts",
		rule: "child-process",
		removalTask: "FND-004",
		expectedMatches: 1,
	},
	{
		file: "src/management/dialog/routes.tsx",
		rule: "node-fs",
		removalTask: "STO-019",
		expectedMatches: 1,
	},
	{
		file: "src/management/i18n/preference/storage.ts",
		rule: "node-fs",
		removalTask: "STO-016",
		expectedMatches: 2,
	},
	{
		file: "src/management/preset/tool-handoff-file.ts",
		rule: "node-fs",
		removalTask: "STO-019",
		expectedMatches: 6,
	},
	{
		file: "src/management/setting/onboarding/initialization.ts",
		rule: "node-fs",
		removalTask: "HFS-013",
		expectedMatches: 2,
	},
	{
		file: "src/management/setting/persistence/copy-directory-recursive.ts",
		rule: "node-fs",
		removalTask: "STO-020",
		expectedMatches: 4,
	},
	{
		file: "src/management/setting/persistence/node-fs.ts",
		rule: "node-fs",
		removalTask: "STO-020",
		expectedMatches: 2,
	},
	{
		file: "src/management/setting/persistence/ty-plus-managed-root.ts",
		rule: "node-fs",
		removalTask: "STO-020",
		expectedMatches: 1,
	},
	{
		file: "src/management/storage/clipboard-store.ts",
		rule: "node-fs",
		removalTask: "STO-017",
		expectedMatches: 2,
	},
	{
		file: "src/management/storage/extendscript/file-operations.ext.ts",
		rule: "extendscript-file-folder",
		removalTask: "STO-008",
		expectedMatches: 4,
	},
	{
		file: "src/management/storage/file-browser-service.ts",
		rule: "node-fs",
		removalTask: "HFS-013",
		expectedMatches: 1,
	},
	{
		file: "src/management/storage/read/json-file.ts",
		rule: "node-fs",
		removalTask: "STO-006",
		expectedMatches: 2,
	},
	{
		file: "src/management/storage/write/elevation-service.ts",
		rule: "child-process",
		removalTask: "ELV-011",
		expectedMatches: 3,
	},
	{
		file: "src/management/storage/write/elevation-service.ts",
		rule: "node-fs",
		removalTask: "ELV-011",
		expectedMatches: 6,
	},
	{
		file: "src/management/storage/write/elevation-service.ts",
		rule: "shell-command",
		removalTask: "ELV-011",
		expectedMatches: 12,
	},
	{
		// Issue #160's authoring writer resolves `fs` through the CEP-provided
		// `require`, exactly like the elevation service above it. The permission
		// probe and the elevated retry are two halves of one boundary, so they
		// retire together under ELV-011.
		file: "src/management/storage/write/authoring-write.ts",
		rule: "node-fs",
		removalTask: "ELV-011",
		expectedMatches: 1,
	},
	{
		// The Gherkin procedure loader is a repository verification harness that
		// reads `.feature` / `.json` fixtures off disk on purpose. It is not
		// shipped product code — nothing outside `src/shared/scenario/` imports
		// it — but it lives under `src/` today. VER-001 moves the harness out
		// of the production tree instead of granting it a permanent exception.
		file: "src/shared/scenario/loader.ts",
		rule: "node-fs",
		removalTask: "VER-001",
		expectedMatches: 1,
	},
	{
		file: "src/management/setting/onboarding/trusted-root-policy.ts",
		rule: "child-process",
		removalTask: "ELV-011",
		expectedMatches: 1,
	},
	{
		file: "src/management/storage/write/json-file.ts",
		rule: "node-fs",
		removalTask: "STO-007",
		expectedMatches: 2,
	},
	{
		file: "src/management/workspace/background/dialog-root-handoff.ts",
		rule: "node-fs",
		removalTask: "STO-019",
		expectedMatches: 2,
	},
	{
		file: "src/management/workspace/layout/persistence-root.ts",
		rule: "node-fs",
		removalTask: "STO-014",
		expectedMatches: 2,
	},
	{
		file: "src/management/workspace/layout/sync-watch.ts",
		rule: "node-fs",
		removalTask: "STO-014",
		expectedMatches: 1,
	},
];

const PERMANENT_BOUNDARIES: readonly PermanentBoundaryEntry[] = [
	{
		file: "src/management/ipc/operation-worker-node-runtime.ts",
		rule: "node-fs",
		expectedMatches: 1,
		owner: "cep-binary-resolution",
	},
	{
		file: "src/management/ipc/operation-worker-node-runtime.ts",
		rule: "child-process",
		expectedMatches: 1,
		owner: "cep-operation-worker-runner",
	},
	{
		file: "src/management/ipc/transport.ts",
		rule: "child-process",
		expectedMatches: 1,
		owner: "cep-operation-worker-runner",
	},
	// The static feed clients (docs/architecture/feeds.md) fetch public JSON
	// feeds from the panel on purpose: an install whose operation-worker is
	// broken is exactly the one that must still learn about updates and
	// official notices. Requiring the worker transport for the feed would be
	// circular. Feed hosts must send CORS headers; the contract documents it.
	{
		file: "src/management/online/update/feed.ts",
		rule: "product-network",
		expectedMatches: 1,
		owner: "static-feed-client",
	},
	{
		file: "src/management/online/notification/feed.ts",
		rule: "product-network",
		expectedMatches: 1,
		owner: "static-feed-client",
	},
];

const RULE_LABELS: Record<RuleId, string> = {
	"node-fs": "direct Node fs access",
	"child-process": "direct child_process access",
	"cep-fs": "window.cep.fs access",
	"product-network": "direct product network access",
	"extendscript-file-folder": "generic ExtendScript File/Folder access",
	"shell-command": "PowerShell/AppleScript command construction",
	"app-root-discovery": "appRoot registry/environment discovery",
	"legacy-fallback": "fallback to a legacy implementation",
};

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const EXCLUDED_DIRECTORY_NAMES = new Set([
	"__fixtures__",
	"__tests__",
	"generated",
]);

const isProductionSource = (file: string): boolean => {
	const normalized = file.replaceAll("\\", "/");
	const name = normalized.slice(normalized.lastIndexOf("/") + 1);
	if (!SOURCE_EXTENSIONS.has(extname(name))) return false;
	if (/\.(?:test|spec|stories)\.(?:ts|tsx)$/.test(name)) return false;
	if (/\.d\.ts$/.test(name)) return false;
	return !normalized
		.split("/")
		.some((segment) => EXCLUDED_DIRECTORY_NAMES.has(segment));
};

const isExtendScriptSource = (file: string): boolean =>
	file.endsWith(".ext.ts") || file.includes("/extendscript/");

const walkProductionSources = (directory: string): string[] => {
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const absolute = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			if (!EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
				files.push(...walkProductionSources(absolute));
			}
		} else if (entry.isFile() && isProductionSource(absolute)) {
			files.push(absolute);
		}
	}
	return files.sort();
};

/** Remove comments without changing offsets or line numbers. */
const stripComments = (source: string): string => {
	let result = "";
	let state: "code" | "line" | "block" | "single" | "double" | "template" =
		"code";
	let escaped = false;

	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		const next = source[index + 1] ?? "";

		if (state === "line") {
			if (char === "\n") {
				state = "code";
				result += char;
			} else {
				result += " ";
			}
			continue;
		}
		if (state === "block") {
			if (char === "*" && next === "/") {
				result += "  ";
				index += 1;
				state = "code";
			} else {
				result += char === "\n" ? "\n" : " ";
			}
			continue;
		}

		if (state === "code") {
			if (char === "/" && next === "/") {
				result += "  ";
				index += 1;
				state = "line";
				continue;
			}
			if (char === "/" && next === "*") {
				result += "  ";
				index += 1;
				state = "block";
				continue;
			}
			if (char === "'") state = "single";
			if (char === '"') state = "double";
			if (char === "`") state = "template";
			result += char;
			continue;
		}

		result += char;
		if (escaped) {
			escaped = false;
		} else if (char === "\\") {
			escaped = true;
		} else if (
			(state === "single" && char === "'") ||
			(state === "double" && char === '"') ||
			(state === "template" && char === "`")
		) {
			state = "code";
		}
	}
	return result;
};

type ScanRule = {
	id: RuleId;
	patterns: readonly RegExp[];
	applies?: (file: string) => boolean;
};

const SCAN_RULES: readonly ScanRule[] = [
	{
		id: "node-fs",
		patterns: [
			/\b(?:import|export)\s+[\s\S]{0,240}?\bfrom\s*["'](?:node:)?fs(?:\/promises)?["']/g,
			/\bimport\s*\(\s*["'](?:node:)?fs(?:\/promises)?["']\s*\)/g,
			/(?:\b|\.)require(?:Fn)?\??\.?(?:call)?\s*\(\s*["'](?:node:)?fs(?:\/promises)?["']/g,
			/\breq\s*\(\s*["'](?:node:)?fs(?:\/promises)?["']/g,
		],
	},
	{
		id: "child-process",
		patterns: [
			/\b(?:import|export)\s+[\s\S]{0,240}?\bfrom\s*["'](?:node:)?child_process["']/g,
			/\bimport\s*\(\s*["'](?:node:)?child_process["']\s*\)/g,
			/(?:\b|\.)require(?:Fn)?\??\.?(?:call)?\s*\(\s*["'](?:node:)?child_process["']/g,
			/\breq\s*\(\s*["'](?:node:)?child_process["']/g,
		],
	},
	{
		id: "cep-fs",
		patterns: [/(?:\bwindow|\bglobalThis)\s*\.\s*cep\s*\.\s*fs\b/g],
	},
	{
		id: "product-network",
		patterns: [
			/\b(?:globalThis\s*\.\s*|window\s*\.\s*)?fetch\s*\(/g,
			/\bnew\s+XMLHttpRequest\s*\(/g,
			/\bnew\s+WebSocket\s*\(/g,
		],
	},
	{
		id: "extendscript-file-folder",
		applies: isExtendScriptSource,
		patterns: [
			/\bnew\s+(?:File|Folder)\s*\(/g,
			/\b(?:File|Folder)\s*\.\s*(?:openDialog|openDlg|saveDialog|saveDlg|selectDialog)\s*\(/g,
		],
	},
	{
		id: "shell-command",
		patterns: [
			/\b(?:powershell(?:\.exe)?|Start-Process|EncodedCommand)\b/gi,
			/\b(?:osascript|do\s+shell\s+script|with\s+administrator\s+privileges)\b/gi,
		],
	},
	{
		id: "app-root-discovery",
		patterns: [
			/\b(?:AE_INSTALL_PATH|CEP_EXTENSION_ROOT|AFTER_EFFECTS_APP_ROOT)\b/g,
			/\b(?:reg(?:\.exe)?\s+query|HKEY_(?:CURRENT_USER|LOCAL_MACHINE))[\s\S]{0,160}?(?:After\s+Effects|AfterEffects)/gi,
			/\/Applications\/(?:Adobe\s+)?After\s+Effects/gi,
			/["']app-root["']/g,
		],
	},
	{
		id: "legacy-fallback",
		patterns: [
			/\b(?:fallback|fall\s+back)\s+(?:to\s+)?(?:the\s+)?legacy\b/gi,
			/\blegacy\s+(?:runtime\s+)?fallback\b/gi,
			/\b(?:runtime|native\s+binary|rust\s+binary|binary)[\s\S]{0,120}?\b(?:missing|not\s+found|unavailable)[\s\S]{0,120}?\b(?:fallback|fall\s+back|legacy)\b/gi,
			/\b(?:fallback|fall\s+back|legacy)[\s\S]{0,120}?\b(?:runtime|native\s+binary|rust\s+binary|binary)[\s\S]{0,120}?\b(?:missing|not\s+found|unavailable)\b/gi,
			/\b(?:fallbackToLegacy|useLegacyImplementation|runLegacyImplementation)\b/g,
		],
	},
];

const positionAt = (
	source: string,
	index: number,
): { line: number; column: number } => {
	const before = source.slice(0, index);
	const lastNewline = before.lastIndexOf("\n");
	return {
		line: before.split("\n").length,
		column: index - lastNewline,
	};
};

const lineSnippet = (source: string, index: number): string => {
	const start = source.lastIndexOf("\n", index - 1) + 1;
	const endIndex = source.indexOf("\n", index);
	const end = endIndex === -1 ? source.length : endIndex;
	return source.slice(start, end).trim().replaceAll(/\s+/g, " ").slice(0, 160);
};

const scanSource = (file: string, source: string): Violation[] => {
	const normalizedFile = file.replaceAll("\\", "/");
	const uncommented = stripComments(source);
	const violations: Violation[] = [];

	for (const rule of SCAN_RULES) {
		if (rule.applies && !rule.applies(normalizedFile)) continue;
		const seenOffsets = new Set<number>();
		for (const pattern of rule.patterns) {
			pattern.lastIndex = 0;
			for (const match of uncommented.matchAll(pattern)) {
				const index = match.index;
				if (seenOffsets.has(index)) continue;
				seenOffsets.add(index);
				const position = positionAt(uncommented, index);
				violations.push({
					file: normalizedFile,
					rule: rule.id,
					line: position.line,
					column: position.column,
					snippet: lineSnippet(source, index),
				});
			}
		}
	}
	return violations.sort(
		(left, right) => left.line - right.line || left.column - right.column,
	);
};

const validateExactBoundaries = (
	entries: readonly ExactBoundaryEntry[],
): string[] => {
	const errors: string[] = [];
	const keys = new Set<string>();
	for (const entry of entries) {
		const normalized = entry.file.replaceAll("\\", "/");
		const key = `${normalized}\0${entry.rule}`;
		if (entry.file !== normalized) {
			errors.push(`${entry.file}: allowlist paths must use forward slashes`);
		}
		if (/[*?[\]{}]/.test(normalized) || normalized.endsWith("/")) {
			errors.push(
				`${entry.file}: wildcard or directory allowlists are forbidden`,
			);
		}
		if (!normalized.startsWith("src/") || !isProductionSource(normalized)) {
			errors.push(
				`${entry.file}: allowlist entry must name one production source file`,
			);
		}
		if (!Number.isInteger(entry.expectedMatches) || entry.expectedMatches < 1) {
			errors.push(`${entry.file}: expectedMatches must be a positive integer`);
		}
		if (keys.has(key)) {
			errors.push(`${entry.file}: duplicate allowlist entry for ${entry.rule}`);
		}
		keys.add(key);
	}
	return errors;
};

const validateAllowlist = (entries: readonly AllowlistEntry[]): string[] => {
	const errors: string[] = [];
	for (const entry of entries) {
		if (!knownMigrationTasks.has(entry.removalTask)) {
			errors.push(
				`${entry.file}: unknown migration-map task ${entry.removalTask}`,
			);
		}
	}
	return errors;
};

const runSelfTest = (): void => {
	const cases: Array<{
		name: string;
		file: string;
		source: string;
		expected: RuleId[];
	}> = [
		{
			name: "Node filesystem import and require",
			file: "src/management/example.ts",
			source:
				'import { readFile } from "node:fs/promises";\nconst fs = win.cep_node.require?.("fs");',
			expected: ["node-fs", "node-fs"],
		},
		{
			name: "child process",
			file: "src/management/example.ts",
			source: 'const cp = requireFn("child_process");',
			expected: ["child-process"],
		},
		{
			name: "CEP filesystem",
			file: "src/management/example.ts",
			source: "window.cep.fs.readFile(path);",
			expected: ["cep-fs"],
		},
		{
			name: "product network APIs",
			file: "src/management/example.ts",
			source: "fetch(url); new XMLHttpRequest(); new WebSocket(url);",
			expected: ["product-network", "product-network", "product-network"],
		},
		{
			name: "ExtendScript File and Folder",
			file: "src/management/ae/example.ext.ts",
			source: "const file = new File(path); Folder.selectDialog();",
			expected: ["extendscript-file-folder", "extendscript-file-folder"],
		},
		{
			name: "OS shell construction",
			file: "src/management/example.ts",
			source:
				'const command = `Start-Process powershell.exe`; child("osascript");',
			expected: ["shell-command", "shell-command", "shell-command"],
		},
		{
			name: "appRoot discovery",
			file: "src/management/example.ts",
			source:
				'const root = process.env.AE_INSTALL_PATH ?? "/Applications/Adobe After Effects";',
			expected: ["app-root-discovery", "app-root-discovery"],
		},
		{
			name: "legacy fallback",
			file: "src/management/example.ts",
			source: "if (runtimeBinaryUnavailable) fallbackToLegacy();",
			expected: ["legacy-fallback"],
		},
		{
			name: "comments and unrelated UI fallbacks are ignored",
			file: "src/function/example.tsx",
			source:
				'// fetch(url); require("fs");\nconst label = value || fallbackLabel;\nconst root = app.path;',
			expected: [],
		},
		{
			name: "File is only guarded in ExtendScript",
			file: "src/function/example.ts",
			source: "const browserFile = new File([], 'example.txt');",
			expected: [],
		},
	];

	const failures: string[] = [];
	for (const testCase of cases) {
		const actual = scanSource(testCase.file, testCase.source)
			.map((violation) => violation.rule)
			.sort();
		const expected = [...testCase.expected].sort();
		if (actual.join("|") !== expected.join("|")) {
			failures.push(
				`${testCase.name}: expected [${expected.join(", ")}], got [${actual.join(", ")}]`,
			);
		}
	}

	const invalidEntry = {
		file: "src/management/**",
		rule: "node-fs",
		removalTask: "STO-006",
		expectedMatches: 1,
	} as const;
	const invalidAllowlist = [
		...validateExactBoundaries([invalidEntry]),
		...validateAllowlist([invalidEntry]),
	];
	if (invalidAllowlist.length === 0) {
		failures.push("allowlist validation accepted a wildcard path");
	}

	if (failures.length > 0) {
		console.error("Rust runtime boundary guard self-test: FAIL");
		for (const failure of failures) console.error(`  - ${failure}`);
		process.exit(1);
	}

	console.log(
		`Rust runtime boundary guard self-test: PASS (${cases.length + 1} cases)`,
	);
};

const runRepositoryScan = (): void => {
	const exactBoundaries = [...TEMPORARY_ALLOWLIST, ...PERMANENT_BOUNDARIES];
	const allowlistErrors = [
		...validateExactBoundaries(exactBoundaries),
		...validateAllowlist(TEMPORARY_ALLOWLIST),
	];
	if (allowlistErrors.length > 0) {
		console.error("Rust runtime boundary guard: INVALID ALLOWLIST");
		for (const error of allowlistErrors) console.error(`  - ${error}`);
		process.exit(1);
	}

	const files = walkProductionSources(sourceRoot);
	const violations = files.flatMap((absolute) => {
		const repoRelative = relative(repoRoot, absolute).replaceAll("\\", "/");
		return scanSource(repoRelative, readFileSync(absolute, "utf8"));
	});
	const actualByKey = new Map<string, Violation[]>();
	for (const violation of violations) {
		const key = `${violation.file}\0${violation.rule}`;
		const existing = actualByKey.get(key) ?? [];
		existing.push(violation);
		actualByKey.set(key, existing);
	}

	const allowlistByKey = new Map(
		exactBoundaries.map((entry) => [`${entry.file}\0${entry.rule}`, entry]),
	);
	const unallowlisted = violations.filter(
		(violation) => !allowlistByKey.has(`${violation.file}\0${violation.rule}`),
	);
	const baselineDrift: string[] = [];
	let allowedMatches = 0;
	for (const entry of TEMPORARY_ALLOWLIST) {
		const actual = actualByKey.get(`${entry.file}\0${entry.rule}`)?.length ?? 0;
		allowedMatches += actual;
		if (actual !== entry.expectedMatches) {
			baselineDrift.push(
				`${entry.file} [${entry.rule}] expected ${entry.expectedMatches}, found ${actual}; remove or update the exception with ${entry.removalTask}`,
			);
		}
	}
	for (const entry of PERMANENT_BOUNDARIES) {
		const actual = actualByKey.get(`${entry.file}\0${entry.rule}`)?.length ?? 0;
		allowedMatches += actual;
		if (actual !== entry.expectedMatches) {
			baselineDrift.push(
				`${entry.file} [${entry.rule}] expected ${entry.expectedMatches}, found ${actual}; repair the permanent ${entry.owner} boundary`,
			);
		}
	}

	if (unallowlisted.length > 0 || baselineDrift.length > 0) {
		console.error("Rust runtime boundary guard: FAIL");
		for (const violation of unallowlisted) {
			console.error(
				`  ${violation.file}:${violation.line}:${violation.column} [${violation.rule}] ${RULE_LABELS[violation.rule]}`,
			);
			console.error(`    ${violation.snippet}`);
		}
		for (const drift of baselineDrift)
			console.error(`  allowlist drift: ${drift}`);
		console.error(
			`Scanned ${files.length} production files; ${unallowlisted.length} unallowlisted match(es), ${baselineDrift.length} allowlist drift(s).`,
		);
		process.exit(1);
	}

	const debtByTask = new Map<string, number>();
	for (const entry of TEMPORARY_ALLOWLIST) {
		debtByTask.set(
			entry.removalTask,
			(debtByTask.get(entry.removalTask) ?? 0) + entry.expectedMatches,
		);
	}
	console.log("Rust runtime boundary guard: PASS");
	console.log(`Scanned ${files.length} production TS/TSX/ExtendScript files.`);
	console.log(
		`Authorized boundary baseline: ${allowedMatches} match(es) in ${exactBoundaries.length} exact file/rule entry(s).`,
	);
	for (const entry of PERMANENT_BOUNDARIES) {
		console.log(
			`  permanent ${entry.owner}: ${entry.expectedMatches} match(es)`,
		);
	}
	for (const [task, count] of [...debtByTask].sort()) {
		console.log(`  ${task}: ${count} match(es)`);
	}
};

if (Bun.argv.includes("--self-test")) {
	runSelfTest();
} else {
	runRepositoryScan();
}
