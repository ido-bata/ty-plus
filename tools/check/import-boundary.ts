/**
 * First Vertical Slice Import Boundary Check
 *
 * Prevents recurrence of the most dangerous architectural patterns
 * exposed by the EasingWidget apply flow slice.
 *
 * Modes:
 *   (none)             Scan and report all violations. Exit 1 if any found.
 *   --baseline         Write current shared->* violations to .baseline.json (commit this).
 *   --write-baseline   Write current management->function edges to .baseline-mgmt-fn.json.
 *   --strict           Fail only on NEW violations not in baseline. Exit 1 on new.
 *
 * Run with: bun tools/check/import-boundary.ts [--baseline|--write-baseline|--strict]
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { getImportEntries, type ImportEntry } from "./lib/extract.js";

const ROOT = resolve("src");
const BASELINE_PATH = resolve(__dirname, ".baseline.json");
const BASELINE_MGMT_FN_PATH = resolve(__dirname, ".baseline-mgmt-fn.json");

// ---------------------------------------------------------------------------
// Management -> Function edge (for baseline tracking)
// ---------------------------------------------------------------------------

export interface MgmtFnEdge {
	from: string;
	to: string;
	specifier: string;
	reason: string;
}

// ---------------------------------------------------------------------------
// Import detection (regex-based; see ./lib/extract.ts)
// ---------------------------------------------------------------------------

export type { ImportEntry };

export { getImportEntries };

// ---------------------------------------------------------------------------
// Module owner resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a Unix-style path (e.g., "/src/contract/widget.ts") by manually
 * resolving the relative specifier. This is needed because on Windows,
 * Node's resolve() treats "/src/..." as a path relative to the current drive root.
 */
const resolveUnixStylePath = (
	fromFilePath: string,
	specifier: string,
): string | null => {
	const normalizedFile = fromFilePath.replace(/\\/g, "/");
	const fileParts = normalizedFile.split("/"); // ["", "src", "contract", "widget.ts"]
	const fileDirParts = fileParts.slice(0, -1); // ["", "src", "contract"]

	const specParts = specifier.split("/"); // ["..", "..", "management", "storage"]
	const upCount = specParts.filter((p) => p === "..").length;
	const baseParts = fileDirParts.slice(0, fileDirParts.length - upCount);
	const downParts = specParts.filter(
		(p) => p !== "" && p !== "." && p !== "..",
	);
	const result = [...baseParts, ...downParts].join("/");

	// Sanity check: result should still be under /src/
	if (!result.startsWith("/src/")) {
		return null;
	}
	return result;
};

/**
 * Determine which vertical slice owns a module specifier from a given file.
 * Returns "shared", "management", "function", "contract", or null for external/unknown.
 */
export const resolveModuleOwner = (
	specifier: string,
	fromFilePath: string,
): string | null => {
	// External packages are not violations
	if (!specifier.startsWith(".")) {
		// @ty-plus/scoped packages
		if (specifier.startsWith("@ty-plus/shared")) return "shared";
		if (
			specifier.startsWith("@ty-plus/management") ||
			specifier.startsWith("@ty-plus/workspace") ||
			specifier.startsWith("@ty-plus/licensing") ||
			specifier.startsWith("@ty-plus/cloud")
		) {
			return "management";
		}
		if (
			specifier.startsWith("@ty-plus/function") ||
			specifier.startsWith("@ty-plus/widgets") ||
			specifier.startsWith("@ty-plus/host-ae")
		) {
			return "function";
		}
		if (specifier.startsWith("@ty-plus/contract")) {
			return "contract";
		}
		// Not a local module - treat as external
		return null;
	}

	// Resolve relative specifier from the directory of the importing file
	// Normalize to forward slashes first to handle Windows paths correctly
	const normalizedFrom = fromFilePath.replace(/\\/g, "/");

	// Determine the resolved path: use custom Unix resolver for Unix-style paths,
	// fall back to Node's resolve for Windows-style absolute paths
	let resolved: string;
	if (normalizedFrom.startsWith("/src/")) {
		// Unix-style absolute path (no drive letter) - use custom resolver
		const unixResolved = resolveUnixStylePath(normalizedFrom, specifier);
		if (!unixResolved) return null;
		resolved = unixResolved;
	} else {
		// Windows-style or other path - use standard Node resolution
		const fromDir = dirname(normalizedFrom);
		resolved = resolve(fromDir, specifier);
	}

	// Normalize to forward slashes and find first src segment
	const normalized = resolved.replace(/\\/g, "/");
	const srcMatch = normalized.match(/\/src\/([^/]+)/);
	if (!srcMatch) {
		// Not under src/ - could be outside the codebase
		return null;
	}

	// Validate it's a known owner (not just any directory under src/)
	const owner = srcMatch[1];
	if (
		owner !== "shared" &&
		owner !== "management" &&
		owner !== "function" &&
		owner !== "contract"
	) {
		return null;
	}
	return owner;
};

