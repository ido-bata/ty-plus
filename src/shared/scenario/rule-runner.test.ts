/**
 * Scenario spec rule-check runner (Issue #147, 5-blocker rework).
 *
 * This suite is the structural gate: it walks every scenario spec loaded
 * by the loader and asserts that the spec schema conforms to the user's
 * prescribed 4-layer contract plus the Computer-Use execution contract.
 * It does NOT execute scenario actions — executing the actions of a
 * scenario (via real AE or Computer Use) is the role of future
 * `real_ae_e2e` runners and is OUT OF SCOPE for this PR.
 *
 * Each `it()` name aligns with a rule code (E001 … E012) so the human-CI
 * feedback names the failing rule.  When ANY rule fails, the runner
 * dumps every error at the end of the suite so reviewers see the full
 * set without re-running.
 *
 * Invoked by:
 *
 *   - bun run test (this file is auto-discovered by vitest's
 *     include glob: src/**.test.ts).
 *   - bun run test:scenario-spec (standalone invocation via
 *     vitest.scenario-spec.config.ts).
 */

import { validRange } from "semver";
import { describe, expect, it } from "vitest";

import { allScenarioSpecs as specs } from "./specs";
import type { ScenarioSpec } from "./types";
import {
	ALLOWED_EVIDENCE_LEVELS,
	FORBIDDEN_ORACLE_WORDS,
	IMPORTANT_TITLE_KEYWORDS,
	validateScenarioSpecCollection,
} from "./validator";

const FORBIDDEN_WORD_PATTERNS: readonly RegExp[] = FORBIDDEN_ORACLE_WORDS.map(
	(word) => new RegExp(`\\b${word.replace(/[\s]+/g, "\\s+")}\\b`, "i"),
);

const hasForbiddenWord = (text: string): string | null => {
	for (let i = 0; i < FORBIDDEN_ORACLE_WORDS.length; i += 1) {
		const word = FORBIDDEN_ORACLE_WORDS[i];
		const pattern = FORBIDDEN_WORD_PATTERNS[i];
		if (pattern.test(text)) return word;
	}
	return null;
};

const PROSE_FIELD_NAMES = new Set([
	"text",
	"preconditions",
	"postconditions",
	"textContent",
	"messageContains",
	"persistedStateDumps",
	"screenshotSelectors",
	"computedStyleSnapshots",
	"description",
	"notes",
]);

const walkForbiddenWords = (value: unknown): string | null => {
	if (value == null) return null;
	if (typeof value === "string") return hasForbiddenWord(value);
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = walkForbiddenWords(item);
			if (found !== null) return found;
		}
		return null;
	}
	if (typeof value === "object") {
		for (const [k, v] of Object.entries(value)) {
			if (!PROSE_FIELD_NAMES.has(k)) continue;
			const found = walkForbiddenWords(v);
			if (found !== null) return found;
		}
	}
	return null;
};

