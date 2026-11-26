import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	analyzeMergeStaleness,
	analyzeSemanticStaleness,
	applyIntentAllowlist,
	createGitIntentResolver,
	extractIdentifiers,
	INTENT_ALLOWLIST_REPO_PATH,
	type IntentAllowlistEntry,
	type IntentEvidenceResolver,
	isSemanticCandidate,
	isUiPath,
	type MergeFileSnapshot,
	parseIntentAllowlist,
	SEMANTIC_MIN_MISSING,
	SEMANTIC_MISSING_RATIO,
	type StaleFinding,
	semanticLoss,
	staleMissingIdentifiers,
	validateIntentAllowlist,
	wholesaleTakeMissing,
} from "./merge-stale-resolution";

/**
 * The detectors are pure: tests describe file contents at the four points
 * of a merge (base / target / incoming / result) instead of building real
 * git fixtures. The canonical case reproduces the PR #430 rollback shape —
 * a long-lived branch whose stale copies win the merge over target-side
 * improvements — and the Issue #608 cases cover the reverse direction,
 * hand-resolved partial reverts, and revert-to-base.
 */

const BASE_TS = `export function FileEntryList() {
	return "ancient";
}
`;

const TARGET_TS = `export function FileEntryList() {
	return "new";
}

export function FileEntryActions() {
	return "actions";
}

export const FILE_ENTRY_I18N_KEY = "storage.fileEntry.actions";
`;

/** The stale branch copy: predates the target-side additions. */
const STALE_INCOMING_TS = `export function FileEntryList() {
	return "old";
}
`;

function snap(partial: Partial<MergeFileSnapshot>): MergeFileSnapshot {
	return {
		path: "src/management/storage/ui/file-entry/FileEntryList.tsx",
		base: null,
		target: null,
		incoming: null,
		result: null,
		...partial,
	};
}

describe("extractIdentifiers", () => {
	it("keeps identifier-like tokens and drops keywords and prose", () => {
		const ids = extractIdentifiers(
			`export function FileEntryList() { return "old"; } // the quick fox`,
		);
		expect(ids.has("FileEntryList")).toBe(true);
		expect(ids.has("function")).toBe(false);
		expect(ids.has("return")).toBe(false);
		expect(ids.has("export")).toBe(false);
		// Short lowercase prose words are not identifiers.
		expect(ids.has("quick")).toBe(false);
		expect(ids.has("fox")).toBe(false);
	});
});

describe("isUiPath", () => {
	it("covers src code, packages/ui, and panda inputs", () => {
		expect(isUiPath("src/management/storage/ui/file-entry/X.tsx")).toBe(true);
		expect(isUiPath("src/shared/util.ts")).toBe(true);
		expect(isUiPath("packages/ui/src/Icon.tsx")).toBe(true);
		expect(isUiPath("panda.config.ts")).toBe(true);
		expect(isUiPath("panda.tokens.ts")).toBe(true);
		expect(isUiPath("scripts/check/foo.ts")).toBe(false);
		expect(isUiPath("rust/crates/foo/src/lib.rs")).toBe(false);
		expect(isUiPath("docs/guide.md")).toBe(false);
	});
});

describe("isSemanticCandidate", () => {
	it("accepts text-like sources and rejects lockfiles/binary-ish paths", () => {
		expect(isSemanticCandidate("src/app.ts")).toBe(true);
		expect(isSemanticCandidate("docs/guide.md")).toBe(true);
		expect(isSemanticCandidate("rust/crates/x/src/lib.rs")).toBe(true);
		expect(isSemanticCandidate("bun.lock")).toBe(false);
		expect(isSemanticCandidate("package-lock.json")).toBe(false);
		expect(isSemanticCandidate("Cargo.lock")).toBe(false);
		expect(isSemanticCandidate("src/app.test.ts.snap")).toBe(false);
		expect(isSemanticCandidate("dist/bundle.min.js")).toBe(false);
		expect(isSemanticCandidate("assets/logo.png")).toBe(false);
		expect(isSemanticCandidate("Makefile")).toBe(false);
	});
});