// ---------------------------------------------------------------------------
// Forbidden shared roots (domain-named folders that must not exist in src/shared/)
// ---------------------------------------------------------------------------

const FORBIDDEN_SHARED_ROOTS = new Set([
	"contract",
	"i18n",
	"style",
	"preset",
	"widget",
	"workspace",
	"storage",
	"online",
	"setting",
]);

// Allowed shared roots
const ALLOWED_SHARED_ROOTS = new Set(["component", "util", "index.ts"]);

/**
 * Check if the src/shared/ tree contains any forbidden domain-named folders.
 * Returns an array of violation messages (empty if clean).
 */
export const checkForbiddenSharedRoots = (): string[] => {
	const violations: string[] = [];
	const sharedRoot = resolve(ROOT, "shared");

	try {
		const entries = readdirSync(sharedRoot, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (FORBIDDEN_SHARED_ROOTS.has(entry.name)) {
					violations.push(
						`src/shared/${entry.name}/ exists — must not exist (domain ownership violation)`,
					);
				}
			} else if (entry.isFile()) {
				if (
					!ALLOWED_SHARED_ROOTS.has(entry.name) &&
					!entry.name.startsWith(".") &&
					entry.name !== "index.ts"
				) {
					// Allow index.ts, component/, util/, and hidden files
					violations.push(
						`src/shared/${entry.name} exists — must not exist (domain ownership violation)`,
					);
				}
			}
		}
	} catch {
		// shared directory may not exist — not a violation
	}

	return violations;
};

// ---------------------------------------------------------------------------
// Phase 1 ownership rules: shared may not flow to management or function
// ---------------------------------------------------------------------------

type ViolationChecker = (
	filePath: string,
	specifier: string,
	lineNumber: number,
	rawLine: string,
) => string | null; // reason string if violation, null otherwise

// Phase 1: only shared->management and shared->function are enforced
const CHECKERS: ViolationChecker[] = [
	// Active source must not import archive/
	(_filePath, specifier, _lineNumber, _rawLine) => {
		if (specifier.includes("/archive/")) {
			return "Active source must not import archive/";
		}
		return null;
	},
	// Active source must not import src/js (legacy UI - must migrate to src/cep-shell)
	(_filePath, specifier, _lineNumber, _rawLine) => {
		if (
			specifier.includes("src/js") ||
			specifier === "./js" ||
			specifier === "../js" ||
			specifier.endsWith("/js")
		) {
			return "Active source must not import from src/js (legacy UI - migrate to src/cep-shell)";
		}
		return null;
	},
];

