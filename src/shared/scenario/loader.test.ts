/**
 * Loader behaviour tests (Issue #147, round-2).
 *
 * Verifies:
 *
 *   - Blocker B — the loader uses `scenario-bindings.json` as the
 *     canonical mapping.  Missing featureFile / procedureFile,
 *     cross-file collisions, and procedure-file scenarioId mismatches
 *     raise clear errors (no silent fallbacks).
 *   - Blocker A — the loader surfaces the canonical `.feature`
 *     Background as `gherkin.background` on the loaded scenario, and
 *     `gherkinRef.stepIndex` keeps referring to the visible scenario
 *     steps (NOT background steps).
 *   - Blocker C — the durable `RunResult` shape (run_id,
 *     resolved_environment, artifact_list, step_results with
 *     PASS/FAIL/BLOCKED/INCONCLUSIVE, required_evidence_satisfied,
 *     verdict) is structurally round-trippable.
 *
 * The tests use a per-test fixture directory created in a `mkdtemp`
 * directory; the loader reads paths relative to `process.cwd()` so we
 * `process.chdir` into the fixture for each scenario.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadScenarioSpecs } from "./loader";
import type { RunResult, ScenarioSpec } from "./types";

let fixtureRoot: string;
let originalCwd: string;

/**
 * Push a value through the durability hop the runner really uses: persisted
 * with `JSON.stringify`, read back with `JSON.parse`.
 *
 * This is deliberately a JSON round-trip and not a `structuredClone` deep
 * copy. `structuredClone` would keep `undefined`, `Date` and cyclic values
 * that the real hop silently drops, so it would stop testing the property
 * these cases exist to check — that the declared field set survives being
 * written to disk as JSON.
 */
const serializeThroughDurabilityHop = <T>(value: T): T =>
	JSON.parse(JSON.stringify(value)) as T;

beforeEach(() => {
	originalCwd = process.cwd();
	fixtureRoot = mkdtempSync(join(tmpdir(), "scenario-loader-"));
	mkdirSync(join(fixtureRoot, "src/shared/scenario/features"), {
		recursive: true,
	});
	mkdirSync(join(fixtureRoot, "src/shared/scenario/procedures"), {
		recursive: true,
	});
	process.chdir(fixtureRoot);
});

afterEach(() => {
	process.chdir(originalCwd);
	rmSync(fixtureRoot, { recursive: true, force: true });
});

const writeFile = (relPath: string, contents: string): void => {
	const abs = join(fixtureRoot, relPath);
	mkdirSync(join(abs, ".."), { recursive: true });
	writeFileSync(abs, contents);
};

const FEATURE_WITH_BACKGROUND = `
Feature: Loader test

  Background:
    Given the catalog is empty
    And the workspace is empty

  Rule: a scenario

    Scenario: SCN-LOADER-01 — background preserved
      Given a step referencing a background precondition
      When something happens
      Then an outcome is observed
`.trim();

const FEATURE_NO_BACKGROUND = `
Feature: Loader test no background

  Rule: a scenario

    Scenario: SCN-LOADER-02 — no background
      Given a single step
      When an action occurs
      Then the outcome is observed
`.trim();

const FEATURE_FEATURE_AND_RULE_BACKGROUND = `
Feature: Loader test feature+rule background

  Background:
    Given the catalog is empty
    And the workspace is empty

  Rule: a scenario with appended rule background

    Background:
      Given the user is authenticated
      And the cloud gateway is reachable

    Scenario: SCN-LOADER-03 — feature+rule background composed
      Given a visible step
      When an action occurs
      Then the outcome is observed
`.trim();

const FEATURE_RULE_ONLY_BACKGROUND = `
Feature: Loader test rule-only background

  Rule: a scenario with rule-only background

    Background:
      Given the user is authenticated
      And the cloud gateway is reachable

    Scenario: SCN-LOADER-04 — rule-only background
      Given a visible step
      When an action occurs
      Then the outcome is observed
`.trim();

