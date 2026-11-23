#!/usr/bin/env bun
/**
 * story-only-code — detects source files that only Storybook stories
 * can reach.
 *
 * WHY THIS EXISTS
 *
 * Storybook stories are the usual place where a UI component is extracted
 * and polished: the story gives it a name, props, and a screenshot. What
 * the story does NOT give it is a production caller. The extraction is then
 * abandoned, the production code keeps its own inline copy, and the two
 * drift apart.
 *
 * knip cannot catch this: its Storybook plugin registers every
 * "*.stories.tsx" file as an **entry point** (see
 * `node_modules/knip/dist/plugins/storybook/index.js`), so anything a story
 * imports looks "used". The dead-code signal is structurally invisible.
 *
 * The concrete case this was written for (Issue #327): in
 * `src/function/widget/utility/directory-browser/`, `BrowserHeader.tsx` and
 * its five children plus `CatalogPresetListRow.tsx` / `CatalogPresetIconTile.tsx`
 * were imported by nothing but their own stories, while the shipped
 * `Component.tsx` carried a hand-rolled inline copy of all of them. The
 * widget had no story of its own, so Storybook showed the dead UI and the
 * app showed something else entirely.
 *
 * RULE
 *
 * A file is *story-only* when every production importer of it is itself
 * story-only, and at least one Storybook story imports it. That is a
 * fixpoint over the import graph:
 *
 *   - seed: files with no production importer but at least one story importer
 *   - iterate: a file joins when all of its production importers are already
 *     in the set (and a story imports it, directly or through the set)
 *
 * Files that nothing imports at all are NOT reported: unreferenced code is a
 * different problem with a different owner (knip covers it once the story
 * graph is out of the way).
 *
 * SCOPE
 *
 * Only `.tsx` files are reported — a component file that no production code
 * can reach is a UI surface the app does not actually show. A `.ts` module
 * that only stories use (a fixture, a type module, a story-only helper) is
 * not a user-visible defect and is left alone.
 *
 * Exit codes:
 *   0 - no story-only files (or every one is allowlisted)
 *   1 - violations detected
 */

import {
	type Dirent,
	existsSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getImportEntries } from "../../tools/check/lib/extract";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const SRC_DIR = join(ROOT, "src");
const ALLOWLIST_PATH = join(
	ROOT,
	"scripts",
	"check",
	"story-only-allowlist.json",
);

export type StoryOnlyFinding = {
	/** Repo-relative path of the story-only file. */
	file: string;
	/** Repo-relative paths of the Storybook stories that reach it. */
	via: string[];
};

type FileKind = "source" | "story" | "test";

type SourceFile = {
	path: string;
	kind: FileKind;
	/** Resolved repo-relative paths this file imports. */
	imports: string[];
};

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function classify(name: string): FileKind {
	if (name.endsWith(".stories.tsx") || name.endsWith(".stories.ts")) {
		return "story";
	}
	if (/\.(test|spec)\.tsx?$/.test(name)) return "test";
	return "source";
}

export function collectSourceFiles(dir: string): SourceFile[] {
	const out: SourceFile[] = [];
	const walk = (current: string): void => {
		let entries: Dirent[];
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
				out.push({
					path: full,
					kind: classify(entry.name),
					imports: [],
				});
			}
		}
	};
	walk(dir);
	return out;
}

// ---------------------------------------------------------------------------
// Import resolution
// ---------------------------------------------------------------------------

const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

