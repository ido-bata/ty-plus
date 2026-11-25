#!/usr/bin/env bun
/**
 * assert-worker-env.ts
 *
 * Mechanical guard for the worker isolation contract (worktree-workflow
 * Skill): an implementation worker must run inside its own dedicated git
 * worktree, never in the shared main checkout. Running mutating commands
 * (edits, installs, builds, commits) against the main checkout lets
 * concurrent workers fight over HEAD, index, and uncommitted state — the
 * failure mode that corrupted the release-0-13-1 integration session.
 *
 * Checks, in order:
 *   1. cwd resolves to a linked git worktree (git-dir != git-common-dir).
 *      The main checkout fails this check.
 *   2. `.worktree.env` exists (i.e. `mise run worktree:setup` ran), so
 *      per-worktree ports/toolchain env are materialized.
 *   3. HEAD is on a ticket branch — not `main` and not `release-*`.
 *      Pass `--read-only` for audit/review workers that legitimately
 *      inspect the release branch without mutating it.
 *
 * Exit codes:
 *   0 - worker environment is isolated and provisioned
 *   1 - violation; remediation hints are printed to stderr
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const readOnly = process.argv.includes("--read-only");

function git(args: string[]): string {
	return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function fail(message: string, hint: string): never {
	console.error(`worker-env: FAIL — ${message}`);
	console.error(`worker-env: ${hint}`);
	process.exit(1);
}

let toplevel: string;
try {
	toplevel = git(["rev-parse", "--show-toplevel"]);
} catch {
	fail(
		"not inside a git repository",
		"cd into the worktree assigned to this worker before running commands",
	);
}

const abs = (p: string) => (isAbsolute(p) ? p : resolve(process.cwd(), p));
const gitDir = abs(git(["rev-parse", "--git-dir"]));
const commonDir = abs(git(["rev-parse", "--git-common-dir"]));
if (gitDir === commonDir) {
	fail(
		`main checkout (${toplevel}) is not an isolated worker environment`,
		"create a dedicated worktree: `wt switch --create <issue> --base=release-x-y-z` (or `git worktree add ../ty-plus-<issue> -b <issue> <base>`), then `mise run worktree:setup` inside it, and re-run this check from that directory",
	);
}

const envPath = join(toplevel, ".worktree.env");
if (!existsSync(envPath)) {
	fail(
		".worktree.env is missing — worktree was not provisioned",
		"run `mise run worktree:setup` inside this worktree, then re-run this check",
	);
}

const branch = git(["branch", "--show-current"]);
if (!readOnly && (branch === "main" || branch.startsWith("release-"))) {
	fail(
		`branch '${branch}' is a shared integration branch`,
		"implementation workers must use a ticket branch; pass --read-only only for non-mutating audit work",
	);
}
if (!branch) {
	fail("detached HEAD", "check out the worker's ticket branch first");
}

const env = Object.fromEntries(
	readFileSync(envPath, "utf8")
		.split("\n")
		.filter((l) => l.includes("=") && !l.startsWith("#"))
		.map((l) => {
			const i = l.indexOf("=");
			return [l.slice(0, i), l.slice(i + 1)];
		}),
);

console.log(`worker-env: OK`);
console.log(`  worktree: ${toplevel}`);
console.log(`  branch:   ${branch}`);
console.log(`  key:      ${env.WORKTREE_KEY ?? "?"}`);
console.log(`  ports:    base=${env.PORT ?? "?"}`);
