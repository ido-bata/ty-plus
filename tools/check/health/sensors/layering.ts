/**
 * Layering sensor — detects management-to-function implementation import violations.
 *
 * INV-2: management may only import function index, never function internals.
 * management -> function index:  allowed (e.g. @/function/widget/index)
 * management -> function deep:  forbidden (e.g. @/function/widget/core/easing/Component)
 *
 * INV-7: severity-ranked, non-blocking.
 * INV-8: additive only.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Finding, Severity } from "../types.js";

const WEIGHTS: Record<Severity, number> = {
	critical: 8,
	high: 4,
	medium: 2,
	low: 1,
};

export function run(srcRoot: string): Finding[] {
	const findings: Finding[] = [];

	if (!existsSync(srcRoot)) return findings;

	const files = collectSourceFiles(srcRoot);

	for (const file of files) {
		findings.push(...checkLayeringViolations(file, srcRoot));
	}

	return findings;
}

// ---------------------------------------------------------------------------
// Layering violation detection
// ---------------------------------------------------------------------------

/**
 * Internal infrastructure modules that management must NEVER import directly.
 *
 * These are function-layer internals whose direct import is a critical violation
 * regardless of depth, because their side-effects (e.g. import.meta.glob in
 * registry.ts) are not guaranteed to have run when management reaches them
 * outside the normal module graph, and because bypassing the management-layer
 * shim breaks the layer contract in ways that are silent at runtime.
 *
 * Pattern: substring match against the full import path (after "@/function/").
 */
const CRITICAL_INTERNAL_MODULES: ReadonlyArray<{
	pattern: string;
	reason: string;
}> = [
	{
		pattern: "widget/registry",
		reason:
			"Direct import of function/widget/registry bypasses the management/widget/registry shim. " +
			"Use @/management/widget/registry instead. " +
			"(Root cause of the 2026-05 'widgets render as container only' bug: wrong glob path was silent)",
	},
	{
		pattern: "widget/renderWidget",
		reason:
			"renderWidget is a function-layer implementation detail. " +
			"management/widget/workspace/TileContent should call it only after obtaining a descriptor via the registry shim.",
	},
];

/**
 * Check a single file for management->function deep import violations.
 * Allowed: @/function/<feature>/index or @/function/<feature>
 * Forbidden: @/function/<feature>/<subpath> where subpath is not "index"
 * Critical override: imports matching CRITICAL_INTERNAL_MODULES are always critical.
 */
function checkLayeringViolations(file: string, srcRoot: string): Finding[] {
	const findings: Finding[] = [];

	const rel = relative(srcRoot, file).replace(/\\/g, "/");
	const relParts = rel.split("/");

	// Only check management files
	if (relParts[0] !== "management") return findings;

	const content = readFileSync(file, "utf-8");
	const imports = parseImports(content);

	for (const imp of imports) {
		if (!imp.startsWith("@/")) continue;

		const targetParts = imp.replace("@/", "").split("/");

		// Must start with "function" to be a function import
		if (targetParts[0] !== "function") continue;

		// Critical override: specific internal modules are always critical,
		// regardless of depth — they represent documented failure patterns.
		const internalPath = targetParts.slice(1).join("/");
		const criticalMatch = CRITICAL_INTERNAL_MODULES.find((m) =>
			internalPath.startsWith(m.pattern),
		);
		if (criticalMatch) {
			findings.push(
				makeFinding(
					"critical",
					file,
					findLineForImport(content, imp),
					`INV-2 critical: management directly imports '@/${imp.replace("@/", "")}' — ${criticalMatch.reason}`,
					WEIGHTS.critical,
				),
			);
			continue;
		}

		// management may only import @/function/<feature>/index (or @/function/<feature> directly)
		// Anything deeper than 2 path segments from "function" is a violation
		// e.g. @/function/widget/index     -> ok (index import)
		// e.g. @/function/widget           -> ok (bare function index, treated as index)
		// e.g. @/function/widget/core/...  -> violation (deep impl)
		if (targetParts.length <= 2) continue; // @/function/<feature> or @/function/<feature>/index — ok

		// At targetParts.length >= 3, we have @/function/<feature>/<subpath>
		// If subpath is "index", it's the index — ok
		if (targetParts[2] === "index") continue;

		// Anything else is a deep implementation import
		const feature = targetParts[1];
		const depth = targetParts.length - 3;
		findings.push(
			makeFinding(
				classifySeverity(depth),
				file,
				findLineForImport(content, imp),
				`INV-2 violation: management imports function implementation '@/${targetParts.join("/")}' — allowed only via function/${feature}/index`,
				WEIGHTS[classifySeverity(depth)],
			),
		);
	}

	return findings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseImports(content: string): string[] {
	const imports: string[] = [];
	// Match static import paths: import ... from 'path' or import "path"
	const re =
		/import\s+(?:(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(content)) !== null) {
		imports.push(m[1]);
	}
	return imports;
}

function classifySeverity(depth: number): Severity {
	// Deeper violations are more severe — they reach further into implementation
	if (depth >= 3) return "critical";
	if (depth === 2) return "high";
	if (depth === 1) return "medium";
	return "low";
}

function makeFinding(
	severity: Severity,
	file: string,
	line: number | undefined,
	message: string,
	weight: number,
): Finding {
	return {
		sensor: "layering",
		severity,
		file: relative(process.cwd(), file).replace(/\\/g, "/"),
		line,
		message,
		weight,
		ruleRef: "INV-2",
	};
}

function findLineForImport(content: string, imp: string): number | undefined {
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].includes(`'${imp}'`) || lines[i].includes(`"${imp}"`)) {
			return i + 1;
		}
	}
	return undefined;
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
				walkDir(full, extensions, cb);
			} else if (extensions.some((ext) => entry.name.endsWith(ext))) {
				cb(full);
			}
		}
	} catch {
		// skip unreadable dirs
	}
}
