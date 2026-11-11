/**
 * 4-layer scenario specification schema (Issue #147).
 *
 *   Gherkin       = what / why  (canonical `.feature` files, parsed with
 *                               `@cucumber/gherkin`).
 *   Procedure     = how         (ISTQB-aligned JSON artifact; each step
 *                               carries an optional `gherkinRef` linking
 *                               it to the corresponding Gherkin step).
 *   Oracle        = verdict     (measurable only; "properly", "correctly",
 *                               "looks good", "works" are forbidden).
 *   Evidence      = proof       (selector / computed-style / persisted
 *                               state / log-bus assertions).
 *
 * In addition, every scenario declares its Computer-Use execution
 * contract (environment, fixtures, requirement refs, stop conditions,
 * on-failure policy, automation capabilities, postconditions).  The
 * `RunResult` type captures the runner's actual outcome (verdict +
 * per-step evidence + cleanup status).  Runners are NOT implemented in
 * this PR — only the contract is declared and structurally validated.
 *
 * Scenarios are validated by `validator.ts`.  The rule-check Vitest suite
 * (`scenario-rule-runner.test.ts`) walks every spec file and asserts
 * structural validity.  Executing the actions of a scenario (via real AE
 * or Computer Use) is the role of future `real_ae_e2e` runners and is
 * OUT OF SCOPE for this PR.
 */

// ---------------------------------------------------------------------------
// Evidence levels and verdicts.
// ---------------------------------------------------------------------------

type EvidenceLevel =
	| "unit"
	| "component"
	| "simulated_e2e"
	| "scenario_spec"
	| "real_ae_e2e";

/**
 * RunResult verdict.  Verdict is NOT a boolean.
 *
 *   PASS         — both oracles (or the single oracle for non-important
 *                  scenarios) match expected values.
 *   INCONCLUSIVE — evidence insufficient (blank screenshot, computed
 *                  style unavailable, persisted state not readable). Must
 *                  NOT be downgraded to PASS.
 *   BLOCKED      — runner cannot proceed (selector resolves to multiple
 *                  elements, element off-screen, unexpected modal). Stop
 *                  the scenario; do NOT continue past the blocker.
 *   FAIL         — oracle mismatch.
 */
type Verdict = "PASS" | "FAIL" | "BLOCKED" | "INCONCLUSIVE";

// ---------------------------------------------------------------------------
// Gherkin (canonical `.feature` content).
// ---------------------------------------------------------------------------

export type GherkinKind = "Given" | "When" | "Then" | "And" | "But";

export interface GherkinStep {
	/** 0-based position within the parent Scenario's steps array. */
	readonly index: number;
	readonly kind: GherkinKind;
	/** Behavioural prose. No click sequences, no selectors. */
	readonly text: string;
	/** Optional keyword arguments (Gherkin step parameters). */
	readonly argument?: string;
}

/**
 * Scenario-level Gherkin block.  Steps are the parsed Steps of the
 * canonical Gherkin Scenario (NOT the Feature / Rule / Background
 * structure).  Feature-level metadata is captured separately.
 *
 * `background` carries the canonical Background steps in canonical
 * Cucumber order: `[...featureBackground, ...ruleBackground]`
 * (round-3 Blocker 1 — see https://cucumber.hexdocs.pm/feature_files.html).
 * Feature Background applies to every Scenario in the Feature; Rule
 * Background applies to every Scenario in that Rule and APPENDS to
 * Feature Background rather than overriding it.  When neither
 * Background is declared, `background` is an empty array.
 *
 * Background steps are part of the canonical Gherkin preconditions
 * (e.g. "the panel has just finished onboarding", "the catalog is
 * empty") and are NOT counted in `steps.index` —
 * `gherkinRef.stepIndex` continues to refer to the scenario's own
 * visible steps.  The Background surface is preserved so a future
 * Computer-Use runner can reproduce the canonical Gherkin setup.
 */
export interface GherkinBlock {
	/** Stable per-scenario id, matching the parser scenario id. */
	readonly scenarioId: string;
	readonly scenarioName: string;
	readonly steps: readonly GherkinStep[];
	readonly tags: readonly string[];
	/**
	 * Canonical `.feature` Background steps in canonical Cucumber order
	 * `[...featureBackground, ...ruleBackground]`.  Steps belong to
	 * the Feature / Rule and run before every Scenario.  They are NOT
	 * included in the `steps` count and are NOT addressable via
	 * `gherkinRef.stepIndex`.
	 */
	readonly background: readonly GherkinStep[];
	/**
	 * Round-4 Blocker D — `Scenario Outline` Examples blocks for
	 * this scenario, surfaced from the canonical `.feature` parser.
	 * Empty array for plain `Scenario` blocks.  The validator (rule
	 * E018) requires that a scenario declaring `isScenarioOutline:
	 * true` carries at least one non-empty Examples block.
	 */
	readonly examples: readonly ExampleBlock[];
}

