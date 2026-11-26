#!/usr/bin/env bun
/**
 * merge-stale-resolution — detects merge results that silently discarded
 * work either side had landed since the branches diverged.
 *
 * WHY THIS EXISTS
 *
 * PR #430 merged a long-lived branch into a release line and resolved its
 * conflicts by taking the incoming side wholesale. Files the release line
 * had improved since the branch diverged reverted to the branch's stale
 * copies — including documented UI exports — and every gate passed because
 * nothing compared the merge result against what the target side had added.
 * This script is the mechanical check for that pattern (Issue #597, parent
 * audit #591), extended by Issue #608 after forensic verification showed
 * the original detector produced zero findings on the real damage merge
 * `bdd1168b` (a release→feature merge where the stale take equals the
 * FIRST parent, not the second), and by Issue #627 after the same audit
 * showed zero findings on `3a0593b3` — the merge that actually landed the
 * PR #430 rollback. There the FIRST parent was already an ancestor of the
 * second (the target tip had been merged into the incoming line earlier,
 * and THAT earlier merge took the stale blobs), so merge-base(P1, P2) ==
 * P1, diff(base→P1) is empty, and both checks saw nothing while the merge
 * result was byte-identical to the stale incoming tree.
 *
 * THE TWO CHECKS
 *
 * Both checks share the same inputs: for a merge with first parent P1 (the
 * target the merge lands on), second parent P2 (the incoming side), merge
 * base B = merge-base(P1, P2), and merge result R:
 *
 *   1. WHOLESALE TAKE (fail-level on UI paths, `kind: "wholesale"`)
 *      For files BOTH sides changed since B, flag when R is byte-identical
 *      to one parent's version — the resolution took that side wholesale
 *      and may have discarded the other side's work. This now runs in BOTH
 *      directions: R == P2 loses target-side (P1) work; R == P1 loses
 *      incoming-side (P2) work. Within a flagged file, the identifiers the
 *      losing side added relative to B (tokens present in that side's
 *      content but absent from B's) are reported when missing from R.
 *      Deletion edge cases report sentinels (`<target-side deletion>`,
 *      `<incoming-side deletion>`).
 *
 *   2. SEMANTIC LOSS (always warn-level, `kind: "semantic"`)
 *      For files changed on AT LEAST ONE side since B (text-like paths
 *      only, see isSemanticCandidate), compute the identifier set each side
 *      added relative to B and flag when more than half of a side's added
 *      identifiers are absent from R (and at least SEMANTIC_MIN_MISSING = 3
 *      are missing). This catches hand-resolved partial reverts — the
 *      dominant real-world shape, where 71 of 72 both-side files in the
 *      incident merge were mixed results no byte check can see — and both
 *      merge directions, including R == B (revert-to-base), where every
 *      added identifier is missing. Semantic findings NEVER fail the check,
 *      even on UI paths: the token heuristic can over- or under-report on
 *      hand-resolved merges, so they are review prompts, not gates.
 *
 * DEGENERATE MERGE-BASE (Issue #627)
 *
 *   When one parent is an ancestor of the other, merge-base(P1, P2) IS that
 *   parent, so "changed since base" is empty on the ancestor side and the
 *   checks above have no domain — yet the merge can still take the stale
 *   descendant-side tree wholesale (the descendant absorbed the ancestor
 *   tip earlier through a merge that itself took stale blobs). For this
 *   case the script substitutes the LINE base: it walks the descendant's
 *   first-parent chain to the first commit that does not contain the
 *   ancestor (the side parent below the merge that absorbed it) and takes
 *   merge-base(ancestor, that commit) — the last commit the two lines
 *   shared. Both checks then run against that base, and the wholesale
 *   check relaxes its "both sides changed" precondition: the taken side
 *   may equal the line base (a pure revert-to-base take is exactly the
 *   damage shape), so a file is flagged whenever the result is
 *   byte-identical to one parent and the OTHER side's identifiers added
 *   since the line base are absent from the result. Candidate files are
 *   pre-filtered by blob SHA (result == one parent's blob while the other
 *   parent's blob differs from both the taken blob and the base blob) so
 *   only genuinely suspicious files get content-fetched. Synced files —
 *   where the incoming blob already contains the target side's work —
 *   produce no missing identifiers and stay silent.
 *
 * DETECTION LIMITS (read before trusting a clean run)
 *
 *   - Identifier extraction is a token heuristic: identifiers surviving only
 *     inside comments or string literals still count as present, and a side
 *     whose added work is mostly prose or short lowercase words yields few
 *     or no tokens (under-detection).
 *   - The >50% / >=3-missing threshold means small losses (1-2 identifiers)
 *     and losses where most added identifiers coincidentally survive are
 *     not flagged (under-detection, deliberate to limit noise).
 *   - A hand-resolved merge that kept the identifiers but reverted the
 *     logic around them is invisible to both checks.
 *   - Semantic mode is capped by --max-semantic-files; truncated files are
 *     reported on stderr. Both-side files are analysed first.
 *   - Binary and non-text files are skipped by semantic mode; the wholesale
 *     check still applies to them via byte comparison.
 *
 * Severity: wholesale findings on UI-relevant paths (`src/**` code and
 * styles, `packages/ui/**`, `panda.config.ts`, `panda.tokens.ts`) fail the
 * check; findings elsewhere are warnings. `--warn-only` downgrades
 * everything to warnings. Semantic findings are always warnings.
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
 *   Options: --warn-only (never fail), --max-files <n> (cap analysed
 *   both-side files for the wholesale check, default 200),
 *   --max-semantic-files <n> (cap analysed union files for the semantic
 *   check, default 500), --json (machine-readable findings on stdout).
 *
 * CI wiring: the `merge-stale` job in .github/workflows/ci.yml runs this on
 * every pull_request and push with fetch-depth: 0. On pull_request the
 * checked-out commit is the refs/pull/N/merge test merge, so the analysis
 * covers exactly what merging the PR would produce. On push it covers
 * merge commits landed on main and release-* branches.
 *
 * Exit codes:
 *   0 - no failing findings (warnings may be printed)
 *   1 - at least one failing (UI-path wholesale) finding, or a usage/git error
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

/** Which merge parent a finding says lost work. */
export type MergeSide = "target" | "incoming";