describe("staleMissingIdentifiers / wholesaleTakeMissing", () => {
	it("flags the PR #430 pattern: result took the incoming side wholesale", () => {
		const missing = staleMissingIdentifiers(
			snap({
				base: BASE_TS,
				target: TARGET_TS,
				incoming: STALE_INCOMING_TS,
				result: STALE_INCOMING_TS,
			}),
		);
		expect(missing).not.toBeNull();
		// Identifiers the target added since the base must be reported.
		expect(missing).toContain("FileEntryActions");
		expect(missing).toContain("FILE_ENTRY_I18N_KEY");
		// `FileEntryList` existed at the base, so it is not "added" work.
		expect(missing).not.toContain("FileEntryList");
		// Identifiers only present in the stale incoming copy are not
		// target-side work and must not be reported.
		expect(missing).not.toContain("ancient");
	});

	it("names the losing side for the incoming-take direction", () => {
		const take = wholesaleTakeMissing(
			snap({
				base: BASE_TS,
				target: TARGET_TS,
				incoming: STALE_INCOMING_TS,
				result: STALE_INCOMING_TS,
			}),
		);
		expect(take?.lostSide).toBe("target");
	});

	it("flags the reverse direction: result took the target side wholesale (Issue #608)", () => {
		// bdd1168b shape: a release→feature merge where the stale take equals
		// P1. The incoming side's additions are what got discarded.
		const incoming = `export function FileEntryList() {
	return "release";
}

export function ReleaseOnlyFeature() {
	return "r";
}

export const RELEASE_ONLY_I18N = "release.only.key";
`;
		const take = wholesaleTakeMissing(
			snap({
				base: BASE_TS,
				target: TARGET_TS,
				incoming,
				result: TARGET_TS, // merge kept the target side byte-for-byte
			}),
		);
		expect(take).not.toBeNull();
		expect(take?.lostSide).toBe("incoming");
		expect(take?.missing).toContain("ReleaseOnlyFeature");
		expect(take?.missing).toContain("RELEASE_ONLY_I18N");
		expect(take?.missing).not.toContain("FileEntryActions");
	});

	it("does not flag a merge that preserved the target-side identifiers", () => {
		const merged = `${TARGET_TS}\n// resolved\n`;
		expect(
			staleMissingIdentifiers(
				snap({
					base: BASE_TS,
					target: TARGET_TS,
					incoming: STALE_INCOMING_TS,
					result: merged,
				}),
			),
		).toBeNull();
	});

	it("does not flag files only one side changed", () => {
		// Incoming identical to base: nothing to take wholesale.
		expect(
			staleMissingIdentifiers(
				snap({
					base: BASE_TS,
					target: TARGET_TS,
					incoming: BASE_TS,
					result: BASE_TS,
				}),
			),
		).toBeNull();
		// Target identical to base: no target work to lose.
		expect(
			staleMissingIdentifiers(
				snap({
					base: BASE_TS,
					target: BASE_TS,
					incoming: STALE_INCOMING_TS,
					result: STALE_INCOMING_TS,
				}),
			),
		).toBeNull();
	});

	it("does not flag a clean take when the incoming side kept the target work", () => {
		// Incoming rebased onto the target's additions: result == incoming
		// but nothing target-side is missing.
		expect(
			staleMissingIdentifiers(
				snap({
					base: BASE_TS,
					target: TARGET_TS,
					incoming: `${TARGET_TS}\n// incoming tweak\n`,
					result: `${TARGET_TS}\n// incoming tweak\n`,
				}),
			),
		).toBeNull();
	});

	it("does not flag when both parents agree and the result matches them", () => {
		expect(
			staleMissingIdentifiers(
				snap({
					base: BASE_TS,
					target: TARGET_TS,
					incoming: TARGET_TS, // identical change on both sides
					result: TARGET_TS,
				}),
			),
		).toBeNull();
	});

	it("flags a target-side deletion resurrected by the incoming copy", () => {
		const missing = staleMissingIdentifiers(
			snap({
				base: BASE_TS,
				target: null, // target deleted the file
				incoming: STALE_INCOMING_TS,
				result: STALE_INCOMING_TS, // merge kept the stale copy
			}),
		);
		expect(missing).toEqual(["<target-side deletion>"]);
	});

	it("flags an incoming-side deletion that dropped target edits", () => {
		const missing = staleMissingIdentifiers(
			snap({
				base: BASE_TS,
				target: TARGET_TS,
				incoming: null, // incoming deleted the file
				result: null, // merge deleted it too
			}),
		);
		expect(missing).toEqual(["<incoming-side deletion>"]);
	});

	it("flags the Issue #627 shape in relaxed mode: taken side equals the line base", () => {
		// Degenerate ancestor merge: the base is the two lines' fork point,
		// not a direct ancestor of both parents. The incoming side never
		// touched the file (incoming == base) yet the merge result kept that
		// stale base content over the target side's work — a pure
		// revert-to-base take. Strict mode ignores it (only one side
		// "changed"); relaxed mode must flag it.
		const file = snap({
			base: BASE_TS,
			target: TARGET_TS,
			incoming: BASE_TS, // incoming side unchanged since the fork
			result: BASE_TS, // merge kept the stale base copy
		});
		expect(wholesaleTakeMissing(file)).toBeNull();
		const take = wholesaleTakeMissing(file, { relaxed: true });
		expect(take?.lostSide).toBe("target");
		expect(take?.missing).toContain("FileEntryActions");
		expect(take?.missing).toContain("FILE_ENTRY_I18N_KEY");
	});

	it("stays silent in relaxed mode when the taken blob kept the losing work", () => {
		// Incoming side synced the file: its blob contains the target-side
		// additions plus its own change. Result == incoming loses nothing.
		const synced = `${TARGET_TS}
// incoming-side addition on top of the synced file
`;
		const file = snap({
			base: BASE_TS,
			target: TARGET_TS,
			incoming: synced,
			result: synced,
		});
		expect(wholesaleTakeMissing(file, { relaxed: true })).toBeNull();
	});

	it("relaxed mode still requires the result to equal exactly one parent", () => {
		const merged = `${TARGET_TS}\n// hand-resolved mix\n`;
		const file = snap({
			base: BASE_TS,
			target: TARGET_TS,
			incoming: BASE_TS,
			result: merged,
		});
		expect(wholesaleTakeMissing(file, { relaxed: true })).toBeNull();
	});

	it("flags the symmetric deletion: target deletion won over incoming edits", () => {
		const take = wholesaleTakeMissing(
			snap({
				base: BASE_TS,
				target: null, // target deleted the file
				incoming: `${STALE_INCOMING_TS}\n// incoming work\n`,
				result: null, // merge deleted it too
			}),
		);
		expect(take?.lostSide).toBe("incoming");
		expect(take?.missing).toEqual(["<target-side deletion>"]);
	});
});

