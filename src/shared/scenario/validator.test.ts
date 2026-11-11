/**
 * Tests for the scenario-spec validator itself (Issue #147, 5-blocker rework).
 *
 * Each test constructs a fixture spec that exercises a single rule
 * (E001, E003, E004_MUTATION_NO_CLEANUP, E005, E006, E007, E008, E009,
 * E010, E011, E012) and asserts the validator's verdict.  Fixtures
 * exercise both PASS and FAIL paths so the same suite guards against
 * false positives (over-reporting failures on valid specs) and false
 * negatives (under-reporting on invalid specs).
 *
 * NOTE: E002 (1:1 Gherkin ↔ Procedure step correspondence) was REMOVED
 * in this rework — Gherkin / Procedure are now linked by `gherkinRef`
 * and the count check is no longer the contract (see E012).
 */

import { describe, expect, it } from "vitest";

import type { GherkinBlock, ProcedureStep, ScenarioSpec } from "./types";
import {
	ALLOWED_EVIDENCE_LEVELS,
	normalizeAeHostVersion,
	validateScenarioSpec,
	validateScenarioSpecCollection,
} from "./validator";

const baseGherkinStep = (
	index: number,
	kind: "Given" | "When" | "Then",
	text: string,
) => ({
	index,
	kind,
	text,
});