export interface GherkinFeature {
	readonly featureName: string;
	readonly featureDescription: string;
	readonly rules: readonly GherkinRule[];
	/** Source file path (relative to repo root). */
	readonly source: string;
}

export interface GherkinRule {
	readonly ruleName: string;
	readonly scenarios: readonly GherkinScenario[];
}

export interface GherkinScenario {
	readonly id: string;
	readonly name: string;
	readonly tags: readonly string[];
	readonly steps: readonly GherkinStep[];
	/**
	 * Canonical `.feature` Background steps that apply to this
	 * scenario, in canonical Cucumber order
	 * `[...featureBackground, ...ruleBackground]`.  Feature
	 * Background applies to every Scenario in the Feature; Rule
	 * Background applies to every Scenario in that Rule and APPENDS
	 * to the Feature Background.  Round-3 Blocker 1 fixes round-2's
	 * over-write that replaced Feature with Rule.
	 */
	readonly background: readonly GherkinStep[];
	/**
	 * Scenario Outline data blocks (round-4 Blocker D).  Empty for
	 * plain `Scenario` blocks; one entry per `Examples:` section
	 * declared on a `Scenario Outline`.  The keys of `headers` are
	 * the column names and `rows[i]` is the i-th example row.
	 * Procedure steps that want to bind to a specific example row
	 * reference it via `gherkinRef.exampleRow` (0-based); when
	 * omitted the procedure applies to every row (the runner is
	 * responsible for fan-out at execution time).
	 */
	readonly examples: readonly ExampleBlock[];
}

/**
 * A single `Examples:` table from a Cucumber `Scenario Outline`.
 * One outline scenario can declare multiple Examples blocks; each
 * is exposed independently so the validator (rule E018) can reject
 * empty Examples and so the runner can iterate one block at a time
 * (round-4 Blocker D).
 */
export interface ExampleBlock {
	/**
	 * Optional `Examples:` keyword argument — Cucumber lets you
	 * name a block with a trailing colon (`Examples: <name>`).  When
	 * the block is unnamed this is the empty string.
	 */
	readonly name: string;
	/** Column names from the Examples header row. */
	readonly headers: readonly string[];
	/** Data rows (excluding the header row). */
	readonly rows: readonly (readonly string[])[];
}

// ---------------------------------------------------------------------------
// Oracles.
// ---------------------------------------------------------------------------

/**
 * UI oracle variants (round-5 Blocker B).
 *
 *   - `attribute` — the panel-rendered element carries a `data-*`
 *     attribute with the declared value.  Used when production code
 *     tags an element with `data-state="..."` etc.
 *   - `presence` — the element MOUNTS into the DOM.  Used when the
 *     panel mounts a surface (e.g. `[data-settings-sidebar]`) only while
 *     it is visible and UNMOUNTS it on dismiss; production code does
 *     NOT keep the element present with `data-state="closed"`.
 *   - `absence` — the element is NO LONGER in the DOM.  Symmetric
 *     counterpart to `presence` and the canonical oracle for "panel
 *     dialog was closed" / "panel widget returned to home".
 *
 * A `UiOracleAssertion` carries exactly ONE of `attribute`, `presence`,
 * or `absence`.  Validator rule E015b enforces the one-of shape.
 */
export type UiOracleVariant =
	| {
			readonly kind: "attribute";
			readonly computedStyle?: Readonly<Record<string, string>>;
			readonly textContent?: string;
			readonly attribute: { readonly name: string; readonly value: string };
	  }
	| { readonly kind: "presence" }
	| { readonly kind: "absence" };

export interface UiOracleAssertion {
	readonly selector: string;
	readonly computedStyle?: Readonly<Record<string, string>>;
	readonly textContent?: string;
	readonly attribute?: { readonly name: string; readonly value: string };
	/**
	 * Round-5 Blocker B — explicit oracle variant.  When present the
	 * validator picks the oracle by variant; when absent (legacy
	 * shape) the validator treats `attribute` as the default oracle
	 * for backwards-compatible fixtures that were authored before the
	 * presence/absence split.
	 */
	readonly variant?: UiOracleVariant;
}

