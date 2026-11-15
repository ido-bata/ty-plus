#!/usr/bin/env bun
/**
 * E2E coverage drift detection (Issue #108 follow-up).
 *
 * Cross-checks two sources of truth:
 *
 * - `docs/verification/e2e-acceptance/use-case-matrix.md` — every UC-* row
 *   and its 自動化 column (`auto` / `semi` / `manual`).
 * - `scripts/verify/e2e/cases/*.ts` — every `uc: "UC-..."` a case claims.
 *
 * Exit status:
 * - non-zero when a case references a UC id that does not exist in the
 *   matrix (a real inconsistency — the case can never be tracked);
 * - zero otherwise, printing a coverage summary including auto/semi UCs
 *   that have no automated case yet (informational, not a failure).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");
const MATRIX_PATH = path.join(
	REPO_ROOT,
	"docs/verification/e2e-acceptance/use-case-matrix.md",
);
const CASES_DIR = path.join(REPO_ROOT, "scripts/verify/e2e/cases");

const UC_ROW = /^\|\s*(UC-[A-Z]\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/;
const UC_REF = /uc:\s*["'`](UC-[A-Z]\d+)["'`]/g;
const AUTOMATION = new Set(["auto", "semi", "manual"]);

type MatrixEntry = {
	id: string;
	automation: string;
};

const parseMatrix = (markdown: string): Map<string, MatrixEntry> => {
	const entries = new Map<string, MatrixEntry>();
	for (const line of markdown.split("\n")) {
		const match = line.match(UC_ROW);
		if (!match) continue;
		const id = match[1] as string;
		const automation = (match[4] ?? "").trim();
		// Journey rows (section J) have no 自動化 column; only rows whose
		// fourth cell is a known automation level count as matrix entries.
		if (!AUTOMATION.has(automation)) continue;
		entries.set(id, { id, automation });
	}
	return entries;
};

const scanCases = async (): Promise<Map<string, string[]>> => {
	const refs = new Map<string, string[]>();
	const files = (await readdir(CASES_DIR)).filter((f) => f.endsWith(".ts"));
	for (const file of files) {
		const text = await readFile(path.join(CASES_DIR, file), "utf8");
		for (const match of text.matchAll(UC_REF)) {
			const uc = match[1] as string;
			const list = refs.get(uc) ?? [];
			list.push(file);
			refs.set(uc, list);
		}
	}
	return refs;
};

const main = async (): Promise<void> => {
	const matrixText = await readFile(MATRIX_PATH, "utf8");
	const matrix = parseMatrix(matrixText);
	const caseRefs = await scanCases();

	const unknownRefs = [...caseRefs.entries()].filter(([uc]) => !matrix.has(uc));
	for (const [uc, files] of unknownRefs) {
		console.error(`UNKNOWN UC: ${uc} referenced by ${files.join(", ")}`);
	}
	if (unknownRefs.length > 0) {
		console.error(
			`\n${unknownRefs.length} case(s) reference UC ids missing from use-case-matrix.md`,
		);
		process.exit(1);
	}

	const automatable = [...matrix.values()].filter(
		(e) => e.automation === "auto" || e.automation === "semi",
	);
	const uncovered = automatable.filter((e) => !caseRefs.has(e.id));
	const covered = automatable.filter((e) => caseRefs.has(e.id));

	console.log(`matrix UCs (auto/semi/manual): ${matrix.size}`);
	console.log(
		`automatable (auto+semi): ${automatable.length} — covered: ${covered.length}, uncovered: ${uncovered.length}`,
	);
	if (uncovered.length > 0) {
		console.log("auto/semi UCs without a case:");
		for (const e of uncovered) {
			console.log(`  ${e.id} (${e.automation})`);
		}
	}
	console.log(`cases referencing known UCs: ${caseRefs.size}`);
};

await main();
