#!/usr/bin/env bun
/**
 * merge-stale-resolution — detects merge results that silently discarded
 * work the target side had landed since the branches diverged.
 *
 * WHY THIS EXISTS
 *
 * PR #430 merged a long-lived branch into a release line and resolved its
 * conflicts by taking the incoming side wholesale. Files the release line
 * had improved since the branch diverged reverted to the branch's stale
 * copies — including documented UI exports — and every gate passed because
 * nothing compared the merge result against what the target side had added.
 * This script is the mechanical check for that pattern (Issue #597, parent
 * audit #591).
 *
 * THE HEURISTIC
 *
 * For a merge with first parent P1 (the target the merge lands on), second
 * parent P2 (the incoming side), and merge base B = merge-base(P1, P2):
 *
 *   1. Restrict to files BOTH sides changed since B
 *      (content at P1 differs from B AND content at P2 differs from B).
 *   2. Flag a file when the merge RESULT is byte-identical to P2's version
 *      — the resolution took the incoming side wholesale. A merge that
 *      merely happens to agree with P2 on a file P1 also rewrote is only
 *      suspicious when P1's version carried identifiers that are now gone.
 *   3. Within a flagged file, compute the identifiers P1 added relative to
 *      B (tokens present in P1's content but absent from B's) and report
 *      the ones missing from the merge result. If none survive, the target
 *      side's work on that file was discarded.
 *
 * Severity: findings on UI-relevant paths (`src/**` code and styles,
 * `packages/ui/**`, `panda.config.ts`, `panda.tokens.ts`) fail the check;
 * findings elsewhere are warnings. `--warn-only` downgrades everything to
 * warnings. The detector is intentionally conservative: it only fires when
 * the result is *identical* to the incoming blob, so hand-resolved merges
 * that kept any target-side edit are not flagged (they may still be wrong —
 * this is a tripwire for the wholesale-take pattern, not a correctness
 * proof).
 *
 * USAGE
 *
 *   bun scripts/check/merge-stale-resolution.ts
 *       Analyze HEAD when it is a merge commit; exits 0 with a note when
 *       HEAD is not a merge (regular commits and shallow clones).
 *
 *   bun scripts/check/merge-stale-resolution.ts --commit <rev>
 *       Analyze <rev> as a merge commit (requires <rev>^1 and <rev>^2).
 *
 *   bun scripts/check/merge-stale-resolution.ts --base <rev> --head <rev>
 *       Simulate merging <rev> (head) into <rev> (base) without creating a
 *       merge commit: P1 = base, P2 = head, result = head. This is the form
 *       useful for "would this PR drop target-side work" review; it assumes
 *       the eventual merge resolves to the head's content, which real
 *       merges may not — treat findings as review prompts.
 *
 *   Options: --warn-only (never fail), --max-files <n> (cap analysed files,
 *   default 200), --json (machine-readable findings on stdout).
 *
 * CI wiring: the `merge-stale` job in .github/workflows/ci.yml runs this on
 * every pull_request and push with fetch-depth: 0. On pull_request the
 * checked-out commit is the refs/pull/N/merge test merge, so the analysis
 * covers exactly what merging the PR would produce. On push it covers
 * merge commits landed on main and release-* branches.
 *
 * Exit codes:
 *   0 - no failing findings (warnings may be printed)
 *   1 - at least one failing (UI-path) finding, or a usage/git error
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

// ---------------------------------------------------------------------------
// Pure analysis (unit-tested without a real repository)
// ---------------------------------------------------------------------------

/** File contents at the four points of a merge; null = absent at that rev. */
export type MergeFileSnapshot = {
	/** Repo-relative path. */
	path: string;
	/** Content at the merge base B. */
	base: string | null;
	/** Content at the first parent P1 (merge target). */
	target: string | null;
	/** Content at the second parent P2 (incoming side). */
	incoming: string | null;
	/** Content in the merge result. */
	result: string | null;
};

export type FindingSeverity = "fail" | "warn";

export type StaleFinding = {
	path: string;
	/** Target-side identifiers absent from the merge result. */
	missing: string[];
	severity: FindingSeverity;
};

/**
 * Paths whose stale resolution is release-blocking: application source,
 * the shared UI package, and the Panda token/config inputs that feed it.
 * Mirrors the path set the `changes` job in ci.yml uses to trigger the
 * storybook tier.
 */
export function isUiPath(path: string): boolean {
	return (
		/^src\/.*\.(ts|tsx|css)$/.test(path) ||
		path.startsWith("packages/ui/") ||
		path === "panda.config.ts" ||
		path === "panda.tokens.ts"
	);
}

const IDENTIFIER_RE = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/**
 * Words that are syntax or prose, not identifiers. Kept deliberately small:
 * the check only needs tokens distinctive enough that their absence from
 * the merge result is meaningful.
 */
