import { describe, expect, it } from "vitest";
import {
	analyzeMergeStaleness,
	analyzeSemanticStaleness,
	extractIdentifiers,
	isSemanticCandidate,
	isUiPath,
	type MergeFileSnapshot,
	SEMANTIC_MIN_MISSING,
	SEMANTIC_MISSING_RATIO,
	semanticLoss,
	staleMissingIdentifiers,
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