const makeSpec = (overrides: Partial<ScenarioSpec> = {}): ScenarioSpec => {
	const gherkin: GherkinBlock = overrides.gherkin ?? {
		scenarioId: "scn-test-01-gherkin",
		scenarioName: "scn-test-01-gherkin",
		steps: [
			baseGherkinStep(0, "Given", "an initial panel state"),
			baseGherkinStep(1, "When", "the user performs one action"),
			baseGherkinStep(2, "Then", "the resulting observable state matches"),
		],
		tags: [],
		background: [],
		examples: [],
	};
	const procedure: readonly ProcedureStep[] = overrides.procedure ?? [
		{
			id: "step-1",
			gherkinRef: { scenarioId: "scn-test-01-gherkin", stepIndex: 0 },
			preconditions: [],
			input: { probe: "initial" },
			action: "observe_initial_state",
			expectedResult: {
				persistenceOracle: { storageKey: "k", expected: null },
			},
			postconditions: [],
			mutation: false,
			checkpoint: false,
		},
		{
			id: "step-2",
			gherkinRef: { scenarioId: "scn-test-01-gherkin", stepIndex: 1 },
			preconditions: ["Initial state observed."],
			input: { x: 1 },
			action: "perform_action",
			expectedResult: {
				persistenceOracle: { storageKey: "k", expected: { ok: true } },
			},
			postconditions: ["Mutation applied."],
			mutation: true,
			checkpoint: false,
		},
		{
			id: "step-3",
			gherkinRef: { scenarioId: "scn-test-01-gherkin", stepIndex: 2 },
			preconditions: ["Mutation applied."],
			input: { probe: "verify" },
			action: "checkpoint_re_observe",
			expectedResult: {
				persistenceOracle: { storageKey: "k", expected: { ok: true } },
			},
			postconditions: ["Re-observe confirmed."],
			mutation: false,
			checkpoint: true,
		},
	];
	return {
		id: "SCN-TEST-01",
		title: "validator self-test",
		evidenceLevel: "scenario_spec",
		gherkin,
		procedure,
		oracles: {
			persistence: { storageKey: "k", expected: { ok: true } },
			dual: false,
		},
		evidence: {
			screenshotSelectors: ['[data-preset-id="tile-A"]'],
			computedStyleSnapshots: [],
			persistedStateDumps: ["storage:k"],
			logAssertions: [],
		},
		cleanup: [
			{
				id: "cleanup-1",
				gherkinRef: undefined,
				preconditions: [],
				input: {},
				action: "reset_state",
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
		onFailure: { capture: ["log-bus-tail"], doNot: ["send-to-network"] },
		automation: {
			requiredCapabilities: ["persisted-state-read", "click"],
		},
		postconditions: ["Fixture postcondition."],
		...overrides,
	};
};

describe("scenario validator", () => {
	it("PASS: a well-formed spec returns no errors", () => {
		const result = validateScenarioSpec(makeSpec());
		expect(result.errors).toEqual([]);
	});

	it("E001: duplicate scenario id within suite → E001_DUP_ID", () => {
		const a = makeSpec();
		const b = makeSpec();
		const result = validateScenarioSpecCollection([a, b]);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E001_DUP_ID");
	});

	it("E003: mutation step without immediately-following checkpoint → E003_MUTATION_NO_CHECKPOINT", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 2 ? { ...s, checkpoint: false } : s,
		);
		const spec = makeSpec({ procedure });
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E003_MUTATION_NO_CHECKPOINT");
	});

	it("E003 (PASS): mutation step followed by checkpoint step succeeds", () => {
		const base = makeSpec();
		const result = validateScenarioSpec(base);
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E003_MUTATION_NO_CHECKPOINT",
		);
	});

	it("E004: mutation step without cleanup nor noCleanupReason → E004_MUTATION_NO_CLEANUP", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 1 ? { ...s, noCleanupReason: undefined } : s,
		);
		const spec = makeSpec({ procedure, cleanup: [] });
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E004_MUTATION_NO_CLEANUP");
	});

	it("E004 (PASS): mutation step with non-empty noCleanupReason is allowed", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 1
				? {
						...s,
						noCleanupReason:
							"the mutation writes only to the in-memory fixture, no persistent state to clean up.",
					}
				: s,
		);
		const spec = makeSpec({ procedure, cleanup: [] });
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E004_MUTATION_NO_CLEANUP",
		);
	});

	it("E005: forbidden oracle wording (properly) → E005_FORBIDDEN_WORD", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 0
				? {
						...s,
						postconditions: [
							"The dialog properly dismisses when clicking outside the dialog region.",
						],
					}
				: s,
		);
		const spec = makeSpec({
			procedure,
			evidence: {
				screenshotSelectors: [],
				computedStyleSnapshots: [],
				persistedStateDumps: ["storage:k"],
				logAssertions: [],
			},
		});
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E005_FORBIDDEN_WORD");
	});

	it("E005 (case-insensitive): 'PROPERLY' still triggers E005_FORBIDDEN_WORD", () => {
		const spec = makeSpec({
			title: "preset is PROPERLY reset across cross-panel move",
		});
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E005_FORBIDDEN_WORD");
	});

	it("E006: title contains 'cross-panel' but dual is false → E006_MISSING_DUAL_ORACLE", () => {
		const spec = makeSpec({
			title: "cross-panel state must propagate after move",
			oracles: { dual: false },
		});
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E006_MISSING_DUAL_ORACLE");
	});

	it("E006 (PASS): title contains 'cross-panel' AND oracles.dual=true with ui+persistence is allowed", () => {
		const spec = makeSpec({
			title: "cross-panel state must propagate after move",
			oracles: {
				ui: {
					selector: '[data-preset-id="x"]',
					attribute: { name: "data-x", value: "y" },
				},
				persistence: { storageKey: "k", expected: { ok: true } },
				dual: true,
			},
		});
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E006_MISSING_DUAL_ORACLE",
		);
	});

	it("E007: invalid evidence level → E007_INVALID_EVIDENCE_LEVEL", () => {
		const spec = makeSpec({
			evidenceLevel: "not_a_real_level" as ScenarioSpec["evidenceLevel"],
		});
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E007_INVALID_EVIDENCE_LEVEL");
	});

	it("E007 (PASS): every evidence level in the allowed set is accepted", () => {
		for (const level of ALLOWED_EVIDENCE_LEVELS) {
			const spec = makeSpec({
				evidenceLevel: level,
			});
			const result = validateScenarioSpec(spec);
			expect(result.errors.map((e) => e.code)).not.toContain(
				"E007_INVALID_EVIDENCE_LEVEL",
			);
		}
	});

	it("E008: missing evidence section → E008_MISSING_EVIDENCE", () => {
		const base = makeSpec();
		const spec: ScenarioSpec = {
			...base,
			evidence: {
				screenshotSelectors: [],
				computedStyleSnapshots: [],
				persistedStateDumps: [],
				logAssertions: [],
			},
		};
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E008_MISSING_EVIDENCE");
	});

	it("E009: missing environment → E009_MISSING_ENVIRONMENT", () => {
		const base = makeSpec();
		const spec: ScenarioSpec = {
			...base,
			environment: {
				os: "macos",
				hostVersionRange: "",
				panelState: "post-onboarding",
			},
		};
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E009_MISSING_ENVIRONMENT");
	});

	it("E010: empty stopConditions → E010_MISSING_STOP_CONDITIONS", () => {
		const spec = makeSpec({ stopConditions: [] });
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E010_MISSING_STOP_CONDITIONS");
	});

	it("E011: empty requiredCapabilities → E011_MISSING_AUTOMATION_CAPS", () => {
		const spec = makeSpec({
			automation: { requiredCapabilities: [] },
		});
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E011_MISSING_AUTOMATION_CAPS");
	});

	it("E011 (mutation step requires persisted-state-read): missing capability → E011_MISSING_AUTOMATION_CAPS", () => {
		const spec = makeSpec({
			automation: { requiredCapabilities: ["click"] },
		});
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E011_MISSING_AUTOMATION_CAPS");
	});

	it("E012: gherkinRef.stepIndex out of range → E012_GHERKIN_REF_NOT_FOUND", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 0
				? {
						...s,
						gherkinRef: { scenarioId: "scn-test-01-gherkin", stepIndex: 99 },
					}
				: s,
		);
		const spec = makeSpec({ procedure });
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E012_GHERKIN_REF_NOT_FOUND");
	});

	it("E012: orphan Gherkin step (not referenced by any Procedure step) → E012_GHERKIN_REF_NOT_FOUND", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.slice(0, 2);
		const spec = makeSpec({ procedure });
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E012_GHERKIN_REF_NOT_FOUND");
	});

	it("E012 (PASS): every Gherkin step is referenced by exactly one Procedure step", () => {
		const result = validateScenarioSpec(makeSpec());
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E012_GHERKIN_REF_NOT_FOUND",
		);
	});

	it("integration: collection validator aggregates errors from multiple specs", () => {
		const bad = makeSpec({
			id: "SCN-TEST-BAD",
			evidenceLevel: "not_a_real_level" as ScenarioSpec["evidenceLevel"],
		});
		const good = makeSpec({ id: "SCN-TEST-GOOD" });
		const result = validateScenarioSpecCollection([bad, good]);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E007_INVALID_EVIDENCE_LEVEL");
		expect(codes).not.toContain("E001_DUP_ID");
		expect(result.results.length).toBe(2);
	});

	it("E015: synthetic selector on procedure step UI oracle → E015_SYNTHETIC_SELECTOR", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 1
				? {
						...s,
						expectedResult: {
							uiOracle: {
								selector: '[data-testid="setup-required-widget"]',
								attribute: { name: "data-rendered", value: "true" },
							},
						},
					}
				: s,
		);
		const spec = makeSpec({ procedure });
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E015_SYNTHETIC_SELECTOR");
	});

	it("E015: synthetic selector on screenshotSelectors → E015_SYNTHETIC_SELECTOR", () => {
		const base = makeSpec();
		const spec = makeSpec({
			evidence: {
				screenshotSelectors: ['[data-testid="cloud-status-widget"]'],
				computedStyleSnapshots: [],
				persistedStateDumps: ["storage:k"],
				logAssertions: [],
			},
		});
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E015_SYNTHETIC_SELECTOR");
	});

	it("E015: synthetic selector on computedStyleSnapshots → E015_SYNTHETIC_SELECTOR", () => {
		const spec = makeSpec({
			evidence: {
				screenshotSelectors: ['[data-preset-id="tile-A"]'],
				computedStyleSnapshots: ['computed-style: [data-testid="home-widget"]'],
				persistedStateDumps: ["storage:k"],
				logAssertions: [],
			},
		});
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E015_SYNTHETIC_SELECTOR");
	});

	it("E015 (PASS): real production anchor is whitelisted", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 1
				? {
						...s,
						expectedResult: {
							persistenceOracle: {
								storageKey: "k",
								expected: { ok: true },
							},
							uiOracle: {
								selector: '[data-preset-id="tile-A"]',
								attribute: { name: "data-state", value: "placed" },
							},
						},
					}
				: s,
		);
		const spec = makeSpec({
			procedure,
			evidence: {
				screenshotSelectors: ['[data-preset-id="tile-A"]'],
				computedStyleSnapshots: ['computed-style: [data-preset-id="tile-A"]'],
				persistedStateDumps: ["storage:k"],
				logAssertions: [],
			},
		});
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E015_SYNTHETIC_SELECTOR",
		);
	});

	it("round-3 Blocker 2: E015 strict mode rejects compound selectors with a non-whitelisted trailing token", () => {
		const spec = makeSpec({
			evidence: {
				screenshotSelectors: ['[data-preset-id="tile-A"] .ghost-class'],
				computedStyleSnapshots: [],
				persistedStateDumps: ["storage:k"],
				logAssertions: [],
			},
		});
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E015_SYNTHETIC_SELECTOR");
	});

	it("round-3 Blocker 2: E015 strict mode accepts host-state-oracle single-token selectors starting with evalScript:", () => {
		const spec = makeSpec({
			oracles: {
				ui: undefined,
				persistence: { storageKey: "k", expected: { ok: true } },
				hostState: {
					method: "evalScript",
					script: "$.global.__TY_PLUS_HOST__.tyPlusProbeOnlineState()",
					expected: { equals: "online" },
				},
				dual: false,
			},
		});
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E015_SYNTHETIC_SELECTOR",
		);
	});

	it("round-3 Blocker 2: E015 strict mode respects quoted attribute values when splitting tokens", () => {
		// Selector with whitespace inside a quoted value MUST keep the
		// value intact.  Without quote-aware splitting the value gets
		// chopped and the strict check false-fails.
		const spec = makeSpec({
			evidence: {
				screenshotSelectors: [
					'[data-directory-browser-entry][data-entry-path="My Group"]',
				],
				computedStyleSnapshots: [],
				persistedStateDumps: ["storage:k"],
				logAssertions: [],
			},
		});
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E015_SYNTHETIC_SELECTOR",
		);
	});

	it("round-3 Blocker 4: E016 — aeRequired scenario without projectPath → E016_MISSING_AE_FIXTURE", () => {
		const spec = makeSpec({
			environment: {
				os: "windows",
				hostVersionRange: ">=26.5.0",
				aeRequired: true,
				panelState: "post-onboarding",
			},
			fixtures: [
				{
					id: "preset:X",
					kind: "preset",
					identifier: "preset:X",
					initialState: null,
				},
			],
		});
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E016_MISSING_AE_FIXTURE");
	});

	it("round-3 Blocker 4: E016 (PASS) — aeRequired scenario WITH projectPath passes", () => {
		const spec = makeSpec({
			environment: {
				os: "windows",
				hostVersionRange: ">=26.5.0",
				aeRequired: true,
				panelState: "post-onboarding",
			},
			fixtures: [
				{
					id: "project:SCN-X",
					kind: "settings",
					identifier: "project:SCN-X",
					initialState: null,
					projectPath: "validation.host.aep_root/SCN-X.aep",
				},
			],
		});
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E016_MISSING_AE_FIXTURE",
		);
	});

	it("round-3 Blocker 4: E016 (PASS) — non-AE scenario without projectPath is allowed", () => {
		const spec = makeSpec({
			environment: {
				os: "macos",
				hostVersionRange: ">=26.5.0",
				aeRequired: false,
				panelState: "post-onboarding",
			},
			fixtures: [
				{
					id: "preset:X",
					kind: "preset",
					identifier: "preset:X",
					initialState: null,
				},
			],
		});
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E016_MISSING_AE_FIXTURE",
		);
	});

	it("round-3 needs-fix 1: E017 — non-empty lastVerifiedRunId that is not a UUID → E017_INVALID_VERIFIED_RUN_ID", () => {
		const spec = makeSpec();
		(spec as { lastVerifiedRunId?: unknown }).lastVerifiedRunId =
			"(round-2 cut: empty)";
		const result = validateScenarioSpec(spec);
		const codes = result.errors.map((e) => e.code);
		expect(codes).toContain("E017_INVALID_VERIFIED_RUN_ID");
	});

	it("round-3 needs-fix 1: E017 (PASS) — empty lastVerifiedRunId is allowed", () => {
		const spec = makeSpec();
		(spec as { lastVerifiedRunId?: unknown }).lastVerifiedRunId = "";
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E017_INVALID_VERIFIED_RUN_ID",
		);
	});

	it("round-3 needs-fix 1: E017 (PASS) — canonical UUID lastVerifiedRunId is allowed", () => {
		const spec = makeSpec();
		(spec as { lastVerifiedRunId?: unknown }).lastVerifiedRunId =
			"0192f3a7-9c2e-4c0a-b4e1-1f8c0b1f3a2d";
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E017_INVALID_VERIFIED_RUN_ID",
		);
	});

	it("round-4 needs-fix 1: E017 rejects a 36-hyphen stub UUID (round-3 regex would have accepted this)", () => {
		const spec = makeSpec();
		(spec as { lastVerifiedRunId?: unknown }).lastVerifiedRunId =
			"------------------------------------";
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).toContain(
			"E017_INVALID_VERIFIED_RUN_ID",
		);
	});

	it("round-4 needs-fix 1: E017 rejects a non-UUID version string", () => {
		const spec = makeSpec();
		(spec as { lastVerifiedRunId?: unknown }).lastVerifiedRunId =
			"not-a-uuid-just-text-here-12345";
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).toContain(
			"E017_INVALID_VERIFIED_RUN_ID",
		);
	});

	it("round-4 needs-fix 1: E017 still allows an empty string (not yet verified)", () => {
		const spec = makeSpec();
		(spec as { lastVerifiedRunId?: unknown }).lastVerifiedRunId = "";
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E017_INVALID_VERIFIED_RUN_ID",
		);
	});

	it("round-4 needs-fix 1: E017 rejects wrong version digit (must be '4')", () => {
		const spec = makeSpec();
		(spec as { lastVerifiedRunId?: unknown }).lastVerifiedRunId =
			"0192f3a7-9c2e-1c0a-b4e1-1f8c0b1f3a2d";
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).toContain(
			"E017_INVALID_VERIFIED_RUN_ID",
		);
	});

	it("round-4 needs-fix 1: E017 rejects wrong variant digit (must be [89ab])", () => {
		const spec = makeSpec();
		(spec as { lastVerifiedRunId?: unknown }).lastVerifiedRunId =
			"0192f3a7-9c2e-4c0a-04e1-1f8c0b1f3a2d";
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).toContain(
			"E017_INVALID_VERIFIED_RUN_ID",
		);
	});

	it("round-3 Blocker 5: env→OS pairing — Windows + AE 2026 is acceptable", () => {
		const spec = makeSpec({
			environment: {
				os: "windows",
				hostVersionRange: ">=26.5.0",
				aeRequired: true,
				panelState: "post-onboarding",
			},
		});
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E009_MISSING_ENVIRONMENT",
		);
	});

	// Round-4 Blocker D — Scenario Outline Examples validation.
	it("round-4 Blocker D: E018 — outline with empty Examples surfaces E018", () => {
		const spec = makeSpec({ isScenarioOutline: true });
		// gherkin.examples is left empty by `makeSpec` (default has no examples).
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).toContain("E018_OUTLINE_NO_EXAMPLES");
	});

	it("round-4 Blocker D: E018 — outline with Examples block containing 0 rows surfaces E018", () => {
		const spec = makeSpec({
			isScenarioOutline: true,
			gherkin: {
				...makeSpec().gherkin,
				examples: [
					{
						name: "empty",
						headers: ["k"],
						rows: [],
					},
				],
			},
		});
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).toContain("E018_OUTLINE_NO_EXAMPLES");
	});

	it("round-4 Blocker D: E018 — outline with mismatched header/row column counts surfaces E018", () => {
		const spec = makeSpec({
			isScenarioOutline: true,
			gherkin: {
				...makeSpec().gherkin,
				examples: [
					{
						name: "mismatch",
						headers: ["a", "b"],
						rows: [["only-one-column"]],
					},
				],
			},
		});
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).toContain("E018_OUTLINE_NO_EXAMPLES");
	});

	it("round-4 Blocker D: E018 (PASS) — outline with non-empty Examples rows passes", () => {
		const spec = makeSpec({
			isScenarioOutline: true,
			gherkin: {
				...makeSpec().gherkin,
				examples: [
					{
						name: "ok",
						headers: ["k"],
						rows: [["v1"], ["v2"]],
					},
				],
			},
		});
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).not.toContain("E018_OUTLINE_NO_EXAMPLES");
	});

	it("round-4 Blocker D: E018 does NOT fire for non-outline scenarios (empty examples is fine)", () => {
		const spec = makeSpec(); // isScenarioOutline is undefined; examples is empty
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).not.toContain("E018_OUTLINE_NO_EXAMPLES");
	});

	// Round-5 Blocker C — hostVersionRange semver (E019).
	it('round-5 Blocker C: E019 — marketing-year hostVersionRange ">=2026.0.0" is rejected', () => {
		const spec = makeSpec({
			environment: {
				os: "windows",
				hostVersionRange: ">=2026.0.0",
				panelState: "post-onboarding",
			},
		});
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).toContain("E019_INVALID_HOST_VERSION_RANGE");
	});

	it("round-5 Blocker C: E019 — legacy aeVersionRange without hostVersionRange fires migration error", () => {
		const base = makeSpec();
		const spec: ScenarioSpec = {
			...base,
			environment: {
				os: "windows",
				hostVersionRange: "",
				aeVersionRange: ">=2026.0.0",
				panelState: "post-onboarding",
			},
		};
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).toContain("E019_INVALID_HOST_VERSION_RANGE");
	});

	it('round-5 Blocker C: E019 (PASS) — canonical semver hostVersionRange ">=26.5.0" is accepted', () => {
		const spec = makeSpec({
			environment: {
				os: "windows",
				hostVersionRange: ">=26.5.0",
				panelState: "post-onboarding",
			},
		});
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).not.toContain("E019_INVALID_HOST_VERSION_RANGE");
	});

	it("round-5 Blocker C: E019 (PASS) — caret / tilde / exact-pin / exclusive forms all accepted", () => {
		for (const range of [
			">=26.5.0",
			">26.5.0",
			"<=26.5.0",
			"<26.5.0",
			"^26.5.0",
			"~26.5.0",
			"26.5.0",
		]) {
			const spec = makeSpec({
				environment: {
					os: "windows",
					hostVersionRange: range,
					panelState: "post-onboarding",
				},
			});
			const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
			expect(codes).not.toContain("E019_INVALID_HOST_VERSION_RANGE");
		}
	});

	// Round-6 Blocker C — E015b UiOracleVariant runtime shape check.
	it("round-6 Blocker C: E015b — variant.kind outside the allowed union is rejected", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 0
				? {
						...s,
						expectedResult: {
							uiOracle: {
								selector: "[data-settings-sidebar]",
								variant: {
									kind: "hover" as unknown as "presence",
								},
							},
						},
					}
				: s,
		);
		const spec = makeSpec({ procedure });
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).toContain("E015b_INVALID_UI_ORACLE_VARIANT");
	});

	it("round-6 Blocker C: E015b — presence variant without a selector is rejected", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 0
				? {
						...s,
						expectedResult: {
							uiOracle: {
								selector: "",
								variant: { kind: "presence" },
							},
						},
					}
				: s,
		);
		const spec = makeSpec({ procedure });
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).toContain("E015b_INVALID_UI_ORACLE_VARIANT");
	});

	it("round-6 Blocker C: E015b — absence variant without a selector is rejected", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 0
				? {
						...s,
						expectedResult: {
							uiOracle: {
								selector: "",
								variant: { kind: "absence" },
							},
						},
					}
				: s,
		);
		const spec = makeSpec({ procedure });
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).toContain("E015b_INVALID_UI_ORACLE_VARIANT");
	});

	it("round-6 Blocker C: E015b (PASS) — presence variant with a real selector is allowed", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 0
				? {
						...s,
						expectedResult: {
							uiOracle: {
								selector: "[data-settings-sidebar]",
								variant: { kind: "presence" },
							},
						},
					}
				: s,
		);
		const spec = makeSpec({ procedure });
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).not.toContain("E015b_INVALID_UI_ORACLE_VARIANT");
	});

	it("round-6 Blocker C: E015b — attribute variant without attribute name/value is rejected", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 0
				? {
						...s,
						expectedResult: {
							uiOracle: {
								selector: "[data-settings-sidebar]",
								variant: {
									kind: "attribute",
								} as unknown as never,
							},
						},
					}
				: s,
		);
		const spec = makeSpec({ procedure });
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).toContain("E015b_INVALID_UI_ORACLE_VARIANT");
	});

	// Round-7 Blocker 2 — E015b attribute variant reads `variant.attribute`
	// (the canonical path), NOT the legacy `uiOracle.attribute` field.
	// The round-6 validator accidentally read `uiOracle.attribute`, which
	// silently rejected correct specs (variant.attribute set, no
	// uiOracle.attribute) and approved hybrid broken specs (variant.kind
	// presence/absence with uiOracle.attribute set).
	it("round-7 Blocker 2: E015b — variant.attribute set + no uiOracle.attribute is accepted (PASS)", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 0
				? {
						...s,
						expectedResult: {
							uiOracle: {
								selector: "[data-state-tile]",
								variant: {
									kind: "attribute",
									attribute: {
										name: "data-state",
										value: "placed",
									},
								},
							},
						},
					}
				: s,
		);
		const spec = makeSpec({ procedure });
		const result = validateScenarioSpec(spec);
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E015b_INVALID_UI_ORACLE_VARIANT",
		);
	});

	it("round-7 Blocker 2: E015b — variant.attribute missing but uiOracle.attribute set → E015b error", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 0
				? {
						...s,
						expectedResult: {
							uiOracle: {
								selector: "[data-state-tile]",
								attribute: { name: "data-state", value: "placed" },
								variant: { kind: "attribute" } as unknown as never,
							},
						},
					}
				: s,
		);
		const spec = makeSpec({ procedure });
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).toContain("E015b_INVALID_UI_ORACLE_VARIANT");
	});

	it("round-7 Blocker 2: E015b — presence variant + uiOracle.attribute (hybrid) → E015b error", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 0
				? {
						...s,
						expectedResult: {
							uiOracle: {
								selector: "[data-settings-sidebar]",
								attribute: { name: "data-state", value: "open" },
								variant: { kind: "presence" },
							},
						},
					}
				: s,
		);
		const spec = makeSpec({ procedure });
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).toContain("E015b_INVALID_UI_ORACLE_VARIANT");
	});

	it("round-7 Blocker 2: E015b — absence variant + uiOracle.attribute (hybrid) → E015b error", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 0
				? {
						...s,
						expectedResult: {
							uiOracle: {
								selector: "[data-settings-sidebar]",
								attribute: { name: "data-state", value: "closed" },
								variant: { kind: "absence" },
							},
						},
					}
				: s,
		);
		const spec = makeSpec({ procedure });
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).toContain("E015b_INVALID_UI_ORACLE_VARIANT");
	});

	it("round-7 Blocker 2: E015b — both variant.attribute AND uiOracle.attribute set → variant wins, no error", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 0
				? {
						...s,
						expectedResult: {
							uiOracle: {
								selector: "[data-state-tile]",
								// legacy uiOracle.attribute present...
								attribute: { name: "data-legacy", value: "stale" },
								// ...but variant.attribute is the canonical path.
								variant: {
									kind: "attribute",
									attribute: {
										name: "data-state",
										value: "placed",
									},
								},
							},
						},
					}
				: s,
		);
		const spec = makeSpec({ procedure });
		const result = validateScenarioSpec(spec);
		// variant.attribute is well-formed, so E015b must NOT fire.
		// The legacy field is silently ignored (round-5 migration).
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E015b_INVALID_UI_ORACLE_VARIANT",
		);
	});

	it("round-7 Blocker 2: W001 — legacy uiOracle.attribute without variant emits W001_LEGACY_UI_ORACLE_ATTRIBUTE", () => {
		const base = makeSpec();
		const procedure: readonly ProcedureStep[] = base.procedure.map((s, i) =>
			i === 0
				? {
						...s,
						expectedResult: {
							uiOracle: {
								selector: "[data-state-tile]",
								attribute: { name: "data-state", value: "placed" },
							},
						},
					}
				: s,
		);
		const spec = makeSpec({ procedure });
		const result = validateScenarioSpec(spec);
		// W001 is advisory — does NOT fail validation.
		expect(result.errors.map((e) => e.code)).not.toContain(
			"E015b_INVALID_UI_ORACLE_VARIANT",
		);
		const warningCodes = result.warnings.map((w) => w.code);
		expect(warningCodes).toContain("W001_LEGACY_UI_ORACLE_ATTRIBUTE");
	});

	// Round-6 needs-fix 1 — hostVersionRange real semver range grammar.
	it("round-6 needs-fix 1: E019 — multi-comparator range '>=26.5.0 <27.0.0' is accepted", () => {
		const spec = makeSpec({
			environment: {
				os: "windows",
				hostVersionRange: ">=26.5.0 <27.0.0",
				panelState: "post-onboarding",
			},
		});
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).not.toContain("E019_INVALID_HOST_VERSION_RANGE");
	});

	it("round-6 needs-fix 1: E019 — comparator-chain range '>26.5.0 <=27.0.0 || 28.0.0' is accepted", () => {
		const spec = makeSpec({
			environment: {
				os: "windows",
				hostVersionRange: ">26.5.0 <=27.0.0 || 28.0.0",
				panelState: "post-onboarding",
			},
		});
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).not.toContain("E019_INVALID_HOST_VERSION_RANGE");
	});

	it("round-6 needs-fix 1: E019 — dot-dot range '26.5.0..27.0.0' is rejected (not valid semver range syntax)", () => {
		const spec = makeSpec({
			environment: {
				os: "windows",
				hostVersionRange: "26.5.0..27.0.0",
				panelState: "post-onboarding",
			},
		});
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).toContain("E019_INVALID_HOST_VERSION_RANGE");
	});

	it("round-6 needs-fix 1: E019 — marketing-year major '>=2026.0.0' is still rejected after the semver delegation", () => {
		const spec = makeSpec({
			environment: {
				os: "windows",
				hostVersionRange: ">=2026.0.0",
				panelState: "post-onboarding",
			},
		});
		const codes = validateScenarioSpec(spec).errors.map((e) => e.code);
		expect(codes).toContain("E019_INVALID_HOST_VERSION_RANGE");
	});

	// Round-6 needs-fix 1 — AE host-version normalisation helper.
	describe("normalizeAeHostVersion", () => {
		it("round-6 needs-fix 1: AE x-patch '26.5x89' normalises to '26.5.89'", () => {
			expect(normalizeAeHostVersion("26.5x89")).toBe("26.5.89");
		});

		it("round-6 needs-fix 1: canonical X.Y.Z '26.5.89' passes through unchanged", () => {
			expect(normalizeAeHostVersion("26.5.89")).toBe("26.5.89");
		});

		it("round-6 needs-fix 1: X.Y input '26.5' coerces to '26.5.0'", () => {
			expect(normalizeAeHostVersion("26.5")).toBe("26.5.0");
		});

		it("round-6 needs-fix 1: garbage input returns null", () => {
			expect(normalizeAeHostVersion("garbage")).toBeNull();
		});

		it("round-6 needs-fix 1: AE x-patch value '26.5x89' satisfies range '>=26.5.0' after normalisation", async () => {
			const { satisfies } = await import("semver");
			const coerced = normalizeAeHostVersion("26.5x89");
			expect(coerced).not.toBeNull();
			expect(satisfies(coerced as string, ">=26.5.0")).toBe(true);
		});

		it("round-6 needs-fix 1: AE x-patch value '26.5x89' satisfies multi-comparator range '>=26.5.0 <27.0.0' after normalisation", async () => {
			const { satisfies } = await import("semver");
			const coerced = normalizeAeHostVersion("26.5x89");
			expect(coerced).not.toBeNull();
			expect(satisfies(coerced as string, ">=26.5.0 <27.0.0")).toBe(true);
		});
	});
});