describe("scenario-spec rule runner", () => {
	it("E001 — scenario IDs are unique across the suite", () => {
		const ids = new Set<string>();
		for (const spec of specs) {
			if (ids.has(spec.id)) {
				throw new Error(`duplicate scenario id: ${spec.id}`);
			}
			ids.add(spec.id);
		}
		expect(ids.size).toBe(specs.length);
	});

	it("E003 — every mutation step has a checkpoint step immediately after it", () => {
		for (const spec of specs) {
			for (let i = 0; i < spec.procedure.length; i += 1) {
				const step = spec.procedure[i];
				if (!step.mutation) continue;
				const next = spec.procedure[i + 1];
				expect(next).toBeDefined();
				expect(next?.checkpoint).toBe(true);
			}
		}
	});

	it("E004 — every mutation step (not just destructive) has cleanup or noCleanupReason", () => {
		for (const spec of specs) {
			const hasCleanup = (spec.cleanup?.length ?? 0) > 0;
			for (const step of spec.procedure) {
				if (!step.mutation) continue;
				if (hasCleanup) continue;
				const reason = step.noCleanupReason;
				const ok = typeof reason === "string" && reason.trim().length > 0;
				expect(ok).toBe(true);
			}
		}
	});

	it("E005 — forbidden oracle wording is absent (case-insensitive)", () => {
		for (const spec of specs) {
			const offender = walkForbiddenWords(spec);
			expect(offender).toBeNull();
		}
	});

	it("E006 — important scenarios declare dual oracles (oracles.dual + ui + persistence, OR important title keyword)", () => {
		for (const spec of specs) {
			const loweredTitle = spec.title.toLowerCase();
			const titleSaysImportant = IMPORTANT_TITLE_KEYWORDS.some((kw) =>
				loweredTitle.includes(kw),
			);
			if (spec.oracles.dual || titleSaysImportant) {
				expect(spec.oracles.ui).toBeDefined();
				expect(spec.oracles.persistence).toBeDefined();
			}
		}
	});

	it("E007 — declared evidence level is one of the allowed set", () => {
		for (const spec of specs) {
			const allowed: readonly string[] = ALLOWED_EVIDENCE_LEVELS;
			expect(allowed.includes(spec.evidenceLevel)).toBe(true);
		}
	});

	it("E008 — every scenario has an evidence section with at least one declaration", () => {
		for (const spec of specs) {
			expect(spec.evidence).toBeDefined();
			const total =
				spec.evidence.screenshotSelectors.length +
				spec.evidence.computedStyleSnapshots.length +
				spec.evidence.persistedStateDumps.length +
				spec.evidence.logAssertions.length;
			expect(total > 0).toBe(true);
		}
	});

	it("E009 — every scenario declares environment (os / hostVersionRange / panelState)", () => {
		for (const spec of specs) {
			expect(spec.environment).toBeDefined();
			expect(typeof spec.environment.os).toBe("string");
			expect(["macos", "windows", "linux"]).toContain(spec.environment.os);
			expect(typeof spec.environment.hostVersionRange).toBe("string");
			expect(spec.environment.hostVersionRange.length).toBeGreaterThan(0);
			expect(typeof spec.environment.panelState).toBe("string");
			expect(spec.environment.panelState.length).toBeGreaterThan(0);
		}
	});

	it("E019 — every hostVersionRange parses as a semver range (round-5 Blocker C; round-6 needs-fix 1 delegates to semver.validRange)", () => {
		for (const spec of specs) {
			const range = spec.environment.hostVersionRange;
			// Round-6 needs-fix 1 — the validator no longer uses the
			// hand-rolled regex; it delegates to Node's semver package.
			// This rule-check runner mirrors that delegation so both
			// views agree on what counts as a valid range.
			expect(validRange(range, { loose: true })).not.toBeNull();
		}
	});

	it("round-7 needs-fix: every hostVersionRange uses a bounded range (AE 2026 = '>=26.5.0 <27.0.0')", () => {
		// Round-7 needs-fix — AE 2026 validation must use a bounded
		// range so the runner rejects AE 27+ hosts that would falsely
		// match the unbounded `">=26.5.0"`.  The un-bounded form is
		// a regression the curator must fix; the rule-check runner
		// fails CI when it sees one.  Scenarios that intentionally
		// target a different AE version must use a different range
		// (e.g. `">=27.0.0 <28.0.0"` for AE 2027) — they just must
		// not be unbounded.
		for (const spec of specs) {
			const range = spec.environment.hostVersionRange;
			// An unbounded lower bound like `>=26.5.0` is fine only
			// when paired with an explicit upper bound.  We assert
			// that the range either (a) contains a `<` comparator
			// that names an upper bound, OR (b) uses a caret / tilde
			// / exact-pin shape that is implicitly bounded.
			const hasExplicitUpper = /<\s*\d+\.\d+\.\d+/.test(range);
			const hasImplicitBound = /^\s*[~^]\s*\d+\.\d+\.\d+\s*$/.test(range);
			const isExactPin = /^\s*\d+\.\d+\.\d+\s*$/.test(range);
			const isBounded = hasExplicitUpper || hasImplicitBound || isExactPin;
			expect(isBounded).toBe(true);
		}
	});

	it("E010 — every scenario declares at least one stop condition", () => {
		for (const spec of specs) {
			expect(Array.isArray(spec.stopConditions)).toBe(true);
			expect(spec.stopConditions.length).toBeGreaterThan(0);
		}
	});

	it("E011 — every scenario declares required automation capabilities and onFailure policy", () => {
		for (const spec of specs) {
			expect(spec.automation).toBeDefined();
			expect(Array.isArray(spec.automation.requiredCapabilities)).toBe(true);
			expect(spec.automation.requiredCapabilities.length).toBeGreaterThan(0);
			expect(spec.onFailure).toBeDefined();
			expect(Array.isArray(spec.onFailure.capture)).toBe(true);
			expect(Array.isArray(spec.onFailure.doNot)).toBe(true);
		}
	});

	it("E012 — every Procedure step's gherkinRef resolves to a real Gherkin step (no orphans)", () => {
		const isConjunction = (kind: string): boolean =>
			kind === "And" || kind === "But";
		for (const spec of specs) {
			const referenced = new Set<number>();
			for (const step of spec.procedure) {
				const ref = step.gherkinRef;
				if (!ref) continue;
				expect(ref.scenarioId).toBe(spec.gherkin.scenarioId);
				expect(ref.stepIndex).toBeGreaterThanOrEqual(0);
				expect(ref.stepIndex).toBeLessThan(spec.gherkin.steps.length);
				referenced.add(ref.stepIndex);
				// Conjunction continuation: And/But steps after a ref are
				// covered by the same Procedure step.
				for (let j = ref.stepIndex + 1; j < spec.gherkin.steps.length; j += 1) {
					if (!isConjunction(spec.gherkin.steps[j].kind)) break;
					referenced.add(j);
				}
			}
			for (let i = 0; i < spec.gherkin.steps.length; i += 1) {
				if (isConjunction(spec.gherkin.steps[i].kind)) continue;
				expect(referenced.has(i)).toBe(true);
			}
		}
	});

	it("aggregate validator returns zero errors on the initial suite", () => {
		const result = validateScenarioSpecCollection(specs as ScenarioSpec[]);
		if (result.errors.length > 0) {
			// Surface all errors so the CI feedback names every offender.
			throw new Error(
				`Scenario spec aggregate validator found ${result.errors.length} error(s):\n${result.errors
					.map(
						(e) =>
							`  - ${e.code}: ${e.message}${e.stepId ? ` (step ${e.stepId})` : ""}`,
					)
					.join("\n")}`,
			);
		}
		expect(result.errors).toEqual([]);
		expect(result.results.length).toBeGreaterThan(0);
	});

	it("loader sanity: at least 8 scenarios, one per Issue #147 category", () => {
		const ids = specs.map((s) => s.id);
		const required: ReadonlySet<string> = new Set([
			"SCN-BOOT-01",
			"SCN-CATALOG-01",
			"SCN-PRESET-CRUD-01",
			"SCN-LIFECYCLE-01",
			"SCN-LIFECYCLE-02",
			"SCN-GROUPS-01",
			"SCN-HOST-01",
			"SCN-SETTINGS-01",
			"SCN-DEGRADED-01",
			"SCN-DIAGNOSTICS-01",
			"SCN-FAILURE-01",
		]);
		for (const r of required) {
			expect(ids).toContain(r);
		}
		expect(specs.length).toBeGreaterThanOrEqual(8);
	});

	it("E005 negative-control: a deliberately invalid spec mentioning 'properly' is rejected", () => {
		const base = makeFixtureSpec();
		const bad: ScenarioSpec = {
			...base,
			procedure: base.procedure.map((s, i) =>
				i === 1
					? {
							...s,
							postconditions: [
								"The fixture postconditions should properly describe the outcome.",
							],
						}
					: s,
			),
		};
		const result = validateScenarioSpecCollection([bad]);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E005_FORBIDDEN_WORD");
	});

	it("E004 negative-control: a mutation step without cleanup nor noCleanupReason is rejected", () => {
		const base = makeFixtureSpec();
		// The base fixture has scenario-level cleanup; remove it to expose the per-step check.
		const bad: ScenarioSpec = { ...base, cleanup: [] };
		const result = validateScenarioSpecCollection([bad]);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E004_MUTATION_NO_CLEANUP");
	});

	it("E012 negative-control: a Procedure step with an out-of-range gherkinRef is rejected", () => {
		const base = makeFixtureSpec();
		const bad: ScenarioSpec = {
			...base,
			procedure: base.procedure.map((s, i) =>
				i === 0
					? {
							...s,
							gherkinRef: {
								scenarioId: base.gherkin.scenarioId,
								stepIndex: 999,
							},
						}
					: s,
			),
		};
		const result = validateScenarioSpecCollection([bad]);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E012_GHERKIN_REF_NOT_FOUND");
	});

	it("E009 negative-control: a scenario with no environment is rejected", () => {
		const base = makeFixtureSpec();
		const bad = { ...base } as unknown as ScenarioSpec;
		(bad as { environment: unknown }).environment = undefined;
		const result = validateScenarioSpecCollection([bad]);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E009_MISSING_ENVIRONMENT");
	});

	it("E010 negative-control: a scenario with no stop conditions is rejected", () => {
		const base = makeFixtureSpec();
		const bad: ScenarioSpec = { ...base, stopConditions: [] };
		const result = validateScenarioSpecCollection([bad]);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E010_MISSING_STOP_CONDITIONS");
	});

	it("E011 negative-control: a scenario with no automation caps is rejected", () => {
		const base = makeFixtureSpec();
		const bad: ScenarioSpec = {
			...base,
			automation: { requiredCapabilities: [] },
		};
		const result = validateScenarioSpecCollection([bad]);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E011_MISSING_AUTOMATION_CAPS");
	});
});

