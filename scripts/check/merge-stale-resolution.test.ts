import { describe, expect, it } from "vitest";
import {
	analyzeMergeStaleness,
	extractIdentifiers,
	isUiPath,
	type MergeFileSnapshot,
	staleMissingIdentifiers,
} from "./merge-stale-resolution";

/**
 * The detector is pure: tests describe file contents at the four points of
 * a merge (base / target / incoming / result) instead of building real git
 * fixtures. The canonical case reproduces the PR #430 rollback shape — a
 * long-lived branch whose stale copies win the merge over target-side
 * improvements.
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

describe("staleMissingIdentifiers", () => {
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