function resolveSpecifier(
	fromFile: string,
	specifier: string,
	known: Set<string>,
	root = ROOT,
): string | null {
	let base: string;
	if (specifier.startsWith("@/")) {
		base = join(root, "src", specifier.slice(2));
	} else if (specifier.startsWith(".")) {
		base = resolve(dirname(fromFile), specifier);
	} else {
		// Package imports (including "@ty-plus/ui") are external leaves.
		return null;
	}
	const candidates = [
		base,
		...EXTENSIONS.map((ext) => `${base}${ext}`),
		...EXTENSIONS.map((ext) => join(base, `index${ext}`)),
	];
	for (const candidate of candidates) {
		if (known.has(candidate)) return candidate;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export function findStoryOnlyFiles(
	files: SourceFile[],
	root = ROOT,
): StoryOnlyFinding[] {
	const _known = new Set(files.map((f) => f.path));

	// Reverse edges: who imports this file.
	const prodImporters = new Map<string, string[]>();
	const storyImporters = new Map<string, string[]>();
	for (const file of files) {
		for (const target of file.imports) {
			const bucket = file.kind === "story" ? storyImporters : prodImporters;
			const list = bucket.get(target);
			if (list) list.push(file.path);
			else bucket.set(target, [file.path]);
		}
	}

	// Production reachability.
	//
	// A production file that NOTHING imports is an entry point (the app wires
	// it through a manifest, a config file, or a side-effect import).
	// Everything reachable from those entry points is production code. A file
	// that is NOT reachable that way, but that a story does import, is
	// story-only.
	//
	// This formulation handles the mutual case that a naive "no production
	// importer" test cannot: BrowserHeader is imported by BrowserToolbar,
	// and BrowserToolbar is imported by BrowserHeader. Neither is an entry
	// point, so neither is production-reachable, so both are story-only.
	const allImporters = new Map<string, string[]>();
	for (const file of files) {
		for (const target of file.imports) {
			const list = allImporters.get(target);
			if (list) list.push(file.path);
			else allImporters.set(target, [file.path]);
		}
	}
	const roots = files.filter(
		(file) =>
			file.kind !== "story" && (allImporters.get(file.path) ?? []).length === 0,
	);
	const productionReachable = new Set<string>();
	{
		const queue = roots.map((f) => f.path);
		for (const root of queue) productionReachable.add(root);
		while (queue.length > 0) {
			const current = queue.pop() as string;
			const currentFile = files.find((f) => f.path === current);
			if (!currentFile) continue;
			for (const target of currentFile.imports) {
				if (productionReachable.has(target)) continue;
				productionReachable.add(target);
				queue.push(target);
			}
		}
	}

	// Story-only: not production-reachable, but still imported by something
	// (a story, or another story-only file). A file nothing imports at all
	// is an entry point by definition and therefore out of scope.
	const storyOnly = new Set<string>();
	for (const file of files) {
		if (file.kind !== "source") continue;
		if (productionReachable.has(file.path)) continue;
		if ((allImporters.get(file.path) ?? []).length === 0) continue;
		storyOnly.add(file.path);
	}

	// Report which stories reach each story-only file.
	const findings: StoryOnlyFinding[] = [];
	for (const file of files) {
		if (!storyOnly.has(file.path)) continue;
		// Only component files: a story-only `.ts` module (types, fixtures,
		// helpers) is not a user-visible surface.
		if (!file.path.endsWith(".tsx")) continue;
		const via = new Set<string>();
		const queue = [file.path];
		const seen = new Set(queue);
		while (queue.length > 0) {
			const current = queue.pop() as string;
			for (const story of storyImporters.get(current) ?? []) {
				via.add(relative(root, story));
			}
			for (const importer of prodImporters.get(current) ?? []) {
				if (seen.has(importer)) continue;
				seen.add(importer);
				queue.push(importer);
			}
		}
		findings.push({
			file: relative(root, file.path),
			via: [...via].sort(),
		});
	}
	return findings.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Reads the import graph off disk. Kept separate from `findStoryOnlyFiles`
 * so the detection rule can be tested without touching the file system.
 */
export function resolveImports(files: SourceFile[], root = ROOT): SourceFile[] {
	const known = new Set(files.map((f) => f.path));
	for (const file of files) {
		const src = readFileSync(file.path, "utf8");
		const resolved: string[] = [];
		for (const entry of getImportEntries(file.path, src)) {
			const target = resolveSpecifier(file.path, entry.specifier, known, root);
			if (target) resolved.push(target);
		}
		file.imports = resolved;
	}
	return files;
}

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------

/**
 * An allowlisted story-only component, with the reason it is tolerated.
 * The reason is mandatory: "we do not know yet" is not a reason, it is the
 * debt this check exists to make visible.
 */
export type AllowlistEntry = {
	file: string;
	reason: string;
};

export function loadAllowlist(path = ALLOWLIST_PATH): AllowlistEntry[] {
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(entry): entry is AllowlistEntry =>
				typeof entry === "object" &&
				entry !== null &&
				typeof (entry as AllowlistEntry).file === "string" &&
				typeof (entry as AllowlistEntry).reason === "string",
		);
	} catch {
		return [];
	}
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/**
 * Default reason per area, used when the baseline is (re)generated. Every
 * entry names the change that would clear it.
 */
function defaultReason(file: string): string {
	if (file.startsWith("src/management/online/catalog/")) {
		return "the online catalog surface is dormant and scheduled for removal (Issue #193); the components are unreachable from the app until then";
	}
	if (file.startsWith("src/function/widget/utility/font-viewer/")) {
		return "extracted font-viewer sub-components that the widget still renders inline; wire them in or delete them";
	}
	if (file.startsWith("src/function/widget/utility/quick-actions/")) {
		return "extracted quick-actions sub-components that the widget still renders inline; wire them in or delete them";
	}
	if (file.startsWith("src/management/preset/group/")) {
		return "extracted preset-group sub-components that the group dialog still renders inline; wire them in or delete them (Issue #192)";
	}
	if (file.startsWith("src/management/preset/tool-shell/")) {
		return "extracted tool-shell dialog sections that the dialog still renders inline; wire them in or delete them";
	}
	if (file.startsWith("src/management/preset/catalog-add/")) {
		return "extracted catalog-add dialog sections that the dialog still renders inline; wire them in or delete them";
	}
	if (file.startsWith("src/management/preset/markdown/")) {
		return "extracted markdown editor parts that the editor still renders inline; wire them in or delete them";
	}
	return "extracted component that production code no longer reaches; wire it in or delete it";
}

export function collectStoryOnlyFiles(root = ROOT): StoryOnlyFinding[] {
	const files = resolveImports(collectSourceFiles(join(root, "src")), root);
	return findStoryOnlyFiles(files, root);
}

function main(): void {
	if (!existsSync(SRC_DIR)) {
		console.error("story-only-code: src/ not found");
		process.exit(1);
	}
	const findings = collectStoryOnlyFiles();
	const allowlist = loadAllowlist();

	if (process.argv.includes("--write-baseline")) {
		const existing = new Map(allowlist.map((e) => [e.file, e.reason]));
		const merged = findings.map((f) => ({
			file: f.file,
			reason: existing.get(f.file) ?? defaultReason(f.file),
		}));
		writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(merged, null, "\t")}\n`);
		console.log(
			`story-only: wrote ${merged.length} baseline entr(ies) to ${relative(ROOT, ALLOWLIST_PATH)}`,
		);
		return;
	}

	const allowed = new Map(allowlist.map((e) => [e.file, e.reason]));
	const fresh = findings.filter((f) => !allowed.has(f.file));
	const stale = allowlist.filter(
		(entry) => !findings.some((f) => f.file === entry.file),
	);

	for (const finding of fresh) {
		console.error(
			`FAIL ${finding.file} — reachable only from Storybook (${finding.via.join(", ")})`,
		);
	}
	for (const entry of stale) {
		console.error(
			`STALE ${entry.file} — allowlist entry is no longer story-only; remove it`,
		);
	}
	if (fresh.length > 0 || stale.length > 0) {
		console.error(
			`\nstory-only: ${fresh.length} new violation(s), ${stale.length} stale allowlist entry(ies)`,
		);
		console.error(
			"Wire the component into production, delete it, or allowlist it with a reason.",
		);
		process.exit(1);
	}
	console.log(`story-only: ok (${findings.length} allowlisted, 0 new)`);
}

if (import.meta.main) {
	main();
}