// ---------------------------------------------------------------------------
// Fixture builder (used only by the negative-control tests).
// ---------------------------------------------------------------------------

const makeFixtureSpec = (): ScenarioSpec => ({
	id: "SCN-FIXTURE-01",
	title: "validator self-test fixture",
	evidenceLevel: "scenario_spec",
	gherkin: {
		scenarioId: "scn-fixture-01-gherkin",
		scenarioName: "SCN-FIXTURE-01 — fixture",
		steps: [
			{
				index: 0,
				kind: "Given",
				text: "an initial panel state",
			},
			{
				index: 1,
				kind: "When",
				text: "the user performs one action",
			},
			{
				index: 2,
				kind: "Then",
				text: "the resulting observable state matches",
			},
		],
		tags: [],
		background: [],
		examples: [],
	},
	procedure: [
		{
			id: "step-1",
			gherkinRef: { scenarioId: "scn-fixture-01-gherkin", stepIndex: 0 },
			preconditions: [],
			input: {},
			action: "observe_initial_state",
			expectedResult: {},
			postconditions: [],
			mutation: false,
			checkpoint: false,
		},
		{
			id: "step-2",
			gherkinRef: { scenarioId: "scn-fixture-01-gherkin", stepIndex: 1 },
			preconditions: [],
			input: {},
			action: "perform_action",
			expectedResult: {},
			postconditions: ["Mutation applied."],
			mutation: true,
			checkpoint: false,
		},
		{
			id: "step-3",
			gherkinRef: { scenarioId: "scn-fixture-01-gherkin", stepIndex: 2 },
			preconditions: [],
			input: {},
			action: "checkpoint_re_observe",
			expectedResult: {},
			postconditions: ["Re-observe confirmed."],
			mutation: false,
			checkpoint: true,
		},
	],
	oracles: {
		ui: { selector: '[data-preset-id="x"]', textContent: "" },
		persistence: { storageKey: "k", expected: null },
		dual: false,
	},
	evidence: {
		screenshotSelectors: ['[data-preset-id="x"]'],
		computedStyleSnapshots: [],
		persistedStateDumps: ["storage:k"],
		logAssertions: [],
	},
	cleanup: [
		{
			id: "cleanup-1",
			preconditions: [],
			input: {},
			action: "cleanup",
			expectedResult: {},
			postconditions: [],
			mutation: true,
			checkpoint: false,
		},
	],
	environment: {
		os: "macos",
		hostVersionRange: ">=23.0.0",
		panelState: "post-onboarding",
	},
	fixtures: [],
	requirementRefs: [],
	stopConditions: [{ trigger: "modal-unexpected", description: "abort" }],
	onFailure: {
		capture: ["log-bus-tail"],
		doNot: ["send-to-network"],
	},
	automation: {
		requiredCapabilities: ["persisted-state-read", "click"],
	},
	postconditions: ["Fixture postcondition."],
});
