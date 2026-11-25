#!/usr/bin/env bun
/**
 * story-subject — detects stub stories that never touch their nominal
 * subject.
 *
 * WHY THIS EXISTS
 *
 * `story-only-code.ts` catches components that only stories can reach.
 * It cannot catch the inverse defect: a `*.stories.tsx` file that
 * hand-rolls a lookalike component inline and never imports the
 * production module it claims to document. Those stories render
 * Storybook-only UI — they drift from the shipped component and give
 * reviewers false confidence (the "stub story" half of Issue #595).
 *
 * RULE
 *
 * Every story file must transitively import at least one non-story,
 * non-test source module that lives in the SAME directory as the story.
 * The subject does not have to be imported directly — a story may reach
 * it through a same-directory barrel, fixture, or sibling module — but
 * the chain must terminate in real code next to the story.
 *
 * Stories that legitimately have no same-directory subject (decorator
 * sanity checks, cross-package composition stories) are listed in
 * `story-subject-allowlist.json` with a mandatory reason.
 *
 * Scope matches `story-only-code.ts`: `src/`, `packages/ui/src`, and
 * `apps/web/src`, with the same path-alias resolution (`@/`,
 * `@ty-plus/ui`, `@ty-plus/product/*`, and the `@ty-plus/*` workspace
 * aliases).
 *
 * Exit codes:
 *   0 - every story reaches a same-directory subject (or is allowlisted)
 *   1 - violations detected
 */

import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	collectSourceFiles,
	loadAllowlist,
	resolveImports,
	type SourceFile,
} from "./story-only-code";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const ALLOWLIST_PATH = join(
	ROOT,
	"scripts",
	"check",
	"story-subject-allowlist.json",
);

const SCAN_DIRS = [
	join(ROOT, "src"),
	join(ROOT, "packages", "ui", "src"),
	join(ROOT, "apps", "web", "src"),
];

export type StorySubjectFinding = {
	/** Repo-relative path of the offending story file. */
	file: string;
};

/**
 * Returns true when `story` transitively imports a non-story, non-test
 * module located in the same directory. The walk follows every resolved
 * import edge regardless of the intermediate file's kind, so a story may
 * reach its subject through a sibling barrel or fixture.
 */
export function storyReachesSameDirSubject(
	story: SourceFile,
	filesByPath: Map<string, SourceFile>,
): boolean {
	const storyDir = dirname(story.path);
	const seen = new Set<string>([story.path]);
	const queue = [...story.imports];
	while (queue.length > 0) {
		const current = queue.pop() as string;
		if (seen.has(current)) continue;
		seen.add(current);
		const file = filesByPath.get(current);
		if (!file) continue;
		if (file.kind === "source" && dirname(file.path) === storyDir) {
			return true;
		}
		queue.push(...file.imports);
	}
	return false;
}

export function findSubjectlessStories(
	files: SourceFile[],
	root = ROOT,
): StorySubjectFinding[] {
	const filesByPath = new Map(files.map((f) => [f.path, f]));
	const findings: StorySubjectFinding[] = [];
	for (const file of files) {
		if (file.kind !== "story") continue;
		if (storyReachesSameDirSubject(file, filesByPath)) continue;
		findings.push({ file: relative(root, file.path) });
	}
	return findings.sort((a, b) => a.file.localeCompare(b.file));
}

export function collectSubjectlessStories(root = ROOT): StorySubjectFinding[] {
	const files = SCAN_DIRS.filter((dir) => existsSync(dir)).flatMap((dir) =>
		collectSourceFiles(dir),
	);
	resolveImports(files, root);
	return findSubjectlessStories(files, root);
}

function main(): void {
	if (!SCAN_DIRS.some((dir) => existsSync(dir))) {
		console.error("story-subject: no scan directories found");
		process.exit(1);
	}
	const findings = collectSubjectlessStories();
	const allowlist = loadAllowlist(ALLOWLIST_PATH);

	if (process.argv.includes("--write-baseline")) {
		const merged = findings.map((f) => ({
			file: f.file,
			reason: "TODO: document why this story has no same-directory subject",
		}));
		writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(merged, null, "\t")}\n`);
		console.log(
			`story-subject: wrote ${merged.length} baseline entr(ies) to ${relative(ROOT, ALLOWLIST_PATH)}`,
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
			`FAIL ${finding.file} — story never transitively imports a non-story module from its own directory`,
		);
	}
	for (const entry of stale) {
		console.error(
			`STALE ${entry.file} — allowlist entry no longer applies; remove it`,
		);
	}
	if (fresh.length > 0 || stale.length > 0) {
		console.error(
			`\nstory-subject: ${fresh.length} new violation(s), ${stale.length} stale allowlist entry(ies)`,
		);
		console.error(
			"Render the real subject component, or allowlist the story with a reason.",
		);
		process.exit(1);
	}
	console.log(`story-subject: ok (${findings.length} allowlisted, 0 new)`);
}

if (import.meta.main) {
	main();
}