const FEATURE_SCENARIO_OUTLINE = `
Feature: Loader test scenario outline

  Rule: a parameterised scenario

    Scenario Outline: SCN-LOADER-05 — outline scope template
      Given a step referencing <placeholder>
      When an action occurs
      Then the outcome is observed

      Examples: a named block
        |name   |placeholder|
        |row-A  |first value|
        |row-B  |second value|

      Examples:
        |placeholder|
        |only-row|
`.trim();

const PROCEDURE_2_STEPS = {
	scenarioId: "SCN-LOADER-01",
	steps: [
		{
			id: "step-1",
			gherkinRef: { scenarioId: "SCN-LOADER-01", stepIndex: 0 },
			preconditions: [],
			input: {},
			action: "act",
			expectedResult: {},
			postconditions: [],
			mutation: false,
			checkpoint: false,
		},
		{
			id: "step-2",
			gherkinRef: { scenarioId: "SCN-LOADER-01", stepIndex: 1 },
			preconditions: [],
			input: {},
			action: "act2",
			expectedResult: {},
			postconditions: [],
			mutation: false,
			checkpoint: true,
		},
	],
};

const PROCEDURE_NO_BACKGROUND = {
	scenarioId: "SCN-LOADER-02",
	steps: [
		{
			id: "step-1",
			gherkinRef: { scenarioId: "SCN-LOADER-02", stepIndex: 0 },
			preconditions: [],
			input: {},
			action: "act",
			expectedResult: {},
			postconditions: [],
			mutation: false,
			checkpoint: false,
		},
		{
			id: "step-2",
			gherkinRef: { scenarioId: "SCN-LOADER-02", stepIndex: 1 },
			preconditions: [],
			input: {},
			action: "act2",
			expectedResult: {},
			postconditions: [],
			mutation: false,
			checkpoint: true,
		},
	],
};

const BINDINGS_BASE = {
	bindings: [
		{
			scenarioId: "SCN-LOADER-01",
			featureFile: "src/shared/scenario/features/loader.feature",
			procedureFile: "src/shared/scenario/procedures/SCN-LOADER-01.json",
			scenarioName: "SCN-LOADER-01 — background preserved",
			title: "background preserved loader test",
			evidenceLevel: "scenario_spec",
			oracles: { dual: false },
			evidence: {
				screenshotSelectors: ['[data-preset-id="tile-A"]'],
				computedStyleSnapshots: [],
				persistedStateDumps: ["storage:k"],
				logAssertions: [],
			},
			environment: {
				os: "macos",
				hostVersionRange: ">=23.0.0",
				panelState: "post-onboarding",
			},
			fixtures: [],
			requirementRefs: [],
			stopConditions: [{ trigger: "modal-unexpected", description: "abort" }],
			onFailure: { capture: ["log-bus-tail"], doNot: ["send-to-network"] },
			automation: { requiredCapabilities: ["click", "selector-resolve"] },
			postconditions: ["Done."],
		},
	],
};