/**
 * Host-state oracle for AE-native UI (AE Settings dialog, Project
 * panel, Composition panel, etc.).  AE-owned surfaces cannot be
 * addressed via CEP DOM selectors (round-2 Blocker D).  Instead the
 * runner captures the AE-side state via the canonical host bridge
 * (`evalScript` path) or via a visual anchor (screenshot).  The
 * `expected.equals` / `expected.contains` predicates are matched
 * against the captured value (string for evalScript, JSON for
 * scripted probes).
 */
interface HostStateOracleAssertion {
	readonly method: "evalScript" | "screenshot";
	readonly script?: string;
	readonly anchor?: string;
	readonly expected: {
		readonly equals?: string;
		readonly contains?: string;
		readonly matches?: string;
	};
}

interface PersistenceOracleAssertion {
	readonly storageKey: string;
	readonly expected: unknown;
}

interface LogBusAssertion {
	readonly scope: string;
	readonly minLevel: "debug" | "info" | "warn" | "error";
	readonly messageContains: string;
	readonly id?: string;
}

export interface ExpectedResult {
	readonly uiOracle?: UiOracleAssertion;
	readonly persistenceOracle?: PersistenceOracleAssertion;
	readonly logOracle?: LogBusAssertion;
	readonly hostStateOracle?: HostStateOracleAssertion;
}

interface OracleSection {
	readonly ui?: UiOracleAssertion;
	readonly persistence?: PersistenceOracleAssertion;
	readonly hostState?: HostStateOracleAssertion;
	readonly dual: boolean;
}

// ---------------------------------------------------------------------------
// Procedure steps (separate JSON artifact, linked by scenario id).
// ---------------------------------------------------------------------------

/**
 * Link from a ProcedureStep to a Gherkin step.  This replaces the
 * previous 1:1 positional correspondence: each Procedure step MAY
 * reference exactly one Gherkin step, and Gherkin steps MAY be
 * referenced by 0..N Procedure steps (e.g. one Gherkin `When` may
 * expand into a mutation step + a checkpoint step in Procedure).
 */
interface GherkinStepRef {
	readonly scenarioId: string;
	readonly stepIndex: number;
	/**
	 * Round-4 Blocker D — for `Scenario Outline` procedures, the
	 * 0-based index of the row in the referenced Examples block
	 * the step applies to.  When omitted the procedure applies to
	 * ALL example rows (the runner expands it into one logical
	 * run per row at execution time).
	 */
	readonly exampleRow?: number;
}

export interface ProcedureStep {
	/** Stable per-scenario id ("step-1", "step-2", ...). */
	readonly id: string;
	readonly gherkinRef?: GherkinStepRef;
	readonly preconditions: readonly string[];
	readonly input: unknown;
	readonly action: string;
	readonly expectedResult: ExpectedResult;
	readonly postconditions: readonly string[];

	/**
	 * Declares whether this step mutates persisted or visible state
	 * (creating a preset, dragging to a different surface tile, clicking
	 * Delete, etc.).  When true, the IMMEDIATELY NEXT ProcedureStep MUST
	 * have `checkpoint: true` (rule E003).
	 *
	 * Mutation steps also require cleanup under rule E004 — see
	 * `noCleanupReason` and the scenario-level `cleanup` block.
	 */
	readonly mutation: boolean;

	/** Re-observe checkpoint for the previous mutation step. */
	readonly checkpoint: boolean;

	/**
	 * Mandatory when `mutation === true` and the scenario has no
	 * scenario-level `cleanup` block.  Free-form, but MUST be non-empty
	 * and MUST NOT contain forbidden oracle wording.
	 */
	readonly noCleanupReason?: string;
}

// ---------------------------------------------------------------------------
// Evidence.
// ---------------------------------------------------------------------------

interface EvidenceSection {
	readonly screenshotSelectors: readonly string[];
	readonly computedStyleSnapshots: readonly string[];
	readonly persistedStateDumps: readonly string[];
	readonly logAssertions: readonly LogBusAssertion[];
}

// ---------------------------------------------------------------------------
// Computer Use execution contract (Issue #147).
// ---------------------------------------------------------------------------

/**
 * The host platform the runner must be on for the scenario to be
 * considered runnable.  Drivers and runners gate scenarios on
 * environment match before attempting execution.
 *
 * `aeRequired` — round-3 Blocker 4: when true, the scenario needs
 * the AE host bridge to open a real `.aep` file.  The validator
 * (rule E016) then requires at least one FixtureSpec to declare a
 * `projectPath`.  Scenarios that only run inside the panel CEP UI
 * (no AE host bridge) MUST set `aeRequired: false` so the validator
 * does not insist on an `.aep` they do not need.
 */