const STOP_TOKENS = new Set([
	"const",
	"let",
	"var",
	"function",
	"return",
	"import",
	"export",
	"from",
	"default",
	"class",
	"extends",
	"interface",
	"type",
	"enum",
	"async",
	"await",
	"new",
	"this",
	"true",
	"false",
	"null",
	"undefined",
	"void",
	"typeof",
	"instanceof",
	"public",
	"private",
	"protected",
	"readonly",
	"static",
	"get",
	"set",
	"if",
	"else",
	"for",
	"while",
	"do",
	"switch",
	"case",
	"break",
	"continue",
	"try",
	"catch",
	"finally",
	"throw",
	"throws",
	"implements",
	"declare",
	"abstract",
	"keyof",
	"infer",
	"never",
	"unknown",
	"object",
	"string",
	"number",
	"boolean",
	"symbol",
	"bigint",
	"any",
	"satisfies",
	"as",
	"is",
	"in",
	"of",
	"and",
	"or",
	"not",
	"the",
	"for",
	"with",
	"from",
	"that",
	"this",
	"into",
	"when",
	"then",
	"than",
	"each",
	"only",
	"also",
	"used",
	"uses",
	"via",
	"per",
	"see",
	"e.g",
	"i.e",
]);

/**
 * Extract identifier-like tokens from file content. Requires length >= 4
 * and either an uppercase/`_`/`$` character or length >= 6, which keeps
 * prose words and short keywords out while retaining camelCase names,
 * snake_case keys, i18n key fragments, and long lowercase identifiers.
 */
export function extractIdentifiers(content: string): Set<string> {
	const out = new Set<string>();
	for (const match of content.matchAll(IDENTIFIER_RE)) {
		const token = match[0];
		if (token.length < 4 || STOP_TOKENS.has(token)) continue;
		const hasSignal = /[A-Z_$]/.test(token);
		if (!hasSignal && token.length < 6) continue;
		out.add(token);
	}
	return out;
}

/**
 * Decide whether one file's merge resolution discarded target-side work.
 * Returns the missing identifiers, or null when the file is not a stale
 * wholesale-take.
 */
export function staleMissingIdentifiers(
	file: MergeFileSnapshot,
): string[] | null {
	// Both sides must have changed the file since the merge base.
	if (file.target === file.base || file.incoming === file.base) return null;
	// The merge result must be the incoming side's version, byte for byte.
	if (file.result !== file.incoming) return null;

	// Target deleted the file but the merge resurrected the incoming copy:
	// everything the target removed is back. Report a sentinel.
	if (file.target === null) {
		return file.incoming === null ? null : ["<target-side deletion>"];
	}
	if (file.result === null) {
		// Incoming deleted the file; target modified it. Result == incoming
		// means the deletion won — flag with a sentinel.
		return ["<incoming-side deletion>"];
	}

	const baseIds =
		file.base === null ? new Set<string>() : extractIdentifiers(file.base);
	const targetIds = extractIdentifiers(file.target);
	const resultIds = extractIdentifiers(file.result);

	const missing = [...targetIds]
		.filter((token) => !baseIds.has(token) && !resultIds.has(token))
		.sort();
	return missing.length > 0 ? missing : null;
}

export function analyzeMergeStaleness(
	files: MergeFileSnapshot[],
	opts: { warnOnly?: boolean } = {},
): StaleFinding[] {
	const findings: StaleFinding[] = [];
	for (const file of files) {
		const missing = staleMissingIdentifiers(file);
		if (missing === null) continue;
		const severity: FindingSeverity =
			isUiPath(file.path) && !opts.warnOnly ? "fail" : "warn";
		findings.push({ path: file.path, missing, severity });
	}
	return findings;
}

// ---------------------------------------------------------------------------
// Git layer
// ---------------------------------------------------------------------------

