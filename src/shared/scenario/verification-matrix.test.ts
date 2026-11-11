/**
 * Verification-matrix seeder (Issue #147, round-2 gap 1).
 *
 * The matrix lives at
 * `docs/architecture/quality/scenario-verification-matrix.md` and
 * lists every `(requirement_id, scenario_id)` pair the QA / release
 * gate cares about.  The bindings file
 * (`src/shared/scenario/scenario-bindings.json`) declares the
 * matching `requirement_id` and `verification_rows[]` on each
 * scenario.
 *
 * This test parses the markdown matrix, walks the bindings, and
 * asserts three invariants:
 *
 *   1. Every matrix row references a `requirement_id` and
 *      `scenario_id` that appear in at least one binding entry.
 *   2. Every binding's `requirement_id` (when present) appears in at
 *      least one matrix row.
 *   3. Every binding's `verification_rows` entries each appear in at
 *      least one matrix row.
 *
 * If any of those invariants fails the seeder surfaces a clear error
 * that names the offending ids — the matrix is the only place that
 * guards against silent drift between the spec and the gate.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const MATRIX_PATH = join(
	REPO_ROOT,
	"docs/architecture/quality/scenario-verification-matrix.md",
);
const BINDINGS_PATH = join(
	REPO_ROOT,
	"src/shared/scenario/scenario-bindings.json",
);

interface MatrixRow {
	readonly requirement_id: string;
	readonly acceptance: string;
	readonly scenario_ids: readonly string[];
	readonly last_verified_run_id: string;
}

const parseMatrix = (markdown: string): readonly MatrixRow[] => {
	// The matrix is a markdown table.  Skip the header row and the
	// divider row; everything from the first `|` row after the
	// divider is a data row.
	const lines = markdown.split("\n");
	let dividerSeen = false;
	const dataLines: string[] = [];
	for (const line of lines) {
		if (!line.includes("|")) continue;
		if (!dividerSeen) {
			dividerSeen = true;
			continue;
		}
		// divider row is `|---|---|...|` — detect by trailing `---` tokens.
		if (/^\|\s*-+\s*\|/.test(line)) continue;
		dataLines.push(line);
	}
	const rows: MatrixRow[] = [];
	for (const line of dataLines) {
		// Split on `|` but keep empty cells — round-3 needs-fix 1 lets
		// `last_verified_run_id` be a literal empty string for
		// unverified rows; filtering empties would drop those rows.
		const rawCells = line.split("|").map((c) => c.trim());
		// Drop exactly ONE leading and ONE trailing empty cell — these
		// come from the `|` at each end of the row, not from the
		// data.  Inner empties (e.g. an empty last_verified_run_id)
		// are kept verbatim.
		if (rawCells[0] === "") rawCells.shift();
		if (rawCells.length > 0 && rawCells[rawCells.length - 1] === "") {
			rawCells.pop();
		}
		if (rawCells.length < 4) continue;
		const scenarioCell = rawCells[2];
		const scenarioIds = scenarioCell
			.split(",")
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		rows.push({
			requirement_id: rawCells[0],
			acceptance: rawCells[1],
			scenario_ids: scenarioIds,
			last_verified_run_id: rawCells[3] ?? "",
		});
	}
	return rows;
};

interface BindingEntry {
	readonly scenarioId: string;
	readonly requirement_id?: string;
	readonly verification_rows?: readonly string[];
}

describe("verification-matrix seeder (round-2 gap 1)", () => {
	it("matrix file exists at docs/architecture/quality/scenario-verification-matrix.md", () => {
		const markdown = readFileSync(MATRIX_PATH, "utf8");
		expect(markdown.length).toBeGreaterThan(0);
	});

	it("every matrix row references a requirement_id and scenario_id that appear in at least one binding", () => {
		const markdown = readFileSync(MATRIX_PATH, "utf8");
		const bindingsRaw = readFileSync(BINDINGS_PATH, "utf8");
		const bindings = JSON.parse(bindingsRaw) as {
			readonly bindings: readonly BindingEntry[];
		};
		const bindingRequirementIds = new Set<string>();
		const bindingScenarioIds = new Set<string>();
		for (const b of bindings.bindings) {
			if (b.requirement_id) bindingRequirementIds.add(b.requirement_id);
			bindingScenarioIds.add(b.scenarioId);
		}
		const rows = parseMatrix(markdown);
		expect(rows.length).toBeGreaterThan(0);

		const offenders: string[] = [];
		for (const row of rows) {
			if (!bindingRequirementIds.has(row.requirement_id)) {
				offenders.push(
					`row requirement_id "${row.requirement_id}" has no matching binding entry`,
				);
			}
			for (const scn of row.scenario_ids) {
				if (!bindingScenarioIds.has(scn)) {
					offenders.push(
						`row "${row.requirement_id}" references scenario_id "${scn}" with no matching binding`,
					);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	it("every binding's requirement_id appears in at least one matrix row", () => {
		const markdown = readFileSync(MATRIX_PATH, "utf8");
		const bindingsRaw = readFileSync(BINDINGS_PATH, "utf8");
		const bindings = JSON.parse(bindingsRaw) as {
			readonly bindings: readonly BindingEntry[];
		};
		const rows = parseMatrix(markdown);
		const matrixRequirementIds = new Set<string>();
		for (const row of rows) {
			matrixRequirementIds.add(row.requirement_id);
		}

		const offenders: string[] = [];
		for (const b of bindings.bindings) {
			if (!b.requirement_id) continue;
			if (!matrixRequirementIds.has(b.requirement_id)) {
				offenders.push(
					`binding "${b.scenarioId}" has requirement_id "${b.requirement_id}" but the matrix has no row for it`,
				);
			}
		}
		expect(offenders).toEqual([]);
	});

	it("every binding's verification_rows[] entries each appear in at least one matrix row", () => {
		const markdown = readFileSync(MATRIX_PATH, "utf8");
		const bindingsRaw = readFileSync(BINDINGS_PATH, "utf8");
		const bindings = JSON.parse(bindingsRaw) as {
			readonly bindings: readonly BindingEntry[];
		};
		const rows = parseMatrix(markdown);
		const matrixRequirementIds = new Set<string>();
		for (const row of rows) {
			matrixRequirementIds.add(row.requirement_id);
		}

		const offenders: string[] = [];
		for (const b of bindings.bindings) {
			const rows2 = b.verification_rows ?? [];
			for (const row of rows2) {
				if (!matrixRequirementIds.has(row)) {
					offenders.push(
						`binding "${b.scenarioId}" declares verification_rows "${row}" but the matrix has no matching row`,
					);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	it("matrix is non-empty and every scenario_id appears at least once across all rows", () => {
		const markdown = readFileSync(MATRIX_PATH, "utf8");
		const bindingsRaw = readFileSync(BINDINGS_PATH, "utf8");
		const bindings = JSON.parse(bindingsRaw) as {
			readonly bindings: readonly BindingEntry[];
		};
		const rows = parseMatrix(markdown);
		expect(rows.length).toBeGreaterThan(0);
		const referenced = new Set<string>();
		for (const row of rows) {
			for (const id of row.scenario_ids) referenced.add(id);
		}
		const orphans: string[] = [];
		for (const b of bindings.bindings) {
			if (!referenced.has(b.scenarioId)) {
				orphans.push(
					`binding scenario_id "${b.scenarioId}" is not referenced by any matrix row`,
				);
			}
		}
		expect(orphans).toEqual([]);
	});

	it("round-3 needs-fix 1: every last_verified_run_id is either empty or a canonical UUID v4 (no prose strings, no 36-hyphen stubs)", () => {
		// Round-4 needs-fix 1 — canonical UUID v4 per RFC 4122 §4.4.
		// The round-3 regex `/^[0-9a-f-]{36}$/i` was too permissive
		// (a string of 36 hyphens matched).  The round-4 pattern
		// fixes the version digit to `4` and the variant bits to
		// `[89ab]`, so only true UUID v4 ids pass.
		const markdown = readFileSync(MATRIX_PATH, "utf8");
		const rows = parseMatrix(markdown);
		const offenders: string[] = [];
		const UUID_RE =
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		for (const row of rows) {
			const value = row.last_verified_run_id;
			if (value.length === 0) continue;
			if (!UUID_RE.test(value)) {
				offenders.push(
					`row "${row.requirement_id}" carries non-empty last_verified_run_id "${value}" which is not a canonical UUID v4 (must match /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i). Use empty string for "not yet verified".`,
				);
			}
		}
		expect(offenders).toEqual([]);
	});

	it("round-4 needs-fix 1 (canonical UUID v4 unit checks) — strict pattern behaviour", () => {
		const UUID_RE =
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		// canonical UUID v4 — accepted
		expect(UUID_RE.test("0192f3a7-9c2e-4c0a-b4e1-1f8c0b1f3a2d")).toBe(true);
		// 36 hyphens — rejected (round-3 regex would have accepted this)
		expect(UUID_RE.test("------------------------------------")).toBe(false);
		// empty string — allowed at the call site (see validator + matrix
		// parser); the regex itself does not match an empty string.
		expect(UUID_RE.test("")).toBe(false);
		// non-UUID version string — rejected
		expect(UUID_RE.test("not-a-uuid-just-text-here-12345")).toBe(false);
		// wrong version digit (must be `4`) — rejected
		expect(UUID_RE.test("0192f3a7-9c2e-1c0a-b4e1-1f8c0b1f3a2d")).toBe(false);
		// wrong variant digit (must be `[89ab]`) — rejected
		expect(UUID_RE.test("0192f3a7-9c2e-4c0a-04e1-1f8c0b1f3a2d")).toBe(false);
	});
});