/** Which detector produced a finding. */
export type FindingKind = "wholesale" | "semantic";

export type StaleFinding = {
	path: string;
	/** Identifiers added by the losing side(s) that are absent from the
	 * merge result (or a `<...-side deletion>` sentinel). */
	missing: string[];
	severity: FindingSeverity;
	kind: FindingKind;
	/** Side(s) whose added work is missing. Wholesale findings always name
	 * the losing parent; semantic findings may be "both". */
	side: MergeSide | "both";
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

// ---------------------------------------------------------------------------
// Wholesale-take check (byte-identical, fail-level on UI paths)
// ---------------------------------------------------------------------------

/** Result of the wholesale-take analysis for one file. */
export type WholesaleTake = {
	/** The parent whose added work may have been discarded. */
	lostSide: MergeSide;
	/** Losing-side identifiers absent from the result, or a sentinel. */
	missing: string[];
};

function contentOnSide(
	file: MergeFileSnapshot,
	side: MergeSide,
): string | null {
	return side === "target" ? file.target : file.incoming;
}

function baseIdentifiers(file: MergeFileSnapshot): Set<string> {
	return file.base === null ? new Set<string>() : extractIdentifiers(file.base);
}

/**
 * Decide whether one file's merge resolution took one parent wholesale.
 * Returns the losing side and its missing identifiers, or null when the
 * result is not byte-identical to a single parent's version (hand-resolved
 * merges are left to the semantic check) or when nothing was lost.
 *
 * Symmetric in both directions: result == P2 loses target-side work,
 * result == P1 loses incoming-side work.
 */
export function wholesaleTakeMissing(
	file: MergeFileSnapshot,
	opts: { relaxed?: boolean } = {},
): WholesaleTake | null {
	// Normally both sides must have changed the file since the merge base:
	// when only one side touched it, a result equal to that side's blob is
	// what a clean merge produces anyway. In degenerate ancestor-merge mode
	// (Issue #627) the base is the line fork point, not a direct ancestor of
	// both parents, and the taken side may legitimately equal the base — a
	// pure revert-to-base take is exactly the damage shape — so the
	// precondition relaxes to "at least one side changed". Precision is kept
	// by the missing-identifier requirement below: a taken blob that still
	// contains the losing side's added work yields an empty `missing`.
	const targetChanged = file.target !== file.base;
	const incomingChanged = file.incoming !== file.base;
	if (opts.relaxed) {
		if (!targetChanged && !incomingChanged) return null;
	} else if (!targetChanged || !incomingChanged) {
		return null;
	}

	// The merge result must be byte-identical to exactly one parent's
	// version. When all three agree there is nothing to lose.
	let lostSide: MergeSide;
	if (file.result === file.incoming && file.result !== file.target) {
		lostSide = "target";
	} else if (file.result === file.target && file.result !== file.incoming) {
		lostSide = "incoming";
	} else {
		return null;
	}
	const takenSide: MergeSide = lostSide === "target" ? "incoming" : "target";

	const lost = contentOnSide(file, lostSide);
	const taken = contentOnSide(file, takenSide);

	// The losing side deleted the file but the merge kept the taken side's
	// copy: the deletion was overridden.
	if (lost === null) {
		return { lostSide, missing: [`<${lostSide}-side deletion>`] };
	}
	// The taken side deleted the file and that deletion won over the losing
	// side's edits.
	if (taken === null) {
		return { lostSide, missing: [`<${takenSide}-side deletion>`] };
	}

	const baseIds = baseIdentifiers(file);
	const lostIds = extractIdentifiers(lost);
	const resultIds = extractIdentifiers(file.result ?? "");

	const missing = [...lostIds]
		.filter((token) => !baseIds.has(token) && !resultIds.has(token))
		.sort();
	return missing.length > 0 ? { lostSide, missing } : null;
}

/**
 * Backwards-compatible wrapper returning only the missing identifiers of
 * the wholesale-take check (null when the file is not a stale wholesale
 * take).
 */
export function staleMissingIdentifiers(
	file: MergeFileSnapshot,
): string[] | null {
	return wholesaleTakeMissing(file)?.missing ?? null;
}

export function analyzeMergeStaleness(
	files: MergeFileSnapshot[],
	opts: { warnOnly?: boolean; relaxed?: boolean } = {},
): StaleFinding[] {
	const findings: StaleFinding[] = [];
	for (const file of files) {
		const take = wholesaleTakeMissing(file, { relaxed: opts.relaxed });
		if (take === null) continue;
		const severity: FindingSeverity =
			isUiPath(file.path) && !opts.warnOnly ? "fail" : "warn";
		findings.push({
			path: file.path,
			missing: take.missing,
			severity,
			kind: "wholesale",
			side: take.lostSide,
		});
	}
	return findings;
}

// ---------------------------------------------------------------------------
// Semantic-loss check (identifier sets, always warn-level)
// ---------------------------------------------------------------------------

/** Minimum number of a side's added identifiers that must be absent from
 * the result before the semantic check fires. */
export const SEMANTIC_MIN_MISSING = 3;

/** Strict lower bound on the fraction of a side's added identifiers that
 * must be absent from the result (missing / added > this). */
export const SEMANTIC_MISSING_RATIO = 0.5;

/**
 * Path filter for the semantic check: identifier extraction is only
 * meaningful on text-like source, docs, and config files. Lockfiles,
 * snapshots, and minified bundles are excluded — they are huge, change on
 * both sides constantly, and their "identifiers" are noise.
 */
const SEMANTIC_TEXT_RE =
	/\.(?:ts|tsx|js|jsx|mjs|cjs|css|scss|sass|less|json|jsonc|md|mdx|rs|py|toml|yaml|yml|html|vue|svelte)$/i;
const SEMANTIC_SKIP_RE =
	/(?:^|\/)(?:bun\.lock|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock)$|\.snap$|\.min\.(?:js|css)$/;

export function isSemanticCandidate(path: string): boolean {
	return SEMANTIC_TEXT_RE.test(path) && !SEMANTIC_SKIP_RE.test(path);
}

/** Identifiers `side` added relative to the merge base; empty when the
 * side did not change the file or deleted it. */
function sideAddedIdentifiers(
	file: MergeFileSnapshot,
	side: MergeSide,
): Set<string> {
	const content = contentOnSide(file, side);
	if (content === null || content === file.base) return new Set<string>();
	const baseIds = baseIdentifiers(file);
	const added = new Set<string>();
	for (const token of extractIdentifiers(content)) {
		if (!baseIds.has(token)) added.add(token);
	}
	return added;
}

/**
 * Semantic staleness for one file: for each side, the identifiers it added
 * since the merge base that are absent from the merge result. A side is
 * "mostly reverted" when more than SEMANTIC_MISSING_RATIO of its added
 * identifiers are missing AND at least SEMANTIC_MIN_MISSING are missing.
 * Returns the losing side(s) and the union of missing identifiers, or null.
 */
export function semanticLoss(
	file: MergeFileSnapshot,
	opts: { relaxed?: boolean } = {},
): { sides: (MergeSide | "both")[]; missing: string[] } | null {
	// Wholesale takes are reported (and possibly failed) by the other check;
	// skip them here so one file never produces two findings. The relaxed
	// flag must match the wholesale check's mode or degenerate-mode takes
	// would be reported twice.
	if (wholesaleTakeMissing(file, { relaxed: opts.relaxed }) !== null) {
		return null;
	}

	const resultIds =
		file.result === null ? new Set<string>() : extractIdentifiers(file.result);
	const flagged: MergeSide[] = [];
	const missing = new Set<string>();

	for (const side of ["target", "incoming"] as const) {
		const added = sideAddedIdentifiers(file, side);
		if (added.size === 0) continue;
		const sideMissing = [...added].filter((t) => !resultIds.has(t));
		if (
			sideMissing.length >= SEMANTIC_MIN_MISSING &&
			sideMissing.length / added.size > SEMANTIC_MISSING_RATIO
		) {
			flagged.push(side);
			for (const t of sideMissing) missing.add(t);
		}
	}

	if (flagged.length === 0) return null;
	const sides: (MergeSide | "both")[] =
		flagged.length === 2 ? ["both"] : flagged;
	return { sides, missing: [...missing].sort() };
}

/**
 * Semantic check over files changed on at least one side since the merge
 * base. Every finding is a warning — even on UI paths — because the token
 * heuristic cannot prove a hand-resolved merge is wrong.
 */
export function analyzeSemanticStaleness(
	files: MergeFileSnapshot[],
	opts: { relaxed?: boolean } = {},
): StaleFinding[] {
	const findings: StaleFinding[] = [];
	for (const file of files) {
		const loss = semanticLoss(file, { relaxed: opts.relaxed });
		if (loss === null) continue;
		for (const side of loss.sides) {
			findings.push({
				path: file.path,
				missing: loss.missing,
				severity: "warn",
				kind: "semantic",
				side,
			});
		}
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

/**
 * First commit on `descendant`'s first-parent chain that does NOT have
 * `ancestor` as an ancestor — i.e. the side parent just below the merge
 * that absorbed `ancestor`'s line. Containment is monotonic along the
 * chain (a deeper commit containing `ancestor` would make every shallower
 * commit contain it too), so the first non-containing commit marks the
 * boundary. Returns null when the whole chain contains `ancestor`.
 */
function firstParentOutsideAncestor(
	descendant: string,
	ancestor: string,
): string | null {
	const chain = git(["rev-list", "--first-parent", descendant])
		.split("\n")
		.filter((line) => line.length > 0);
	for (const commit of chain) {
		const contains =
			spawnSync("git", ["merge-base", "--is-ancestor", ancestor, commit], {
				cwd: ROOT,
			}).status === 0;
		if (!contains) return commit;
	}
	return null;
}

type EffectiveBase = {
	/** Rev whose tree is the analysis base (merge-base or line base). */
	base: string;
	/** True when one parent is an ancestor of the other and the base had
	 * to be replaced by the two lines' fork point (Issue #627). */
	degenerate: boolean;
};

/**
 * The analysis base for a merge. Normally merge-base(P1, P2). When one
 * parent is an ancestor of the other that base IS the ancestor, leaving
 * the ancestor side with an empty changed-set — the blind spot behind
 * Issue #627. In that case substitute the LINE base: the fork point of
 * the descendant's own line and the ancestor's line, found via the first
 * first-parent commit that does not contain the ancestor. Falls back to
 * the plain merge-base when the topology cannot be resolved.
 */
function effectiveMergeBase(p1: string, p2: string): EffectiveBase {
	const base = mergeBase(p1, p2);
	if (base !== p1 && base !== p2) return { base, degenerate: false };
	const ancestor = base === p1 ? p1 : p2;
	const descendant = base === p1 ? p2 : p1;
	const frontier = firstParentOutsideAncestor(descendant, ancestor);
	if (frontier === null) return { base, degenerate: false };
	const lineBase = mergeBase(ancestor, frontier);
	if (lineBase === ancestor) return { base, degenerate: false };
	return { base: lineBase, degenerate: true };
}

/** Blob SHA per path at a rev; absent paths are simply missing keys. */
function blobMap(rev: string): Map<string, string> {
	const map = new Map<string, string>();
	for (const line of git(["ls-tree", "-r", rev]).split("\n")) {
		if (line.length === 0) continue;
		const tab = line.indexOf("\t");
		if (tab < 0) continue;
		const sha = line.slice(0, tab).split(" ")[2];
		if (sha !== undefined) map.set(line.slice(tab + 1), sha);
	}
	return map;
}

/**
 * Degenerate-mode wholesale candidates (Issue #627): paths where the
 * result is byte-identical to one parent's blob while the OTHER parent's
 * blob differs both from the taken blob and from the line-base blob —
 * i.e. the losing side changed the file since the lines diverged and its
 * version was overwritten by a stale take. Blob SHAs make this filter
 * cheap; content is only fetched for survivors. Sorted for determinism.
 */
function degenerateWholesalePaths(
	spec: MergeSpec,
	base: string,
	maxFiles: number,
): { paths: string[]; total: number } {
	const targetBlobs = blobMap(spec.p1);
	const incomingBlobs = blobMap(spec.p2);
	const resultBlobs = blobMap(spec.result);
	const baseBlobs = blobMap(base);
	const get = (map: Map<string, string>, path: string) => map.get(path) ?? null;

	const candidates: string[] = [];
	const allPaths = new Set([
		...targetBlobs.keys(),
		...incomingBlobs.keys(),
		...resultBlobs.keys(),
	]);
	for (const path of allPaths) {
		const r = get(resultBlobs, path);
		const t = get(targetBlobs, path);
		const i = get(incomingBlobs, path);
		const b = get(baseBlobs, path);
		const incomingTake = r === i && t !== i && t !== b;
		const targetTake = r === t && i !== t && i !== b;
		if (incomingTake || targetTake) candidates.push(path);
	}
	candidates.sort();
	return { paths: candidates.slice(0, maxFiles), total: candidates.length };
}

type MergeSpec = {
	/** Label used in messages, e.g. the merge commit sha. */
	label: string;
	p1: string;
	p2: string;
	/** Rev whose tree is the merge result. */
	result: string;
};

type CollectedSnapshots = {
	files: MergeFileSnapshot[];
	/** Paths fed to the wholesale check: both-side files normally, blob-SHA
	 * candidates in degenerate ancestor-merge mode. */
	wholesalePaths: Set<string>;
	/** Paths fed to the semantic check (union, text-like, capped). */
	semanticPaths: Set<string>;
	/** True when the analysis ran against the line base because one merge
	 * parent is an ancestor of the other (Issue #627). */
	degenerate: boolean;
};

function collectSnapshots(
	spec: MergeSpec,
	maxFiles: number,
	maxSemanticFiles: number,
): CollectedSnapshots {
	const effective = effectiveMergeBase(spec.p1, spec.p2);
	const base = effective.base;
	const targetChanged = changedFiles(base, spec.p1);
	const incomingChanged = changedFiles(base, spec.p2);
	const both = [...targetChanged].filter((p) => incomingChanged.has(p));

	// Wholesale domain. Normal merges: files BOTH sides changed since the
	// merge base. Degenerate ancestor merges (Issue #627): the merge-base
	// is one parent itself, so that set is empty; instead take every path
	// whose result blob equals one parent's blob while the other parent's
	// blob differs from both — pre-filtered by SHA so only suspicious
	// files get content-fetched.
	let wholesaleOrdered: string[];
	if (effective.degenerate) {
		const candidates = degenerateWholesalePaths(spec, base, maxFiles);
		if (candidates.total > maxFiles) {
			console.error(
				`merge-stale-resolution: ${candidates.total} stale-take candidates in degenerate ancestor merge; analysing the first ${maxFiles}`,
			);
		}
		wholesaleOrdered = candidates.paths;
	} else {
		if (both.length > maxFiles) {
			console.error(
				`merge-stale-resolution: ${both.length} files changed on both sides; analysing the first ${maxFiles} for the wholesale check`,
			);
		}
		wholesaleOrdered = both.slice(0, maxFiles);
	}
	const bothSet = new Set(both);

	// Semantic domain: files changed on at least one side, restricted to
	// text-like paths. Both-side files are ordered first because conflict
	// resolutions concentrate there; the cap then keeps the most suspicious
	// files when a merge touches thousands.
	const union = new Set([...targetChanged, ...incomingChanged]);
	const oneSide = [...union].filter((p) => !bothSet.has(p)).sort();
	const semanticOrdered = [...both].sort().concat(oneSide);
	const semanticPaths = new Set(
		semanticOrdered.filter(isSemanticCandidate).slice(0, maxSemanticFiles),
	);
	const semanticTotal = semanticOrdered.filter(isSemanticCandidate).length;
	if (semanticTotal > maxSemanticFiles) {
		console.error(
			`merge-stale-resolution: ${semanticTotal} text files changed on at least one side; analysing the first ${maxSemanticFiles} for the semantic check`,
		);
	}

	// Fetch snapshots for the union of both domains: all wholesale-domain
	// files (wholesale needs every type, including non-text) plus the
	// capped semantic set. wholesaleOrdered may overlap semanticPaths;
	// dedupe below.
	const wholesaleSet = new Set(wholesaleOrdered);
	const ordered = [
		...wholesaleOrdered,
		...[...semanticPaths].filter((p) => !wholesaleSet.has(p)),
	];
	const seen = new Set<string>();
	const files = ordered
		.filter((p) => {
			if (seen.has(p)) return false;
			seen.add(p);
			return true;
		})
		.map((path) => ({
			path,
			base: showFile(base, path),
			target: showFile(spec.p1, path),
			incoming: showFile(spec.p2, path),
			result: showFile(spec.result, path),
		}));

	return {
		files,
		wholesalePaths: wholesaleSet,
		semanticPaths,
		degenerate: effective.degenerate,
	};
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage(): never {
	console.error(`Usage:
  bun scripts/check/merge-stale-resolution.ts [--commit <rev>]
  bun scripts/check/merge-stale-resolution.ts --base <rev> --head <rev>
Options:
  --commit <rev>          analyse <rev> as a merge commit (default: HEAD)
  --base <rev>            first parent / merge target for simulated merges
  --head <rev>            second parent / incoming side for simulated merges
                          (result is taken as <rev> itself)
  --warn-only             report everything as warnings; never fail
  --max-files <n>         cap analysed both-side files, wholesale check
                          (default 200)
  --max-semantic-files <n> cap analysed union files, semantic check
                          (default 500)
  --json                  print findings as JSON`);
	process.exit(2);
}

function parseArgs(argv: string[]) {
	const args = {
		commit: undefined as string | undefined,
		base: undefined as string | undefined,
		head: undefined as string | undefined,
		warnOnly: false,
		maxFiles: 200,
		maxSemanticFiles: 500,
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
		else if (a === "--max-semantic-files")
			args.maxSemanticFiles = Number(argv[++i]);
		else usage();
	}
	if (
		args.maxFiles <= 0 ||
		!Number.isFinite(args.maxFiles) ||
		args.maxSemanticFiles <= 0 ||
		!Number.isFinite(args.maxSemanticFiles)
	) {
		usage();
	}
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

function describeFinding(f: StaleFinding): string {
	const shown = f.missing.slice(0, 12).join(", ");
	const rest = f.missing.length > 12 ? ", …" : "";
	if (f.kind === "wholesale") {
		const dir =
			f.side === "target"
				? "took the incoming side wholesale"
				: "took the target side wholesale";
		return `${f.path}: merge result ${dir}; ${f.side}-side identifiers missing: ${shown}${rest}`;
	}
	return `${f.path}: semantic check — ${f.side}-side identifiers added since base are mostly absent from the merge result: ${shown}${rest}`;
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const spec = resolveSpec(args);
	if (spec === null) return;

	const collected = collectSnapshots(
		spec,
		args.maxFiles,
		args.maxSemanticFiles,
	);
	const wholesaleFiles = collected.files.filter((f) =>
		collected.wholesalePaths.has(f.path),
	);
	const semanticFiles = collected.files.filter((f) =>
		collected.semanticPaths.has(f.path),
	);

	const findings = [
		...analyzeMergeStaleness(wholesaleFiles, {
			warnOnly: args.warnOnly,
			relaxed: collected.degenerate,
		}),
		// Semantic findings are always warnings; warnOnly is irrelevant but
		// accepted for a uniform call shape. `relaxed` must match the
		// wholesale mode so degenerate takes are not reported twice.
		...analyzeSemanticStaleness(semanticFiles, {
			relaxed: collected.degenerate,
		}),
	];

	if (args.json) {
		console.log(JSON.stringify({ spec: spec.label, findings }, null, 2));
	} else {
		for (const f of findings) {
			const tag = f.severity === "fail" ? "STALE" : "warn ";
			console.log(`${tag} ${describeFinding(f)}`);
		}
		const fails = findings.filter((f) => f.severity === "fail");
		const warns = findings.length - fails.length;
		const mode = collected.degenerate
			? " (degenerate ancestor merge: line base)"
			: "";
		console.log(
			`merge-stale-resolution: ${collected.wholesalePaths.size} wholesale-domain files + ${collected.semanticPaths.size} union files checked, ${findings.length} findings (${fails.length} failing, ${warns} warnings) for ${spec.label.slice(0, 12)}${mode}`,
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