// Phase 1 ownership rules: shared may not flow to management or function
export const classifyBoundaryViolation = (
	filePath: string,
	specifier: string,
): string | null => {
	// Determine the target owner (what is being imported)
	const targetOwner = resolveModuleOwner(specifier, filePath);

	// Extract the source owner directly from the file path
	const normalized = filePath.replace(/\\/g, "/");
	const srcOwnerMatch = normalized.match(/\/src\/([^/]+)/);
	const srcOwner = srcOwnerMatch ? srcOwnerMatch[1] : null;

	// Phase 3: shared may import only shared or external packages
	if (
		srcOwner === "shared" &&
		targetOwner !== null &&
		targetOwner !== "shared"
	) {
		return `shared -> ${targetOwner} (shared may import only shared or external packages)`;
	}

	// Phase 3: contract may import only contract or external packages
	if (
		srcOwner === "contract" &&
		targetOwner !== null &&
		targetOwner !== "contract"
	) {
		return `contract -> ${targetOwner} (contract may import only contract or external packages)`;
	}

	// Phase 3: contract must NOT import management, function, or shared/component
	// Even when resolution escapes /src/ (returns null), detect intent from specifier
	if (srcOwner === "contract" && targetOwner === null) {
		const normalizedSpec = specifier.replace(/\\/g, "/");
		if (
			normalizedSpec.includes("/management/") ||
			normalizedSpec.startsWith("management") ||
			normalizedSpec.includes("/function/") ||
			normalizedSpec.startsWith("function")
		) {
			return "contract -> function/management (contract must not import function or management)";
		}
		// Also check for shared/component intent
		if (
			normalizedSpec.includes("/shared/component") ||
			normalizedSpec.startsWith("shared/component")
		) {
			return "contract -> shared/component (contract must not import shared/component)";
		}
	}

	// Phase 3: contract must NOT import management, function, or shared/component
	if (srcOwner === "contract" && targetOwner !== null) {
		if (targetOwner === "management") {
			return "contract -> management (contract must not import management)";
		}
		if (targetOwner === "function") {
			return "contract -> function (contract must not import function)";
		}
		// shared/component is checked via specifier path
		const normalizedSpec = specifier.replace(/\\/g, "/");
		if (normalizedSpec.includes("/shared/component")) {
			return "contract -> shared/component (contract must not import shared/component)";
		}
	}

	// Phase 3: management may import contract, shared/component, shared/util
	// Note: management->function is tracked via mgmtFnEdges baseline, not a hard violation here
	// Note: management->management (intra-slice) is always allowed
	if (srcOwner === "management" && targetOwner === "shared") {
		const normalizedSpec = specifier.replace(/\\/g, "/");
		const isSharedComponent = normalizedSpec.includes("/shared/component");
		const isSharedUtil = normalizedSpec.includes("/shared/util");
		if (!isSharedComponent && !isSharedUtil) {
			return "management -> shared (management may import only contract, shared/component, shared/util)";
		}
	}

	// K1: management may import ONLY from function minimal index files
	// (e.g. @/function/widget/index.ts, @/function/preset/index.ts).
	// Direct imports to function implementation are violations.
	if (srcOwner === "management" && targetOwner === "function") {
		const normalizedSpec = specifier.replace(/\\/g, "/");
		// Allowed: any path that goes through a function-domain index.ts
		// e.g. @/function/widget/index.ts, @/function/preset/operations/index.ts
		const isIndexImport =
			normalizedSpec.includes("/function/") &&
			normalizedSpec.match(/\/function\/[^/]+\/index\.ts$/);
		if (!isIndexImport) {
			return "management -> function (management may import only from function minimal index)";
		}
	}

	// Phase 3: function may import contract, management, shared/component, shared/util
	// Note: function->function (intra-slice) is always allowed
	// External packages return null and are always allowed
	if (
		srcOwner === "function" &&
		targetOwner !== null &&
		targetOwner !== "function" &&
		targetOwner !== "contract" &&
		targetOwner !== "management" &&
		targetOwner !== "shared"
	) {
		const normalizedSpec = specifier.replace(/\\/g, "/");
		const isSharedComponent = normalizedSpec.includes("/shared/component");
		const isSharedUtil = normalizedSpec.includes("/shared/util");
		if (!isSharedComponent && !isSharedUtil) {
			return `function -> ${targetOwner} (function may import only contract, management, shared/component, shared/util)`;
		}
	}

	// Phase 1: shared -> management or shared -> function
	if (srcOwner === "shared" && targetOwner === "management") {
		return "shared -> management (shared may not depend on management)";
	}
	if (srcOwner === "shared" && targetOwner === "function") {
		return "shared -> function (shared may not depend on function)";
	}

	return null;
};

const checkOwnershipViolation = (
	filePath: string,
	specifier: string,
): string | null => {
	return classifyBoundaryViolation(filePath, specifier);
};

interface Violation {
	file: string;
	reason: string;
	line: string;
	lineNumber: number;
}

type Baseline = Record<string, Violation[]>;

const checkFile = (filePath: string): Violation[] => {
	const violations: Violation[] = [];
	try {
		const content = readFileSync(filePath, "utf-8");
		const entries = getImportEntries(filePath, content);

		for (const entry of entries) {
			// Run legacy checkers
			for (const checker of CHECKERS) {
				const reason = checker(
					filePath,
					entry.specifier,
					entry.lineNumber,
					entry.rawLine,
				);
				if (reason) {
					violations.push({
						file: filePath,
						reason,
						line: entry.rawLine,
						lineNumber: entry.lineNumber,
					});
				}
			}

			// Run ownership rule (Phase 1: shared->management, shared->function)
			const ownershipReason = checkOwnershipViolation(
				filePath,
				entry.specifier,
			);
			if (ownershipReason) {
				violations.push({
					file: filePath,
					reason: ownershipReason,
					line: entry.rawLine,
					lineNumber: entry.lineNumber,
				});
			}
		}
	} catch {
		// Skip files that can't be read
	}
	return violations;
};