function git(args: string[], opts: { allowFail?: boolean } = {}): string {
	const result = spawnSync("git", args, {
		cwd: ROOT,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	if (result.error) throw result.error;
	if (result.status !== 0 && !opts.allowFail) {
		throw new Error(
			`git ${args.join(" ")} failed (${result.status}): ${result.stderr.trim()}`,
		);
	}
	return result.stdout ?? "";
}

/** Content of `path` at `rev`, or null when absent (or binary-looking). */
function showFile(rev: string, path: string): string | null {
	const result = spawnSync("git", ["show", `${rev}:${path}`], {
		cwd: ROOT,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	if (result.status !== 0) return null;
	const content = result.stdout ?? "";
	// Skip binary payloads; identifiers there are meaningless.
	if (content.includes("\u0000")) return null;
	return content;
}

/** Names changed between two revs (merge-base .. rev). */
function changedFiles(base: string, rev: string): Set<string> {
	const out = git(["diff", "--name-only", "-z", base, rev]);
	return new Set(out.split("\0").filter((p) => p.length > 0));
}

function mergeBase(p1: string, p2: string): string {
	return git(["merge-base", p1, p2]).trim();
}

type MergeSpec = {
	/** Label used in messages, e.g. the merge commit sha. */
	label: string;
	p1: string;
	p2: string;
	/** Rev whose tree is the merge result. Defaults to p1 for --base/--head
	 * simulation is NOT used; pass result explicitly. */
	result: string;
};

function collectSnapshots(
	spec: MergeSpec,
	maxFiles: number,
): MergeFileSnapshot[] {
	const base = mergeBase(spec.p1, spec.p2);
	const targetChanged = changedFiles(base, spec.p1);
	const incomingChanged = changedFiles(base, spec.p2);
	const both = [...targetChanged].filter((p) => incomingChanged.has(p));
	if (both.length > maxFiles) {
		console.error(
			`merge-stale-resolution: ${both.length} files changed on both sides; analysing the first ${maxFiles}`,
		);
	}
	return both.slice(0, maxFiles).map((path) => ({
		path,
		base: showFile(base, path),
		target: showFile(spec.p1, path),
		incoming: showFile(spec.p2, path),
		result: showFile(spec.result, path),
	}));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage(): never {
	console.error(`Usage:
  bun scripts/check/merge-stale-resolution.ts [--commit <rev>]
  bun scripts/check/merge-stale-resolution.ts --base <rev> --head <rev>
Options:
  --commit <rev>     analyse <rev> as a merge commit (default: HEAD)
  --base <rev>       first parent / merge target for simulated merges
  --head <rev>       second parent / incoming side for simulated merges
                     (result is taken as <rev> itself)
  --warn-only        report everything as warnings; never fail
  --max-files <n>    cap analysed both-side files (default 200)
  --json             print findings as JSON`);
	process.exit(2);
}

function parseArgs(argv: string[]) {
	const args = {
		commit: undefined as string | undefined,
		base: undefined as string | undefined,
		head: undefined as string | undefined,
		warnOnly: false,
		maxFiles: 200,
		json: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--warn-only") args.warnOnly = true;
		else if (a === "--json") args.json = true;
		else if (a === "--commit") args.commit = argv[++i];
		else if (a === "--base") args.base = argv[++i];
		else if (a === "--head") args.head = argv[++i];
		else if (a === "--max-files") args.maxFiles = Number(argv[++i]);
		else usage();
	}
	if (args.maxFiles <= 0 || !Number.isFinite(args.maxFiles)) usage();
	return args;
}

function resolveSpec(args: ReturnType<typeof parseArgs>): MergeSpec | null {
	if (args.base !== undefined || args.head !== undefined) {
		if (args.base === undefined || args.head === undefined || args.commit) {
			console.error(
				"merge-stale-resolution: --base and --head must be given together and not with --commit",
			);
			process.exit(2);
		}
		const base = git(["rev-parse", "--verify", args.base]).trim();
		const head = git(["rev-parse", "--verify", args.head]).trim();
		return { label: `${base} <- ${head}`, p1: base, p2: head, result: head };
	}
	const rev = args.commit ?? "HEAD";
	const resolved = git(["rev-parse", "--verify", `${rev}^{commit}`]).trim();
	const parents = git(["rev-list", "--parents", "-n", "1", resolved])
		.trim()
		.split(/\s+/)
		.slice(1);
	if (parents.length < 2) {
		console.log(
			`merge-stale-resolution: ${resolved.slice(0, 12)} is not a merge commit (parents: ${parents.length}); nothing to check`,
		);
		return null;
	}
	if (parents.length > 2) {
		console.log(
			`merge-stale-resolution: ${resolved.slice(0, 12)} is an octopus merge; checking first two parents only`,
		);
	}
	return {
		label: resolved,
		p1: parents[0] as string,
		p2: parents[1] as string,
		result: resolved,
	};
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const spec = resolveSpec(args);
	if (spec === null) return;

	const files = collectSnapshots(spec, args.maxFiles);
	const findings = analyzeMergeStaleness(files, { warnOnly: args.warnOnly });

	if (args.json) {
		console.log(JSON.stringify({ spec: spec.label, findings }, null, 2));
	} else {
		for (const f of findings) {
			const tag = f.severity === "fail" ? "STALE" : "warn ";
			console.log(
				`${tag} ${f.path}: merge result matches the incoming side; target-side identifiers missing: ${f.missing.slice(0, 12).join(", ")}${f.missing.length > 12 ? ", …" : ""}`,
			);
		}
		const fails = findings.filter((f) => f.severity === "fail");
		const warns = findings.length - fails.length;
		console.log(
			`merge-stale-resolution: ${files.length} both-side files checked, ${findings.length} findings (${fails.length} failing, ${warns} warnings) for ${spec.label.slice(0, 12)}`,
		);
	}

	const failed = findings.some((f) => f.severity === "fail");
	if (failed) process.exit(1);
}

if (import.meta.main) {
	try {
		main();
	} catch (error) {
		console.error(
			`merge-stale-resolution: ${error instanceof Error ? error.message : error}`,
		);
		process.exit(1);
	}
}