describe("semanticLoss", () => {
	// Four identifiers each side adds relative to BASE_TS; a hand-resolved
	// result that keeps only the incoming side's work must flag the target.
	const TARGET_WORK = `${BASE_TS}
export function TargetAlphaHelper() { return "a"; }
export function TargetBetaConfig() { return "b"; }
export const TARGET_GAMMA_KEY = "t.gamma";
export function TargetDeltaUtil() { return "d"; }
`;
	const INCOMING_WORK = `${BASE_TS}
export function IncomingAlphaHelper() { return "a"; }
export function IncomingBetaConfig() { return "b"; }
export const INCOMING_GAMMA_KEY = "i.gamma";
export function IncomingDeltaUtil() { return "d"; }
`;

	it("flags a hand-resolved partial revert of the target side", () => {
		// Mixed result: keeps base + incoming work, drops all target work.
		const result = `${BASE_TS}
export function IncomingAlphaHelper() { return "a"; }
export function IncomingBetaConfig() { return "b"; }
export const INCOMING_GAMMA_KEY = "i.gamma";
export function IncomingDeltaUtil() { return "d"; }
// hand resolution note
`;
		const loss = semanticLoss(
			snap({
				base: BASE_TS,
				target: TARGET_WORK,
				incoming: INCOMING_WORK,
				result,
			}),
		);
		expect(loss).not.toBeNull();
		expect(loss?.sides).toEqual(["target"]);
		expect(loss?.missing).toContain("TargetAlphaHelper");
		expect(loss?.missing).toContain("TargetDeltaUtil");
		expect(loss?.missing).not.toContain("IncomingAlphaHelper");
	});

	it("flags the reverse direction: incoming-side work mostly absent", () => {
		// Result == target content plus a comment: incoming's four added
		// identifiers are all gone (this is also a wholesale take when
		// byte-identical; use a mixed result to isolate the semantic path).
		const result = `${TARGET_WORK}
// resolved keeping target work only
`;
		const loss = semanticLoss(
			snap({
				base: BASE_TS,
				target: TARGET_WORK,
				incoming: INCOMING_WORK,
				result,
			}),
		);
		expect(loss?.sides).toEqual(["incoming"]);
		expect(loss?.missing).toContain("INCOMING_GAMMA_KEY");
	});

	it("flags revert-to-base: result identical to the merge base", () => {
		const loss = semanticLoss(
			snap({
				base: BASE_TS,
				target: TARGET_WORK,
				incoming: INCOMING_WORK,
				result: BASE_TS,
			}),
		);
		expect(loss?.sides).toEqual(["both"]);
		expect(loss?.missing).toContain("TargetAlphaHelper");
		expect(loss?.missing).toContain("IncomingAlphaHelper");
	});

	it("does not flag when most added identifiers survive", () => {
		// Target added 4 identifiers; result keeps 3 of them (25% missing
		// is below the ratio AND below count interplay — only 1 missing).
		const result = `${BASE_TS}
export function TargetAlphaHelper() { return "a"; }
export function TargetBetaConfig() { return "b"; }
export const TARGET_GAMMA_KEY = "t.gamma";
export function IncomingAlphaHelper() { return "a"; }
`;
		const loss = semanticLoss(
			snap({
				base: BASE_TS,
				target: TARGET_WORK,
				incoming: INCOMING_WORK,
				result,
			}),
		);
		// Incoming added 4, result has 1 of them → 3 missing of 4 = 75% > 50%
		// and >= 3 → incoming IS flagged. Target: 1 missing of 4 → not.
		expect(loss?.sides).toEqual(["incoming"]);
		expect(loss?.missing).not.toContain("TargetDeltaUtil");
	});

	it("does not flag small losses below the minimum-missing threshold", () => {
		// Only 3 identifiers added; 2 missing = 66% > 50% but < 3 missing.
		const smallTarget = `${BASE_TS}
export function TinyOneHelper() { return "1"; }
export function TinyTwoConfig() { return "2"; }
export const TINY_THREE_KEY = "t.3";
`;
		const result = `${BASE_TS}
export function TinyOneHelper() { return "1"; }
export function IncomingAlphaHelper() { return "a"; }
export function IncomingBetaConfig() { return "b"; }
export const INCOMING_GAMMA_KEY = "i.gamma";\n`;
		const loss = semanticLoss(
			snap({
				base: BASE_TS,
				target: smallTarget,
				incoming: INCOMING_WORK,
				result,
			}),
		);
		// Target: 2 missing < SEMANTIC_MIN_MISSING → not flagged.
		// Incoming: added 4, result has 3 → 1 missing → not flagged.
		expect(loss).toBeNull();
		expect(SEMANTIC_MIN_MISSING).toBe(3);
		expect(SEMANTIC_MISSING_RATIO).toBe(0.5);
	});

	it("skips files the wholesale check already reports", () => {
		const loss = semanticLoss(
			snap({
				base: BASE_TS,
				target: TARGET_WORK,
				incoming: INCOMING_WORK,
				result: INCOMING_WORK, // byte-identical take of incoming
			}),
		);
		expect(loss).toBeNull();
		expect(
			wholesaleTakeMissing(
				snap({
					base: BASE_TS,
					target: TARGET_WORK,
					incoming: INCOMING_WORK,
					result: INCOMING_WORK,
				}),
			),
		).not.toBeNull();
	});

	it("skips relaxed-mode wholesale takes so files are not reported twice", () => {
		// Same Issue #627 shape fed to the semantic check: the wholesale
		// check (relaxed) owns this file, so semanticLoss must return null.
		const file = snap({
			base: BASE_TS,
			target: TARGET_WORK,
			incoming: BASE_TS,
			result: BASE_TS,
		});
		expect(semanticLoss(file)).not.toBeNull(); // strict: not a wholesale take
		expect(semanticLoss(file, { relaxed: true })).toBeNull();
	});

	it("does not flag files where neither side added identifiers", () => {
		const loss = semanticLoss(
			snap({
				base: BASE_TS,
				target: `${BASE_TS}\n// target comment only\n`,
				incoming: `${BASE_TS}\n// incoming comment only\n`,
				result: `${BASE_TS}\n// merged comment\n`,
			}),
		);
		expect(loss).toBeNull();
	});
});