const scanDirectory = (dir: string, extensions: string[]): string[] => {
	const files: string[] = [];
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (
					!entry.name.includes("node_modules") &&
					!entry.name.includes("dist") &&
					!entry.name.includes(".git") &&
					!entry.name.includes("archive") &&
					entry.name !== "js" // legacy UI being migrated
				) {
					files.push(...scanDirectory(fullPath, extensions));
				}
			} else if (extensions.some((ext) => entry.name.endsWith(ext))) {
				files.push(fullPath);
			}
		}
	} catch {
		// Skip directories that can't be read
	}
	return files;
};

const normalizedFileFor = (filePath: string): string => {
	const normalized = filePath.replace(/\\/g, "/");
	const sourceIndex = normalized.lastIndexOf("/src/");
	return sourceIndex === -1 ? normalized : normalized.slice(sourceIndex + 1);
};

const keyFor = (v: Violation): string =>
	`${normalizedFileFor(v.file)}:${v.lineNumber} :: ${v.reason}`;

const stableKeyFor = (v: Violation): string =>
	`${normalizedFileFor(v.file)} :: ${v.reason} :: ${v.line}`;

const main = (args: string[]) => {
	const mode = args[2] as
		| "--baseline"
		| "--write-baseline"
		| "--strict"
		| undefined;

	console.log("🔍 Running import boundary check...\n");

	// Phase 3: Check for forbidden shared roots (domain ownership violations)
	const forbiddenRootViolations = checkForbiddenSharedRoots();
	if (forbiddenRootViolations.length > 0) {
		console.log(
			`❌ Found ${forbiddenRootViolations.length} forbidden shared root violation(s):\n`,
		);
		for (const v of forbiddenRootViolations) {
			console.log(`  ${v}\n`);
		}
		// In default mode (no flags), exit with error if forbidden roots exist
		// In --baseline or --write-baseline mode, include them in baseline later
		// In --strict mode, add them to allViolations to check against baseline
		if (
			mode === "--baseline" ||
			mode === "--strict" ||
			mode === "--write-baseline"
		) {
			// Include forbidden root violations
		} else {
			console.log(
				"📝 To record as baseline: bun tools/check/import-boundary.ts --baseline\n",
			);
			process.exit(1);
		}
	}

	const tsFiles = scanDirectory(ROOT, [".ts", ".tsx"]);
	const allViolations: Violation[] = [];
	const mgmtFnEdges: MgmtFnEdge[] = [];

	// In --baseline mode, include forbidden root violations in baseline
	if (mode === "--baseline" && forbiddenRootViolations.length > 0) {
		for (const v of forbiddenRootViolations) {
			allViolations.push({
				file: v, // store violation message as "file"
				reason: "forbidden-shared-root",
				line: v,
				lineNumber: 0,
			});
		}
	}

	// In --strict mode, add forbidden root violations to allViolations to check against baseline
	if (mode === "--strict" && forbiddenRootViolations.length > 0) {
		for (const v of forbiddenRootViolations) {
			allViolations.push({
				file: v,
				reason: "forbidden-shared-root",
				line: v,
				lineNumber: 0,
			});
		}
	}

	for (const file of tsFiles) {
		allViolations.push(...checkFile(file));
		// Track management->function edges for baseline
		const content = readFileSync(file, "utf-8");
		const entries = getImportEntries(file, content);
		// Extract file owner from path directly (resolveModuleOwner returns null for absolute paths)
		const fileOwner = (() => {
			const normalized = file.replace(/\\/g, "/");
			const srcMatch = normalized.match(/\/src\/([^/]+)/);
			return srcMatch ? srcMatch[1] : null;
		})();
		for (const entry of entries) {
			const targetOwner = resolveModuleOwner(entry.specifier, file);
			if (fileOwner === "management" && targetOwner === "function") {
				mgmtFnEdges.push({
					from: normalizedFileFor(file),
					to: entry.specifier,
					specifier: entry.specifier,
					reason: "management must not import function implementation directly",
				});
			}
		}
	}

	if (mode === "--baseline") {
		const baseline: Baseline = {};
		for (const v of allViolations) {
			const k = keyFor(v);
			if (!baseline[k]) {
				baseline[k] = [];
			}
			baseline[k]?.push(v);
		}
		writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2), "utf-8");
		console.log(
			`📝 Baseline written to ${BASELINE_PATH} (${allViolations.length} violation(s) recorded)\n`,
		);
		process.exit(0);
	}

	if (mode === "--write-baseline") {
		writeFileSync(
			BASELINE_MGMT_FN_PATH,
			JSON.stringify(mgmtFnEdges, null, 2),
			"utf-8",
		);
		console.log(
			`📝 Management->function baseline written to ${BASELINE_MGMT_FN_PATH} (${mgmtFnEdges.length} edge(s) recorded)\n`,
		);
		process.exit(0);
	}

	if (mode === "--strict") {
		if (!existsSync(BASELINE_PATH)) {
			console.log(
				"⚠️  No baseline found. Run without flags first, then with --baseline to create it.\n",
			);
			process.exit(1);
		}
		const baseline: Baseline = JSON.parse(
			readFileSync(BASELINE_PATH, "utf-8"),
		) as Baseline;
		const known = new Set(Object.keys(baseline));
		const knownStable = new Set(
			Object.values(baseline)
				.flat()
				.map((v) => stableKeyFor(v)),
		);
		const newViolations = allViolations.filter(
			(v) => !known.has(keyFor(v)) && !knownStable.has(stableKeyFor(v)),
		);

		// Check management->function against baseline
		// K1: baseline-mgmt-fn.json is deleted. Management->function violations are now
		// caught directly by the index-only rule in classifyBoundaryViolation.
		// We still report new edges found that aren't in the baseline file, but
		// since we deleted the frozen allowlist, this is now a no-op check.
		const newMgmtFnViolations: MgmtFnEdge[] = [];
		if (existsSync(BASELINE_MGMT_FN_PATH)) {
			const mgmtFnBaseline: MgmtFnEdge[] = JSON.parse(
				readFileSync(BASELINE_MGMT_FN_PATH, "utf-8"),
			);
			const baselineEdges = new Set(
				mgmtFnBaseline.map((e) => `${e.from}::${e.to}::${e.specifier}`),
			);
			for (const edge of mgmtFnEdges) {
				const key = `${edge.from}::${edge.to}::${edge.specifier}`;
				if (!baselineEdges.has(key)) {
					newMgmtFnViolations.push(edge);
				}
			}
		}

		if (newViolations.length === 0 && newMgmtFnViolations.length === 0) {
			console.log("✅ No new violations (all match baseline)\n");
			process.exit(0);
		}

		if (newViolations.length > 0) {
			console.log(
				`❌ ${newViolations.length} new violation(s) not in baseline:\n`,
			);
			for (const v of newViolations) {
				console.log(`  ${v.file}:${v.lineNumber}`);
				console.log(`    Reason: ${v.reason}`);
				console.log(`    Line: ${v.line}\n`);
			}
		}

		if (newMgmtFnViolations.length > 0) {
			console.log(
				`❌ ${newMgmtFnViolations.length} new management->function import(s) not in baseline:\n`,
			);
			for (const e of newMgmtFnViolations) {
				console.log(`  ${e.from}`);
				console.log(`    imports: ${e.specifier}`);
				console.log(`    reason: ${e.reason}\n`);
			}
		}
		process.exit(1);
	}

	// Default: report all
	if (allViolations.length === 0) {
		console.log("✅ No boundary violations found\n");
		process.exit(0);
	}

	console.log(`❌ Found ${allViolations.length} boundary violation(s):\n`);
	for (const v of allViolations) {
		console.log(`  ${v.file}:${v.lineNumber}`);
		console.log(`    Reason: ${v.reason}`);
		console.log(`    Line: ${v.line}\n`);
	}
	console.log(
		"📝 To record current violations as baseline: bun tools/check/import-boundary.ts --baseline\n",
	);
	console.log(
		"🔒 To fail only on new violations: bun tools/check/import-boundary.ts --strict\n",
	);
	process.exit(1);
};

// Guard: only run main when executed as CLI script, not imported as a module
if (typeof require !== "undefined" && require.main === module) {
	main(process.argv);
}