/**
 * `hostVersionRange` (round-5 Blocker C) — semver range for the
 * canonical After Effects host version (e.g. `">=26.5.0"`).  The
 * marketing year mark (`2026`) is NOT the host version — AE 2026
 * reports `26.5.x` as its `app.version`.  Validator rule E019
 * rejects any value that does not parse as semver range syntax.
 *
 * `aeVersionRange` (DEPRECATED round-5 Blocker C) — kept on the
 * shape ONLY so round-3 / round-4 era fixtures that still carry
 * the marketing-year string surface a clear E019 error during
 * validation instead of a generic "Unknown field" warning.  When
 * `hostVersionRange` is present the validator ignores
 * `aeVersionRange`; when `aeVersionRange` is present without
 * `hostVersionRange` the validator emits E019 with the deprecated
 * field name so the curator can fix it without a separate trip.
 */
interface EnvironmentSpec {
	readonly os: "macos" | "windows" | "linux";
	readonly hostVersionRange: string;
	/** @deprecated round-5 Blocker C — use `hostVersionRange` (semver). */
	readonly aeVersionRange?: string;
	readonly panelState: string;
	readonly aeRequired?: boolean;
	readonly locale?: string;
	readonly notes?: string;
}

/**
 * Initial data the scenario requires to be runnable.  The runner
 * materialises each fixture before the scenario begins and tears it
 * down after (per `cleanup` block or `noCleanupReason`).
 *
 * `projectPath` — round-3 Blocker 4: path to a real `.aep` file
 * the runner opens via the host bridge.  Either repo-root-relative
 * (when a checked-in fixture is added later under `fixtures/aep/`)
 * OR absolute on the validation host.  Required when
 * `environment.aeRequired === true` (validator rule E016).  Optional
 * otherwise — fixtures of kind `preset` / `catalog-entry` / etc.
 * carry no `.aep` and declare no `projectPath`.
 */
interface FixtureSpec {
	readonly id: string;
	readonly kind:
		| "preset"
		| "catalog-entry"
		| "workspace-layout"
		| "group"
		| "settings"
		| "online-state";
	readonly identifier: string;
	readonly initialState: unknown;
	readonly projectPath?: string;
}

/**
 * Traceability link from the scenario to the source-of-truth design
 * artefact.  Used by CI to ensure scenarios are not orphaned.
 */
interface RequirementRef {
	readonly type: "issue" | "adr" | "design-doc" | "runbook";
	readonly id: string;
	readonly note?: string;
}

/**
 * Condition under which the runner MUST stop the scenario early
 * (verdict BLOCKED).  Stop conditions are not oracle failures — they
 * signal that the runner cannot safely proceed.
 */
interface StopCondition {
	readonly trigger:
		| "selector-multimatch"
		| "selector-missing"
		| "modal-unexpected"
		| "state-inconsistent"
		| "log-error-spike"
		| "fixture-missing"
		| "capability-missing";
	readonly description: string;
}

/**
 * What the runner captures on failure (evidence) and what side-effects
 * it MUST NOT perform (so a failing run does not corrupt persistent
 * state beyond the cleanup scope).
 */
interface FailurePolicy {
	readonly capture: readonly string[];
	readonly doNot: readonly string[];
}

/**
 * Capabilities the runner must have to execute this scenario.  Used to
 * gate execution against the available runner surface (real AE driver,
 * Computer Use driver, etc.).
 */
export type Capability =
	| "click"
	| "type"
	| "drag"
	| "scroll"
	| "selector-resolve"
	| "computed-style-snapshot"
	| "persisted-state-read"
	| "log-bus-read"
	| "modal-detect"
	| "process-restart"
	| "panel-reload"
	| "cross-panel-bus";

interface AutomationContract {
	readonly requiredCapabilities: readonly Capability[];
}

// ---------------------------------------------------------------------------
// ScenarioSpec.
// ---------------------------------------------------------------------------

export interface ScenarioSpec {
	readonly id: string;
	readonly title: string;
	readonly description?: string;
	readonly evidenceLevel: EvidenceLevel;
	readonly gherkin: GherkinBlock;
	readonly procedure: readonly ProcedureStep[];
	readonly oracles: OracleSection;
	readonly evidence: EvidenceSection;
	/** Optional cleanup block. Required when any step has `mutation: true`. */
	readonly cleanup?: readonly ProcedureStep[];
	/**
	 * Round-4 Blocker D — when `true`, `gherkin.steps` is the
	 * outline's TEMPLATE and `gherkin.examples` MUST declare at
	 * least one non-empty Examples block (validator rule E018).
	 * When omitted (or `false`) the scenario is a plain Scenario.
	 */
	readonly isScenarioOutline?: boolean;

