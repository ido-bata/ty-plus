/**
 * References sensor — detects orphan files, barrel-bypass, and deep-import-into-feature.
 *
 * INV-2: management may only import function index, never function internals.
 * INV-1: layered structure (management / function / shared) must be respected.
 * INV-8: additive only — this sensor reports signal, never blocks.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Finding, Severity } from "../types.js";

export function run(srcRoot: string): Finding[] {
	const findings: Finding[] = [];

	if (!existsSync(srcRoot)) return findings;

	const allFiles = collectSourceFiles(srcRoot);
	const referenceMap = buildReferenceMap(srcRoot, allFiles);

	// 1. Orphan files — exist but nothing references them (exclude index files)
	findings.push(...detectOrphans(allFiles, referenceMap));

	// 2. Barrel-bypass — imports that skip the barrel (deep import instead of index)
	findings.push(...detectBarrelBypass(srcRoot, allFiles));

	// 3. Deep-import-into-feature — management importing function internals
	findings.push(...detectDeepIntoFeature(srcRoot, allFiles));

	return findings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectSourceFiles(root: string): string[] {
	const files: string[] = [];
	walkDir(root, [".ts", ".tsx"], (file) => {
		files.push(file);
	});
	return files;
}

function buildReferenceMap(
	srcRoot: string,
	files: string[],
): Map<string, Set<string>> {
	const map = new Map<string, Set<string>>(); // file -> files it references
	for (const file of files) {
		const content = readFileSync(file, "utf-8");
		const imports = parseImports(content);
		const refs = new Set<string>();
		for (const imp of imports) {
			const resolved = resolveImport(imp, file, srcRoot);
			if (resolved) refs.add(resolved);
		}
		map.set(file, refs);
	}
	return map;
}

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

function resolveImport(
	imp: string,
	fromFile: string,
	srcRoot: string,
): string | null {
	// Skip node_modules / package imports
	if (!imp.startsWith("@/") && !imp.startsWith(".")) return null;

	let targetPath: string;
	if (imp.startsWith("@/")) {
		targetPath = join(srcRoot, imp.replace("@/", ""));
	} else {
		targetPath = resolve(fromFile, "..", imp);
	}

	// Try .ts / .tsx / index.ts resolution
	for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
		const p = targetPath + ext;
		if (existsSync(p)) return p;
	}
	return null;
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

function detectOrphans(
	files: string[],
	referenceMap: Map<string, Set<string>>,
): Finding[] {
	const findings: Finding[] = [];
	const referenced = new Set<string>();
	for (const [, refs] of referenceMap) {
		for (const ref of refs) referenced.add(ref);
	}

	for (const file of files) {
		const name = file.split(/[/\\]/).pop() ?? "";
		// index files are aggregators, not orphans
		if (name === "index.ts" || name === "index.tsx") continue;
		if (!referenced.has(file) && !isExcludedOrphan(file)) {
			findings.push(
				makeFinding(
					"critical",
					file,
					0,
					`orphan file — nothing references it`,
					8,
				),
			);
		}
	}
	return findings;
}

function detectBarrelBypass(srcRoot: string, files: string[]): Finding[] {
	const findings: Finding[] = [];
	for (const file of files) {
		const content = readFileSync(file, "utf-8");
		const imports = parseImports(content);
		for (const imp of imports) {
			if (!imp.startsWith("@/")) continue;
			const parts = imp.replace("@/", "").split("/");
			// A barrel is index.ts at any directory level
			const isBarrel = parts[parts.length - 1] === "index";
			if (isBarrel) continue;
			// Check if this import skips a barrel at an intermediate level
			const importedDir = join(srcRoot, ...parts.slice(0, -1));
			const barrelCandidate = join(importedDir, "index.ts");
			if (existsSync(barrelCandidate) && !imp.endsWith("/index")) {
				// barrel exists but not used — deep import bypasses it
				findings.push(
					makeFinding(
						"high",
						file,
						findLineForImport(content, imp),
						`barrel-bypass: '${imp}' skips barrel at ${parts.slice(0, -1).join("/")}/`,
						4,
					),
				);
			}
		}
	}
	return findings;
}

function detectDeepIntoFeature(srcRoot: string, files: string[]): Finding[] {
	const findings: Finding[] = [];

	for (const file of files) {
		const rel = relative(srcRoot, file);
		const relParts = rel.split(/[/\\]/);

		// Only check management files importing into function
		if (!relParts[0].startsWith("management")) return findings;

		const content = readFileSync(file, "utf-8");
		const imports = parseImports(content);

		for (const imp of imports) {
			if (!imp.startsWith("@/")) continue;

			const targetParts = imp.replace("@/", "").split("/");

			// management may only import shared (no function internals)
			if (targetParts[0] === "function") {
				const featurePath = targetParts.slice(0, 3).join("/"); // e.g. function/widget/core/align
				findings.push(
					makeFinding(
						"critical",
						file,
						findLineForImport(content, imp),
						`INV-2 violation: management imports function internals '@/${targetParts.join("/")}' — allowed only via function index`,
						8,
					),
				);
			}
		}
	}
	return findings;
}

function makeFinding(
	severity: Severity,
	file: string,
	line: number | undefined,
	message: string,
	weight: number,
): Finding {
	return {
		sensor: "references",
		severity,
		file: relative(process.cwd(), file),
		line,
		message,
		weight,
		ruleRef: "INV-2 / INV-1",
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

function isExcludedOrphan(file: string): boolean {
	const name = file.split(/[/\\]/).pop() ?? "";
	// Exclude test files, config, and well-known utility entry points
	return (
		name.endsWith(".test.ts") ||
		name.endsWith(".test.tsx") ||
		name.endsWith(".config.ts") ||
		name === "types.ts" ||
		name === "constants.ts"
	);
}