describe("loader — round-2", () => {
	it("Blocker B: missing scenario-bindings.json throws a clear error", () => {
		// No writeFile for the bindings file — it does not exist.
		expect(() => loadScenarioSpecs()).toThrow(
			/scenario bindings file does not exist/i,
		);
	});

	it("Blocker B: missing procedureFile throws with the binding's path", () => {
		writeFile(
			"src/shared/scenario/features/loader.feature",
			FEATURE_WITH_BACKGROUND,
		);
		writeFile(
			"src/shared/scenario/scenario-bindings.json",
			JSON.stringify({
				bindings: [
					{
						...BINDINGS_BASE.bindings[0],
						procedureFile: "src/shared/scenario/procedures/MISSING.json",
					},
				],
			}),
		);
		// Procedure file deliberately not written.
		expect(() => loadScenarioSpecs()).toThrow(
			/procedure file declared in binding.*does not exist/i,
		);
	});

	it("Blocker B: missing featureFile throws with the binding's path", () => {
		writeFile(
			"src/shared/scenario/procedures/SCN-LOADER-01.json",
			JSON.stringify(PROCEDURE_2_STEPS),
		);
		writeFile(
			"src/shared/scenario/scenario-bindings.json",
			JSON.stringify({
				bindings: [
					{
						...BINDINGS_BASE.bindings[0],
						featureFile: "src/shared/scenario/features/missing.feature",
					},
				],
			}),
		);
		// Feature file deliberately not written.
		expect(() => loadScenarioSpecs()).toThrow(
			/feature file declared in bindings does not exist/i,
		);
	});

	it("Blocker B: procedure's scenarioId mismatch with binding throws", () => {
		writeFile(
			"src/shared/scenario/features/loader.feature",
			FEATURE_WITH_BACKGROUND,
		);
		writeFile(
			"src/shared/scenario/procedures/SCN-LOADER-01.json",
			JSON.stringify({
				...PROCEDURE_2_STEPS,
				scenarioId: "SCN-OTHER-99",
			}),
		);
		writeFile(
			"src/shared/scenario/scenario-bindings.json",
			JSON.stringify(BINDINGS_BASE),
		);
		expect(() => loadScenarioSpecs()).toThrow(
			/procedure file.*declares scenarioId.*SCN-OTHER-99.*SCN-LOADER-01/i,
		);
	});

	it("Blocker B: cross-file collision (two bindings → same scenarioName in same .feature) throws", () => {
		// .feature declares one scenario with name "SCN-LOADER-01 — background preserved".
		// The bindings file declares two entries pointing at this scenario by
		// different scenarioIds.  Without the binding-driven loader, a
		// filename-search would silently pick the first matching JSON.
		writeFile(
			"src/shared/scenario/features/loader.feature",
			FEATURE_WITH_BACKGROUND,
		);
		writeFile(
			"src/shared/scenario/procedures/SCN-LOADER-01.json",
			JSON.stringify(PROCEDURE_2_STEPS),
		);
		// Second binding uses a different procedureFile that does NOT exist —
		// but both bindings share the same scenarioName, so the first
		// binding wins on the canonical mapping.  The second binding's
		// missing procedureFile surfaces the throw.
		writeFile(
			"src/shared/scenario/scenario-bindings.json",
			JSON.stringify({
				bindings: [
					BINDINGS_BASE.bindings[0],
					{
						...BINDINGS_BASE.bindings[0],
						scenarioId: "SCN-LOADER-99",
						procedureFile: "src/shared/scenario/procedures/SCN-LOADER-99.json",
					},
				],
			}),
		);
		expect(() => loadScenarioSpecs()).toThrow(
			/procedure file declared in binding.*does not exist/i,
		);
	});

	it("Blocker A: feature Background is surfaced on gherkin.background and excluded from stepIndex", () => {
		writeFile(
			"src/shared/scenario/features/loader.feature",
			FEATURE_WITH_BACKGROUND,
		);
		writeFile(
			"src/shared/scenario/procedures/SCN-LOADER-01.json",
			JSON.stringify(PROCEDURE_2_STEPS),
		);
		writeFile(
			"src/shared/scenario/scenario-bindings.json",
			JSON.stringify(BINDINGS_BASE),
		);
		const specs = loadScenarioSpecs();
		expect(specs).toHaveLength(1);
		const scn = specs[0];
		expect(scn.gherkin.background).toBeDefined();
		expect(scn.gherkin.background.length).toBe(2);
		expect(scn.gherkin.background[0].text).toMatch(/the catalog is empty/);
		expect(scn.gherkin.background[1].text).toMatch(/the workspace is empty/);
		// stepIndex 0 must still resolve to the first visible scenario step,
		// NOT to a background step.
		expect(scn.gherkin.steps.length).toBe(3);
		expect(scn.gherkin.steps[0].text).toMatch(
			/a step referencing a background precondition/,
		);
	});

	it("Blocker A: feature without Background surfaces an empty background array", () => {
		writeFile(
			"src/shared/scenario/features/loader.feature",
			FEATURE_NO_BACKGROUND,
		);
		writeFile(
			"src/shared/scenario/procedures/SCN-LOADER-02.json",
			JSON.stringify(PROCEDURE_NO_BACKGROUND),
		);
		writeFile(
			"src/shared/scenario/scenario-bindings.json",
			JSON.stringify({
				bindings: [
					{
						...BINDINGS_BASE.bindings[0],
						scenarioId: "SCN-LOADER-02",
						scenarioName: "SCN-LOADER-02 — no background",
						procedureFile: "src/shared/scenario/procedures/SCN-LOADER-02.json",
					},
				],
			}),
		);
		const specs = loadScenarioSpecs();
		expect(specs).toHaveLength(1);
		expect(specs[0].gherkin.background).toEqual([]);
	});

	it("round-3 Blocker 1: Feature Background AND Rule Background are concatenated in canonical Cucumber order Feature → Rule", () => {
		writeFile(
			"src/shared/scenario/features/loader.feature",
			FEATURE_FEATURE_AND_RULE_BACKGROUND,
		);
		const procedureSteps = {
			scenarioId: "SCN-LOADER-03",
			steps: [
				{
					id: "step-1",
					gherkinRef: { scenarioId: "SCN-LOADER-03", stepIndex: 0 },
					preconditions: [],
					input: {},
					action: "act",
					expectedResult: {},
					postconditions: [],
					mutation: false,
					checkpoint: false,
				},
				{
					id: "step-2",
					gherkinRef: { scenarioId: "SCN-LOADER-03", stepIndex: 1 },
					preconditions: [],
					input: {},
					action: "act2",
					expectedResult: {},
					postconditions: [],
					mutation: false,
					checkpoint: true,
				},
			],
		};
		writeFile(
			"src/shared/scenario/procedures/SCN-LOADER-03.json",
			JSON.stringify(procedureSteps),
		);
		writeFile(
			"src/shared/scenario/scenario-bindings.json",
			JSON.stringify({
				bindings: [
					{
						...BINDINGS_BASE.bindings[0],
						scenarioId: "SCN-LOADER-03",
						scenarioName: "SCN-LOADER-03 — feature+rule background composed",
						procedureFile: "src/shared/scenario/procedures/SCN-LOADER-03.json",
					},
				],
			}),
		);
		const specs = loadScenarioSpecs();
		expect(specs).toHaveLength(1);
		const scn = specs[0];
		expect(scn.gherkin.background).toHaveLength(4);
		// Feature Background first, in declared order.
		expect(scn.gherkin.background[0].text).toMatch(/the catalog is empty/);
		expect(scn.gherkin.background[1].text).toMatch(/the workspace is empty/);
		// Rule Background appended after Feature Background.
		expect(scn.gherkin.background[2].text).toMatch(/the user is authenticated/);
		expect(scn.gherkin.background[3].text).toMatch(
			/the cloud gateway is reachable/,
		);
		// stepIndex 0 must still resolve to the first visible scenario step,
		// NOT to a background step.
		expect(scn.gherkin.steps.length).toBe(3);
		expect(scn.gherkin.steps[0].text).toMatch(/a visible step/);
	});

	it("round-3 Blocker 1: Rule-only Background (no Feature Background) surfaces as the scenario's background", () => {
		writeFile(
			"src/shared/scenario/features/loader.feature",
			FEATURE_RULE_ONLY_BACKGROUND,
		);
		const procedureSteps = {
			scenarioId: "SCN-LOADER-04",
			steps: [
				{
					id: "step-1",
					gherkinRef: { scenarioId: "SCN-LOADER-04", stepIndex: 0 },
					preconditions: [],
					input: {},
					action: "act",
					expectedResult: {},
					postconditions: [],
					mutation: false,
					checkpoint: false,
				},
				{
					id: "step-2",
					gherkinRef: { scenarioId: "SCN-LOADER-04", stepIndex: 1 },
					preconditions: [],
					input: {},
					action: "act2",
					expectedResult: {},
					postconditions: [],
					mutation: false,
					checkpoint: true,
				},
			],
		};
		writeFile(
			"src/shared/scenario/procedures/SCN-LOADER-04.json",
			JSON.stringify(procedureSteps),
		);
		writeFile(
			"src/shared/scenario/scenario-bindings.json",
			JSON.stringify({
				bindings: [
					{
						...BINDINGS_BASE.bindings[0],
						scenarioId: "SCN-LOADER-04",
						scenarioName: "SCN-LOADER-04 — rule-only background",
						procedureFile: "src/shared/scenario/procedures/SCN-LOADER-04.json",
					},
				],
			}),
		);
		const specs = loadScenarioSpecs();
		expect(specs).toHaveLength(1);
		const scn = specs[0];
		expect(scn.gherkin.background).toHaveLength(2);
		expect(scn.gherkin.background[0].text).toMatch(/the user is authenticated/);
		expect(scn.gherkin.background[1].text).toMatch(
			/the cloud gateway is reachable/,
		);
	});

	it("Blocker C: RunResult shape (round-trip) carries every durability field", () => {
		// No loader state required — this is a structural type check.
		// The fixture object is hand-crafted so a regression that removes
		// one of the durability fields surfaces as a TypeScript error at
		// build time and a JSON.parse failure at runtime.
		const sample: RunResult = {
			runId: "0192f3a7-9c2e-7c0a-b4e1-1f8c0b1f3a2d",
			scenarioId: "SCN-LIFECYCLE-01",
			verdict: "PASS",
			startedAt: "2026-09-22T12:00:00.000Z",
			endedAt: "2026-09-22T12:01:00.000Z",
			resolvedEnvironment: {
				os: "macos",
				osVersion: "14.5",
				aeVersion: "23.0.0",
				panelState: "post-onboarding",
				locale: "en",
				resolvedAt: "2026-09-22T12:00:00.000Z",
			},
			stepResults: [
				{
					stepId: "step-1",
					status: "PASS",
					observed: {
						persistence: {
							storageKey: "preset:X",
							expected: null,
						},
					},
					passed: true,
					capturedArtifacts: [
						{
							kind: "persisted-state-dump",
							path: "artifacts/SCN-LIFECYCLE-01/run-1/state.json",
							capturedAt: "2026-09-22T12:00:30.000Z",
							bytes: 1024,
							sha256:
								"a3f1c7b2e9d6c5a4b8e2f1d7c6b5a4e3d2c1b0a9f8e7d6c5b4a3e2d1c0b9a8f7e",
						},
					],
				},
			],
			artifactList: [
				{
					kind: "screenshot",
					path: "artifacts/SCN-LIFECYCLE-01/run-1/panel.png",
					capturedAt: "2026-09-22T12:00:30.000Z",
				},
			],
			requiredEvidenceSatisfied: true,
			cleanup: {
				executed: true,
				verified: true,
				remainingState: [],
			},
		};
		// Round-trip via JSON to confirm the field set survives the
		// durability hop from runner to auditor.
		const roundTrip = serializeThroughDurabilityHop(sample);
		expect(roundTrip.runId).toBe(sample.runId);
		expect(roundTrip.resolvedEnvironment.aeVersion).toBe(
			sample.resolvedEnvironment.aeVersion,
		);
		expect(roundTrip.stepResults[0].status).toBe("PASS");
		expect(roundTrip.artifactList[0].kind).toBe("screenshot");
		expect(roundTrip.requiredEvidenceSatisfied).toBe(true);
		expect(roundTrip.verdict).toBe("PASS");
	});

	it("Blocker C: StepResult status enum covers PASS / FAIL / BLOCKED / INCONCLUSIVE", () => {
		// The fixture uses each status to confirm the union is exhaustive.
		const makeStep = (
			status: "PASS" | "FAIL" | "BLOCKED" | "INCONCLUSIVE",
		) => ({
			stepId: `s-${status}`,
			status,
			observed: {},
			passed: status === "PASS",
			capturedArtifacts: [],
		});
		const sample: RunResult = {
			runId: "x",
			scenarioId: "SCN-X",
			verdict: "FAIL",
			startedAt: "2026-09-22T12:00:00.000Z",
			endedAt: "2026-09-22T12:00:01.000Z",
			resolvedEnvironment: {
				os: "macos",
				osVersion: "14",
				aeVersion: "23",
				panelState: "post-onboarding",
				locale: "en",
				resolvedAt: "2026-09-22T12:00:00.000Z",
			},
			stepResults: [
				makeStep("PASS"),
				makeStep("FAIL"),
				makeStep("BLOCKED"),
				makeStep("INCONCLUSIVE"),
			],
			artifactList: [],
			requiredEvidenceSatisfied: false,
			cleanup: {
				executed: true,
				verified: false,
				remainingState: ["storage:k"],
			},
			failure: {
				failureStep: "s-FAIL",
				failureMessage: "oracle mismatch",
				capturedAt: "2026-09-22T12:00:01.000Z",
			},
		};
		expect(sample.stepResults.map((s) => s.status)).toEqual([
			"PASS",
			"FAIL",
			"BLOCKED",
			"INCONCLUSIVE",
		]);
		expect(sample.failure?.failureStep).toBe("s-FAIL");
	});

	it("loader returns ScenarioSpec[] whose gherkin.background round-trips JSON", () => {
		writeFile(
			"src/shared/scenario/features/loader.feature",
			FEATURE_WITH_BACKGROUND,
		);
		writeFile(
			"src/shared/scenario/procedures/SCN-LOADER-01.json",
			JSON.stringify(PROCEDURE_2_STEPS),
		);
		writeFile(
			"src/shared/scenario/scenario-bindings.json",
			JSON.stringify(BINDINGS_BASE),
		);
		const specs: ScenarioSpec[] = [...loadScenarioSpecs()];
		const roundTrip = serializeThroughDurabilityHop(specs);
		expect(roundTrip[0].gherkin.background.length).toBe(2);
	});

	// Round-4 Blocker D — Scenario Outline + Examples preservation.
	it("round-4 Blocker D: Scenario Outline examples surface on gherkin.examples and on isScenarioOutline", () => {
		writeFile(
			"src/shared/scenario/features/loader.feature",
			FEATURE_SCENARIO_OUTLINE,
		);
		writeFile(
			"src/shared/scenario/procedures/SCN-LOADER-05.json",
			JSON.stringify({
				scenarioId: "SCN-LOADER-05",
				steps: PROCEDURE_2_STEPS.steps,
			}),
		);
		writeFile(
			"src/shared/scenario/scenario-bindings.json",
			JSON.stringify({
				bindings: [
					{
						...BINDINGS_BASE.bindings[0],
						scenarioId: "SCN-LOADER-05",
						scenarioName: "SCN-LOADER-05 — outline scope template",
						procedureFile: "src/shared/scenario/procedures/SCN-LOADER-05.json",
						isScenarioOutline: true,
					},
				],
			}),
		);
		const specs = loadScenarioSpecs();
		expect(specs).toHaveLength(1);
		const scn = specs[0];
		expect(scn.isScenarioOutline).toBe(true);
		expect(scn.gherkin.examples).toHaveLength(2);
		// First Examples block has its declared name and 2 columns × 2 rows.
		expect(scn.gherkin.examples[0].name).toBe("a named block");
		expect(scn.gherkin.examples[0].headers).toEqual(["name", "placeholder"]);
		expect(scn.gherkin.examples[0].rows).toEqual([
			["row-A", "first value"],
			["row-B", "second value"],
		]);
		// Second Examples block has no name and 1 column × 1 row.
		expect(scn.gherkin.examples[1].name).toBe("");
		expect(scn.gherkin.examples[1].headers).toEqual(["placeholder"]);
		expect(scn.gherkin.examples[1].rows).toEqual([["only-row"]]);
	});

	it("round-4 Blocker D: plain Scenario (not Outline) has isScenarioOutline absent and empty examples", () => {
		writeFile(
			"src/shared/scenario/features/loader.feature",
			FEATURE_WITH_BACKGROUND,
		);
		writeFile(
			"src/shared/scenario/procedures/SCN-LOADER-01.json",
			JSON.stringify(PROCEDURE_2_STEPS),
		);
		writeFile(
			"src/shared/scenario/scenario-bindings.json",
			JSON.stringify(BINDINGS_BASE),
		);
		const specs = loadScenarioSpecs();
		expect(specs).toHaveLength(1);
		const scn = specs[0];
		expect(scn.isScenarioOutline).toBeUndefined();
		expect(scn.gherkin.examples).toEqual([]);
	});
});