describe("analyzeMergeStaleness", () => {
	it("fails on UI paths and warns elsewhere by default", () => {
		const ui = snap({
			path: "src/management/storage/ui/file-entry/FileEntryList.tsx",
			base: BASE_TS,
			target: TARGET_TS,
			incoming: STALE_INCOMING_TS,
			result: STALE_INCOMING_TS,
		});
		const docs = snap({
			path: "docs/guide.md",
			base: "old docs",
			target: "new docs with UniqueIdentifierWord",
			incoming: "stale docs",
			result: "stale docs",
		});
		const findings = analyzeMergeStaleness([ui, docs]);
		expect(findings).toHaveLength(2);
		expect(findings.find((f) => f.path === ui.path)?.severity).toBe("fail");
		expect(findings.find((f) => f.path === docs.path)?.severity).toBe("warn");
		expect(findings.find((f) => f.path === ui.path)?.kind).toBe("wholesale");
		expect(findings.find((f) => f.path === ui.path)?.side).toBe("target");
	});

	it("fails on UI paths for the reverse (target-take) direction too", () => {
		const findings = analyzeMergeStaleness([
			snap({
				base: BASE_TS,
				target: TARGET_TS,
				incoming: `${BASE_TS}\nexport function IncomingOnlyWork() { return "i"; }\nexport const INCOMING_ONLY_KEY = "i.k";\nexport function IncomingThirdUtil() { return "3"; }\n`,
				result: TARGET_TS,
			}),
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.severity).toBe("fail");
		expect(findings[0]?.side).toBe("incoming");
		expect(findings[0]?.missing).toContain("IncomingOnlyWork");
	});

	it("--warn-only downgrades UI findings to warnings", () => {
		const ui = snap({
			base: BASE_TS,
			target: TARGET_TS,
			incoming: STALE_INCOMING_TS,
			result: STALE_INCOMING_TS,
		});
		const findings = analyzeMergeStaleness([ui], { warnOnly: true });
		expect(findings[0]?.severity).toBe("warn");
	});
});

describe("analyzeSemanticStaleness", () => {
	const TARGET_WORK = `${BASE_TS}
export function SemanticAlpha() { return "a"; }
export function SemanticBeta() { return "b"; }
export const SEMANTIC_GAMMA = "g";
export function SemanticDelta() { return "d"; }
`;
	const INCOMING_WORK = `${BASE_TS}
export function OtherAlpha() { return "a"; }
export function OtherBeta() { return "b"; }
export const OTHER_GAMMA = "g";
export function OtherDelta() { return "d"; }
`;

	it("always warns, even on UI paths", () => {
		const result = `${BASE_TS}
export function OtherAlpha() { return "a"; }
export function OtherBeta() { return "b"; }
export const OTHER_GAMMA = "g";
export function OtherDelta() { return "d"; }
// hand-resolved: kept incoming work, dropped target work
`;
		const findings = analyzeSemanticStaleness([
			snap({
				base: BASE_TS,
				target: TARGET_WORK,
				incoming: INCOMING_WORK,
				result,
			}),
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.severity).toBe("warn");
		expect(findings[0]?.kind).toBe("semantic");
		expect(findings[0]?.side).toBe("target");
	});

	it("returns nothing for clean merges", () => {
		const good = `${TARGET_WORK}
${INCOMING_WORK.split("\n").slice(1).join("\n")}
`;
		const findings = analyzeSemanticStaleness([
			snap({
				base: BASE_TS,
				target: TARGET_WORK,
				incoming: INCOMING_WORK,
				result: good,
			}),
		]);
		expect(findings).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Issue #664 — intent evidence allowlist
// ---------------------------------------------------------------------------

const TEST_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function revExists(rev: string): boolean {
	return (
		spawnSync("git", ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], {
			cwd: TEST_ROOT,
		}).status === 0
	);
}

// Merge 7503087b = PR #605 (release-0-13-1 -> main). Its second parent is
// the release tip the ticket PRs landed on; findings' taken side is P2.
const PR605_P1 = "3a34010cdf155161f13c89f8d71cd9a5afdd0f8f";
const PR605_P2 = "0f4960110bc1d0eb415d0f1e503ae4036993356d";
// Merge 3a0593b3 = PR #430, the real rollback incident (Issue #597/#627).
const PR430_P1 = "22a49858779aaaa1d96467d0a19830b94cf5b799";
const PR430_P2 = "9f91b93e66510f4ca9e0d3765d854cb5dbc79c79";

const GIT_HISTORY =
	revExists(PR605_P2) && revExists(PR430_P1) && revExists(PR430_P2);

function wholesale(path: string, severity: "fail" | "warn"): StaleFinding {
	return { path, missing: [], severity, kind: "wholesale", side: "target" };
}

// The 21 fail-level findings reported on PR #605 (see the review record in
// the PR comments): dead-code deletions, story rewrites, identifier moves,
// and test mock updates — all intentional, all reviewed per ticket PR.
const PR605_FAIL_PATHS = [
	"packages/ui/src/feedback/ErrorBoundary.stories.tsx",
	"packages/ui/src/feedback/FileDropZone.stories.tsx",
	"packages/ui/src/feedback/FileDropZone.tsx",
	"packages/ui/src/index.ts",
	"src/function/widget/utility/info/preset.stories.tsx",
	"src/function/widget/utility/quick-actions/QuickActionsWidget.stories.tsx",
	"src/management/ae/cep/dialogs/WorkspaceShell.stories.tsx",
	"src/management/ae/cep/dialogs/WorkspaceShell.tsx",
	"src/management/ae/cep/entry/dialog-bootstrap.tsx",
	"src/management/ae/cep/entry/dialogs.tsx",
	"src/management/dialog/Root.tsx",
	"src/management/dialog/bridge.ts",
	"src/management/dialog/ids.ts",
	"src/management/dialog/probe/session.ts",
	"src/management/dialog/unified-context-menu-constants.ts",
	"src/management/dialog/unified-context-menu.ts",
	"src/management/online/catalog/Dialog.stories.tsx",
	"src/management/online/notification/Center.stories.tsx",
	"src/management/online/notification/Container.stories.tsx",
	"src/management/preset/catalog-browser/list-dialog.render-contract.test.tsx",
	"src/management/workspace/hook.ts",
];

// The warn-level findings from the same merge: story-only-code and the
// i18n locale keys dropped together with the deleted dialog-probe UI.
const PR605_WARN_PATHS = [
	"scripts/check/story-only-code.ts",
	...["de", "en", "es", "fr", "it", "ja", "ko", "pt", "ru", "zh"].flatMap(
		(locale) => [
			`src/management/i18n/locales/${locale}/contextMenu.json`,
			`src/management/i18n/locales/${locale}/dialogs.json`,
			`src/management/i18n/locales/${locale}/workspace.json`,
		],
	),
];

const PR605_FINDINGS: StaleFinding[] = [
	...PR605_FAIL_PATHS.map((p) => wholesale(p, "fail")),
	...PR605_WARN_PATHS.map((p) => wholesale(p, "warn")),
];

// The 8 fail findings the detector reports on the real rollback merge
// 3a0593b3 (PR #430). None may ever be excused by the allowlist.
const PR430_FINDINGS: StaleFinding[] = [
	"src/function/widget/core/loop/applied-state.ts",
	"src/function/widget/core/loop/cyclic-wave.ts",
	"src/function/widget/core/loop/wave-camera.ts",
	"src/function/widget/registry.ts",
	"src/management/ae/host/loop-replication.ts",
	"src/management/online/notification/service.ts",
	"src/management/widget/registry/index.ts",
	"src/storybook/quality/layout.ts",
].map((p) => wholesale(p, "fail"));

function loadShippedAllowlist(): IntentAllowlistEntry[] {
	return parseIntentAllowlist(
		readFileSync(join(TEST_ROOT, INTENT_ALLOWLIST_REPO_PATH), "utf8"),
	);
}

describe("parseIntentAllowlist", () => {
	const SHA = "a".repeat(40);
	const valid = JSON.stringify({
		entries: [
			{
				commit: SHA,
				pr: 100,
				issue: 50,
				reason: "reviewed change",
				paths: ["src/x.ts"],
			},
		],
	});

	it("accepts a well-formed registry", () => {
		const entries = parseIntentAllowlist(valid);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.commit).toBe(SHA);
	});

	it("rejects glob widening and non-exact paths", () => {
		for (const bad of ["src/**", "src/", "../x.ts", "/abs.ts"]) {
			expect(() =>
				parseIntentAllowlist(
					JSON.stringify({
						entries: [
							{
								commit: SHA,
								pr: 1,
								reason: "r",
								paths: [bad],
							},
						],
					}),
				),
			).toThrow(/paths/);
		}
	});

	it("requires at least one PR/Issue evidence ref and a full SHA", () => {
		expect(() =>
			parseIntentAllowlist(
				JSON.stringify({
					entries: [{ commit: SHA, reason: "r", paths: ["src/x.ts"] }],
				}),
			),
		).toThrow(/pr\/issue/);
		expect(() =>
			parseIntentAllowlist(
				JSON.stringify({
					entries: [
						{
							commit: "abc123",
							pr: 1,
							reason: "r",
							paths: ["src/x.ts"],
						},
					],
				}),
			),
		).toThrow(/SHA/);
	});
});

describe("validateIntentAllowlist", () => {
	const SHA = "a".repeat(40);
	const entry: IntentAllowlistEntry = {
		commit: SHA,
		pr: 638,
		issue: 609,
		reason: "reviewed",
		paths: ["src/x.ts"],
	};
	const resolver = (
		message: string | null,
		exists = true,
	): IntentEvidenceResolver => ({
		commitExists: () => exists,
		commitMessage: () => message ?? "",
		attributeCommit: () => null,
	});

	it("passes when the commit message references the PR and Issue", () => {
		expect(
			validateIntentAllowlist(
				[entry],
				resolver("Merge pull request #638 from ido-bata/609"),
			),
		).toEqual([]);
	});

	it("fails closed on missing commits and missing references", () => {
		expect(
			validateIntentAllowlist([entry], resolver(null, false)),
		).toHaveLength(1);
		expect(
			validateIntentAllowlist([entry], resolver("unrelated commit message")),
		).toHaveLength(2);
	});
});

describe("applyIntentAllowlist", () => {
	const SHA_A = "a".repeat(40);
	const SHA_B = "b".repeat(40);
	const entry: IntentAllowlistEntry = {
		commit: SHA_A,
		pr: 638,
		issue: 609,
		reason: "reviewed",
		paths: ["src/x.ts"],
	};
	const spec = { p1: "P1", p2: "P2" };
	const attrs = (
		map: Record<string, string | null>,
	): IntentEvidenceResolver => ({
		commitExists: () => true,
		commitMessage: () => "",
		attributeCommit: (rev, path) => map[`${rev}:${path}`] ?? null,
	});
	const finding = (side: StaleFinding["side"]): StaleFinding => ({
		path: "src/x.ts",
		missing: [],
		severity: "fail",
		kind: "wholesale",
		side,
	});

	it("excuses a finding when the taken side's last-touch commit matches", () => {
		const { findings } = applyIntentAllowlist(
			[finding("target")],
			[entry],
			spec,
			attrs({ "P2:src/x.ts": SHA_A }),
		);
		expect(findings[0]?.intent).toEqual([
			{ commit: SHA_A, pr: 638, issue: 609 },
		]);
	});

	it("does not excuse on a different attributed commit (future rollback)", () => {
		const { findings } = applyIntentAllowlist(
			[finding("target")],
			[entry],
			spec,
			attrs({ "P2:src/x.ts": SHA_B }),
		);
		expect(findings[0]?.intent).toBeUndefined();
	});

	it("does not excuse when the path has no attributed commit", () => {
		const { findings } = applyIntentAllowlist(
			[finding("target")],
			[entry],
			spec,
			attrs({}),
		);
		expect(findings[0]?.intent).toBeUndefined();
	});

	it("attributes incoming-side losses to P1, not P2", () => {
		const { findings } = applyIntentAllowlist(
			[finding("incoming")],
			[entry],
			spec,
			attrs({ "P1:src/x.ts": SHA_A, "P2:src/x.ts": SHA_B }),
		);
		expect(findings[0]?.intent?.[0]?.commit).toBe(SHA_A);
	});

	it("requires evidence on BOTH parents for side=both findings", () => {
		const partial = applyIntentAllowlist(
			[finding("both")],
			[entry],
			spec,
			attrs({ "P2:src/x.ts": SHA_A }),
		);
		expect(partial.findings[0]?.intent).toBeUndefined();
		const full = applyIntentAllowlist(
			[finding("both")],
			[entry],
			spec,
			attrs({ "P1:src/x.ts": SHA_A, "P2:src/x.ts": SHA_A }),
		);
		expect(full.findings[0]?.intent).toHaveLength(1);
	});

	it("reports entries that matched no finding as unmatched", () => {
		const other: IntentAllowlistEntry = {
			...entry,
			commit: SHA_B,
			paths: ["src/other.ts"],
		};
		const { unmatchedEntries } = applyIntentAllowlist(
			[finding("target")],
			[entry, other],
			spec,
			attrs({ "P2:src/x.ts": SHA_A }),
		);
		expect(unmatchedEntries).toEqual([other]);
	});
});

describe.skipIf(!GIT_HISTORY)(
	"intent allowlist — real-history fixtures (Issue #664)",
	() => {
		const entries = loadShippedAllowlist();
		const resolver = createGitIntentResolver();

		it("every shipped entry's evidence verifies against the repository", () => {
			expect(validateIntentAllowlist(entries, resolver)).toEqual([]);
			expect(entries.length).toBeGreaterThan(0);
		});

		// Each finding costs one `git log -- path` attribution; the real
		// history fixture needs well over the default 5s test timeout.
		it("all 52 PR #605 findings classify as intentional", () => {
			expect(PR605_FINDINGS).toHaveLength(52);
			expect(PR605_FINDINGS.filter((f) => f.severity === "fail")).toHaveLength(
				21,
			);
			const { findings, unmatchedEntries } = applyIntentAllowlist(
				PR605_FINDINGS,
				entries,
				{ p1: PR605_P1, p2: PR605_P2 },
				resolver,
			);
			expect(findings.every((f) => f.intent !== undefined)).toBe(true);
			expect(unmatchedEntries).toEqual([]);
			const commits = new Set(
				findings.flatMap((f) => f.intent?.map((e) => e.commit) ?? []),
			);
			expect(commits).toEqual(
				new Set([
					"fd05ab0bbe632b5247e4fea5ce2f0352d76123e7",
					"faa2982dc161146a0cde3f0d5784215eaeefe2ee",
					"ecc13eefeec68750fa369e66514dbd1428d95545",
					"a524d0ee9d8a827d98285f4cba324f9f05a6650e",
				]),
			);
		}, 120_000);

		it("the PR #430 rollback findings are never excused", () => {
			expect(PR430_FINDINGS).toHaveLength(8);
			const { findings } = applyIntentAllowlist(
				PR430_FINDINGS,
				entries,
				{ p1: PR430_P1, p2: PR430_P2 },
				resolver,
			);
			expect(findings.every((f) => f.intent === undefined)).toBe(true);
		});
	},
);