	// Computer Use execution contract (Issue #147).
	readonly environment: EnvironmentSpec;
	readonly fixtures: readonly FixtureSpec[];
	readonly requirementRefs: readonly RequirementRef[];
	readonly stopConditions: readonly StopCondition[];
	readonly onFailure: FailurePolicy;
	readonly automation: AutomationContract;
	readonly postconditions: readonly string[];
}

// ---------------------------------------------------------------------------
// RunResult (separate from ScenarioSpec).
//
// Round-2 Blocker C: this contract is durable enough for Computer-Use
// auditability.  Each captured run carries the full execution context
// (run_id, resolved_environment), per-step evidence with a PASS / FAIL
// / BLOCKED / INCONCLUSIVE verdict, an artifact list with paths to the
// captured screenshots / log-bus tail / persisted-state dump /
// computed-style snapshot, and a `required_evidence_satisfied` flag so
// the audit can verify that the runner captured what the scenario
// declared as required.
// ---------------------------------------------------------------------------

/**
 * Real OS / AE version / panel state / locale as captured at run
 * start.  Distinct from `EnvironmentSpec` (the declared contract) so
 * the audit can spot drift between declared and observed.
 */
interface ResolvedEnvironment {
	readonly os: "macos" | "windows" | "linux";
	readonly osVersion: string;
	readonly aeVersion: string;
	readonly panelState: string;
	readonly locale: string;
	readonly resolvedAt: string;
}

/**
 * Per-step run status — distinct from the scenario-level `Verdict`.
 * A step can fail (FAIL) even when the scenario overall is BLOCKED,
 * and a step can be inconclusive (INCONCLUSIVE) when its evidence
 * is missing.
 */
type StepStatus = "PASS" | "FAIL" | "BLOCKED" | "INCONCLUSIVE";

/**
 * Captured artifact: an evidence file the runner produced during the
 * run.  `path` is repo-root-relative so the audit pipeline can locate
 * the file without the original runner context.
 */
interface CapturedArtifact {
	readonly kind:
		| "screenshot"
		| "log-bus-tail"
		| "persisted-state-dump"
		| "computed-style-snapshot"
		| "host-script-result"
		| "diagnostic-bundle";
	readonly path: string;
	readonly capturedAt: string;
	readonly bytes?: number;
	readonly sha256?: string;
}

/**
 * Observed evidence for a single step.  At least one of the optional
 * fields is populated; the runner picks the cheapest capture route.
 */
interface ObservedEvidence {
	readonly ui?: UiOracleAssertion;
	readonly persistence?: PersistenceOracleAssertion;
	readonly log?: LogBusAssertion;
	readonly hostState?: HostStateOracleAssertion;
}

/**
 * Per-step evidence record.  Replaces the round-1 `StepEvidence`:
 * the runner MUST record a `status` (PASS / FAIL / BLOCKED /
 * INCONCLUSIVE) per step and the list of captured artifacts.  An
 * empty `capturedArtifacts` with `status === "PASS"` triggers
 * `required_evidence_satisfied = false` at the run level.
 */
interface StepResult {
	readonly stepId: string;
	readonly status: StepStatus;
	readonly observed: ObservedEvidence;
	readonly passed: boolean;
	readonly capturedArtifacts: readonly CapturedArtifact[];
	readonly failureMessage?: string;
	readonly notes?: string;
}

/**
 * Failure context captured when the scenario verdict is BLOCKED or
 * FAIL.  `failureStep` names the step that threw / blocked and
 * `failureMessage` carries the error / stop-condition payload.
 */
interface FailureContext {
	readonly failureStep: string;
	readonly failureMessage: string;
	readonly stopCondition?: string;
	readonly capturedAt: string;
}

interface CleanupResult {
	readonly executed: boolean;
	readonly verified: boolean;
	readonly remainingState: readonly string[];
	readonly failureReason?: string;
}

/**
 * Audit-durable run record.  Required for Computer-Use replay:
 * every run has a UUID run_id, the resolved environment, an artifact
 * list with paths the auditor can open, per-step verdicts, and an
 * aggregate verdict that the runner cannot downgrade.
 */
export interface RunResult {
	readonly runId: string;
	readonly scenarioId: string;
	readonly verdict: Verdict;
	readonly startedAt: string;
	readonly endedAt: string;
	readonly resolvedEnvironment: ResolvedEnvironment;
	readonly stepResults: readonly StepResult[];
	readonly artifactList: readonly CapturedArtifact[];
	readonly requiredEvidenceSatisfied: boolean;
	readonly cleanup: CleanupResult;
	readonly failure?: FailureContext;
	readonly notes?: string;
}
