/**
 * Schema validator for scenario specs (Issue #147, 5-blocker rework).
 *
 * This is the structural rule-check engine.  It is deliberately
 * side-effect free and consumes only the types declared in `types.ts`.
 * The Vitest rule-runner (`scenario-rule-runner.test.ts`) wires each
 * rule to a top-level `it()` so the human-CI feedback names the failing
 * rule code.
 *
 * Rule codes:
 *
 *   E001  Duplicate scenario id within the suite.
 *   E003  Mutation step without an immediately-following checkpoint step.
 *         If `procedure[i].mutation === true`,
 *         then `procedure[i+1].checkpoint === true`.  The last step
 *         MAY NOT be a mutation (terminal checkpoint is impossible).
 *   E004  Mutation step without either a scenario-level `cleanup` block
 *         or a per-step `noCleanupReason` annotation.  Every persistent
 *         state mutation (create / place / move / etc.) requires cleanup
 *         or an explicit fixture-isolation reason.
 *   E005  Forbidden oracle wording detected. Case-insensitive word-boundary
 *         regex against: `properly`, `correctly`, `looks good`, `works`.
 *   E006  Scenario declared important (`oracles.dual === true`) but missing
 *         either `uiOracle` or `persistenceOracle` on the `oracles` block,
 *         or whose title contains the keyword `cross-panel` / `restart` /
 *         `reload` / `persists` without declaring dual oracles.
 *   E007  Invalid evidence level (must be one of the allowed set).
 *   E008  Missing evidence section (every scenario must carry one).
 *   E009  Missing environment spec (every scenario must declare OS, AE
 *         version range, and panel state).
 *   E010  Missing stop conditions (every scenario must declare at least
 *         one stop condition so the runner knows when to abort).
 *   E011  Missing automation capabilities (every scenario must declare
 *         `automation.requiredCapabilities` non-empty).
 *   E012  Gherkin step reference is unresolvable: a Procedure step's
 *         `gherkinRef.scenarioId` does not exist OR the
 *         `gherkinRef.stepIndex` is out of range OR the Gherkin steps
 *         are not referenced by any Procedure step (orphan Gherkin).
 *   E013  Mutation without cleanup reason AND no scenario-level cleanup
 *         AND no per-step `noCleanupReason`.  Equivalent to E004 — kept
 *         separate for migration clarity; see E004 for canonical code.
 *   E014  Required capability is missing from the declared
 *         `automation.requiredCapabilities` for a step that needs it
 *         (e.g. mutation step needs `persisted-state-read`).
 *   E015  Synthetic selector: a Procedure step's `uiOracle.selector` is
 *         NOT in the real-anchor whitelist (`real-anchors.ts`).  Round-2
 *         Blocker D forbids synthetic test IDs that have no
 *         production counterpart.  AE-native UI must use
 *         `hostStateOracle` instead.
 *   E015b UiOracleVariant shape (round-6 Blocker C): when a Procedure
 *         step's `uiOracle.variant` is set, the variant MUST be one of
 *         the allowed union members (`attribute` / `presence` /
 *         `absence`) AND it MUST be internally consistent (e.g. a
 *         `presence` / `absence` variant requires a non-empty
 *         `selector` on the parent `uiOracle`).  The round-5
 *         declaration claimed E015b existed; the validator did not
 *         enforce it.  Round-6 lands the runtime check so a
 *         mis-authored spec fails at validation rather than at the
 *         runner.
 *   E016  Missing AE fixture: a scenario whose `environment.aeRequired
 *         === true` (round-3 Blocker 4) MUST declare at least one
 *         FixtureSpec with a non-empty `projectPath` so the runner
 *         has a real `.aep` to open.  Without it the runner cannot
 *         materialise the host-side preconditions the scenario
 *         depends on.
 *   E017  Verified-run-id format: a scenario's
 *         `lastVerifiedRunId` (when non-empty) MUST match the
 *         canonical UUID format `/^[0-9a-f-]{36}$/i`.  Anything else
 *         is rejected so empty / prose strings cannot be
 *         mis-read as "verified" by future consumers (round-3
 *         needs-fix 1).
 *   E019  hostVersionRange semver (round-5 Blocker C; tightened in
 *         round-6 needs-fix 1): a scenario's
 *         `environment.hostVersionRange` MUST parse as a real
 *         semver range expression (e.g. `">=26.5.0 <27.0.0"`).
 *         The validator delegates to Node's `semver` package — no
 *         hand-rolled regex.  AE host versions are reported as
 *         `26.5.x`; the runner normalises AE's `x`-patch format
 *         (`26.5x89` → `26.5.89`) via `normalizeAeHostVersion` so the
 *         range expression can use the canonical `X.Y.Z` shape.
 *         When the legacy `environment.aeVersionRange` field is
 *         present without `hostVersionRange`, E019 fires with a
 *         clear migration message.
 *   E018  Scenario Outline with no Examples rows: a scenario that
 *         declares `isScenarioOutline: true` MUST carry at least
 *         one `Examples:` block with at least one data row, and the
 *         block's header column count MUST equal each row's column
 *         count.  An empty Examples block silently drops Cucumber
 *         semantic data, so round-4 Blocker D forbids it at
 *         validation time.
 *
 *         Note on E017 — round-4 needs-fix 1 tightened the canonical
 *         UUID pattern from `/^[0-9a-f-]{36}$/i` (which accepted 36
 *         hyphens or arbitrary hex-dash mixes) to the canonical
 *         UUID v4 layout `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-
 *         [89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`.  The variant digit is
 *         fixed to `4` (UUID v4) and the version field is fixed to
 *         `[89ab]` (UUID v4 variant bits) — see RFC 4122 §4.4.
 */

import { coerce, validRange } from "semver";

import { isSelectorStrictWhitelisted } from "./real-anchors";
import type {
	Capability,
	ExpectedResult,
	ProcedureStep,
	ScenarioSpec,
	UiOracleAssertion,
	UiOracleVariant,
} from "./types";

// Marketing-year-shape guard: AE's host version is bounded (AE 2026
// is reported as 26.5.x, not 2026.5.x).  We accept semver ranges
// freely but reject any comparator whose MAJOR part is >= 100, which
// is the only sensible cut-off — a year-style "2026.0.0" or "2099.x"
// cannot be a real AE host version.  We only need to look at the
// literal source tokens, not at the resolved range, because the
// validator runs at authoring time and the user controls the tokens.
const MAJOR_YEAR_RE = /\b\d{3,}\.[0-9]+(?:\.[0-9]+)?\b/;

export const ALLOWED_EVIDENCE_LEVELS = [
	"unit",
	"component",
	"simulated_e2e",
	"scenario_spec",
	"real_ae_e2e",
] as const;

export const FORBIDDEN_ORACLE_WORDS = [
	"properly",
	"correctly",
	"looks good",
	"works",
] as const;

const FORBIDDEN_WORD_PATTERNS: readonly RegExp[] = FORBIDDEN_ORACLE_WORDS.map(
	(word) => new RegExp(`\\b${word.replace(/[\s]+/g, "\\s+")}\\b`, "i"),
);

export const IMPORTANT_TITLE_KEYWORDS = [
	"cross-panel",
	"persists-after-restart",
	"reload",
	"restart",
] as const;

const REQUIRED_CAPABILITIES_PER_MUTATION: readonly Capability[] = [
	"persisted-state-read",
];

interface ValidationError {
	readonly code: string;
	readonly message: string;
	readonly stepId?: string;
}

export interface ScenarioValidationResult {
	readonly id: string;
	readonly errors: readonly ValidationError[];
	/**
	 * Round-7 Blocker 2 — advisory warnings (e.g. legacy shape
	 * migration hints).  Warnings do NOT fail validation but surface
	 * curator-action items.  Empty when no warnings were emitted.
	 */
	readonly warnings: readonly ValidationWarning[];
}

export interface SuiteValidationResult {
	readonly results: readonly ScenarioValidationResult[];
	readonly errors: readonly ValidationError[];
	readonly warnings: readonly ValidationWarning[];
	readonly scenarios: readonly ScenarioSpec[];
}

const hasForbiddenWord = (text: string): string | null => {
	for (let i = 0; i < FORBIDDEN_ORACLE_WORDS.length; i += 1) {
		const word = FORBIDDEN_ORACLE_WORDS[i];
		const pattern = FORBIDDEN_WORD_PATTERNS[i];
		if (pattern.test(text)) return word;
	}
	return null;
};

const forbiddenWordError = (
	field: string,
	stepId: string | undefined,
	word: string,
): ValidationError => ({
	code: "E005_FORBIDDEN_WORD",
	message: `Forbidden oracle wording "${word}" in ${field}. Use measurable artefacts only (DOM selector with computed-style or text-content assertion; persisted state key; log-bus entry).`,
	stepId,
});

/**
 * Walks every reachable string in the spec and emits one E005 error per
 * forbidden word found in PROSE-shaped fields.  Identifier-shaped fields
 * (selector, scope, storageKey, attribute.name, action verb, input) are
 * skipped because substring-matching the forbidden words against
 * identifiers yields false positives such as the substring `works` inside
 * `workspace`.
 */
const IDENTIFIER_FIELD_NAMES = new Set([
	"id",
	"selector",
	"scope",
	"storageKey",
	"evidenceLevel",
	"action",
	"input",
	"attribute",
	"name",
	"value",
	"screenshotSelectors",
	"computedStyleSnapshots",
	"persistedStateDumps",
	"expected",
	"stepId",
	"messageContains",
	"trigger",
	"type",
	"os",
	"aeVersionRange",
	"hostVersionRange",
	"panelState",
	"locale",
	"identifier",
	"capture",
	"doNot",
	"requiredCapabilities",
	"fixture-missing",
]);

const findForbiddenWordsIn = (
	value: unknown,
	path: string,
	stepId: string | undefined,
	out: ValidationError[],
): void => {
	if (value == null) return;
	if (typeof value === "string") {
		const lastDot = path.lastIndexOf(".");
		const fieldName = lastDot >= 0 ? path.slice(lastDot + 1) : path;
		if (IDENTIFIER_FIELD_NAMES.has(fieldName)) return;
		const word = hasForbiddenWord(value);
		if (word !== null) {
			out.push(forbiddenWordError(path, stepId, word));
		}
		return;
	}
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i += 1) {
			findForbiddenWordsIn(value[i], `${path}[${i}]`, stepId, out);
		}
		return;
	}
	if (typeof value === "object") {
		for (const [k, v] of Object.entries(value)) {
			findForbiddenWordsIn(v, `${path}.${k}`, stepId, out);
		}
	}
};

const checkMutationCheckpoint = (
	procedure: readonly ProcedureStep[],
	errors: ValidationError[],
): void => {
	if (procedure.length === 0) return;
	for (let i = 0; i < procedure.length; i += 1) {
		const step = procedure[i];
		if (!step.mutation) continue;
		const next = procedure[i + 1];
		if (next === undefined) {
			errors.push({
				code: "E003_MUTATION_NO_CHECKPOINT",
				message: `Procedure step "${step.id}" declares mutation but is the final step; an immediately-following checkpoint is required.`,
				stepId: step.id,
			});
			continue;
		}
		if (!next.checkpoint) {
			errors.push({
				code: "E003_MUTATION_NO_CHECKPOINT",
				message: `Procedure step "${step.id}" is a mutation; the immediately-following step "${next.id}" must declare checkpoint: true (re-observe before the next action).`,
				stepId: step.id,
			});
		}
	}
};

/**
 * E004 — mutation requires cleanup.  Triggers on every
 * `procedure[i].mutation === true`, not just destructive.
 */
const checkMutationCleanup = (
	spec: ScenarioSpec,
	errors: ValidationError[],
): void => {
	const hasCleanup = (spec.cleanup?.length ?? 0) > 0;
	for (const step of spec.procedure) {
		if (!step.mutation) continue;
		if (hasCleanup) continue;
		const reason = step.noCleanupReason;
		if (typeof reason !== "string" || reason.trim().length === 0) {
			errors.push({
				code: "E004_MUTATION_NO_CLEANUP",
				message: `Procedure step "${step.id}" declares mutation but the scenario has no cleanup block and the step has no non-empty noCleanupReason. Persistent state created by the mutation will leak across runs.`,
				stepId: step.id,
			});
			continue;
		}
		const word = hasForbiddenWord(reason);
		if (word !== null) {
			errors.push(
				forbiddenWordError(`noCleanupReason of "${step.id}"`, step.id, word),
			);
		}
	}
};

/**
 * E012 — every Procedure step's gherkinRef must resolve to a real
 * Gherkin step in the parent scenario.  Also: orphan detection — any
 * Gherkin step that is referenced by NO Procedure step must surface
 * as a warning-level error (orphans indicate Gherkin / Procedure drift).
 *
 * `And` / `But` steps are Gherkin conjunctions: they continue the
 * previous `Given` / `When` / `Then` step rather than introduce a new
 * step.  They are excluded from the orphan check because the
 * immediately-preceding non-conjunction step already covers them.
 */
const isConjunction = (kind: string): boolean =>
	kind === "And" || kind === "But";

const checkGherkinRefs = (
	spec: ScenarioSpec,
	errors: ValidationError[],
): void => {
	const gherkinStepCount = spec.gherkin.steps.length;
	const referenced = new Set<number>();

	for (const step of spec.procedure) {
		const ref = step.gherkinRef;
		if (!ref) continue;
		if (ref.scenarioId !== spec.gherkin.scenarioId) {
			errors.push({
				code: "E012_GHERKIN_REF_NOT_FOUND",
				message: `Procedure step "${step.id}" gherkinRef.scenarioId "${ref.scenarioId}" does not match the scenario id "${spec.gherkin.scenarioId}".`,
				stepId: step.id,
			});
			continue;
		}
		if (ref.stepIndex < 0 || ref.stepIndex >= gherkinStepCount) {
			errors.push({
				code: "E012_GHERKIN_REF_NOT_FOUND",
				message: `Procedure step "${step.id}" gherkinRef.stepIndex ${ref.stepIndex} is out of range (gherkin has ${gherkinStepCount} steps).`,
				stepId: step.id,
			});
			continue;
		}
		referenced.add(ref.stepIndex);
		// Conjunction continuation: when a Procedure step references a
		// Given/When/Then at index i, any And/But steps at i+1, i+2, …
		// (until the next non-conjunction) are automatically covered.
		for (let j = ref.stepIndex + 1; j < gherkinStepCount; j += 1) {
			if (!isConjunction(spec.gherkin.steps[j].kind)) break;
			referenced.add(j);
		}
	}

	for (let i = 0; i < gherkinStepCount; i += 1) {
		const gherkinStep = spec.gherkin.steps[i];
		if (isConjunction(gherkinStep.kind)) continue;
		if (!referenced.has(i)) {
			errors.push({
				code: "E012_GHERKIN_REF_NOT_FOUND",
				message: `Gherkin step #${i} ("${gherkinStep.kind} ${gherkinStep.text}") is not referenced by any Procedure step. Each Gherkin step must trace to at least one Procedure step (or be an orphan marker).`,
			});
		}
	}
};

/**
 * E014 — every mutation step implies that the runner must read the
 * persisted state.  The capability must appear in
 * `automation.requiredCapabilities`.
 */
const checkRequiredCapabilities = (
	spec: ScenarioSpec,
	errors: ValidationError[],
): void => {
	const declared = new Set<Capability>(spec.automation.requiredCapabilities);
	for (const step of spec.procedure) {
		if (!step.mutation) continue;
		for (const required of REQUIRED_CAPABILITIES_PER_MUTATION) {
			if (!declared.has(required)) {
				errors.push({
					code: "E011_MISSING_AUTOMATION_CAPS",
					message: `Procedure step "${step.id}" is a mutation but the scenario does not declare automation.requiredCapabilities "${required}".`,
					stepId: step.id,
				});
				break; // one error per step is enough
			}
		}
	}
};

/**
 * E015 — every Procedure step's `uiOracle.selector` MUST resolve to a
 * real production `data-*` anchor (whitelisted in `real-anchors.ts`).
 *
 * Round-2 Blocker D forbids synthetic test IDs that have no
 * production counterpart.  AE-native UI must be addressed via
 * `hostStateOracle` (evalScript / screenshot) instead of a CEP DOM
 * selector.
 *
 * Also walks `evidence.screenshotSelectors` and
 * `evidence.computedStyleSnapshots` — every selector-shaped entry
 * MUST be whitelisted (the `computed-style:` prefix on snapshots is
 * stripped before matching).
 *
 * Round-3 Blocker 2 — strict mode.  Round-2's `isSelectorWhitelisted`
 * returned true when ANY whitespace-separated token matched a
 * whitelist pattern (compound selectors like `[data-x] .ghost` would
 * pass because `[data-x]` matched).  Round-3 flips the polarity:
 * EVERY token must match a whitelist pattern, except when the
 * selector is a single host-state-oracle token starting with
 * `evalScript:` / `screenshot:` / `css:` (those are not selectors —
 * they are script identifiers and are excluded from the rule).
 * Production-source existence check on the whitelist itself lives
 * separately in `real-anchors.ts` and is exercised by
 * `real-anchors.test.ts` so a stale anchor cannot pass CI.
 */
const syntheticSelectorError = (
	selector: string,
	stepId: string | undefined,
): ValidationError => ({
	code: "E015_SYNTHETIC_SELECTOR",
	message:
		`Selector "${selector}" is not in the real-anchor whitelist (src/shared/scenario/real-anchors.ts). ` +
		`Round-2 Blocker D forbids synthetic test IDs that have no production counterpart. ` +
		`Either anchor on a real data-* attribute (see real-anchors.ts for the whitelist) or use hostStateOracle for AE-native UI.`,
	stepId,
});

const checkSelectorInExpectedResult = (
	expected: ExpectedResult,
	stepId: string | undefined,
	errors: ValidationError[],
): void => {
	const uiSelector = expected.uiOracle?.selector;
	if (typeof uiSelector === "string" && uiSelector.length > 0) {
		if (!isSelectorStrictWhitelisted(uiSelector)) {
			errors.push(syntheticSelectorError(uiSelector, stepId));
		}
	}
};

/**
 * E015b — `UiOracleVariant` runtime shape check (round-6 Blocker C,
 * tightened in round-7 Blocker 2).
 *
 * The round-5 type definition documents "Validator rule E015b enforces
 * the one-of shape" but the validator never actually checked it — the
 * variant was accepted as `unknown` and passed through.  Round-6 lands
 * the runtime check so a mis-authored spec fails at validation rather
 * than at the runner.
 *
 * Round-7 Blocker 2 — the attribute shape lives on `variant.attribute`
 * (the canonical path), NOT on `uiOracle.attribute`.  The round-6
 * validator accidentally read `uiOracle.attribute` for `kind === "attribute"`,
 * which silently rejected correct specs (variant.attribute set, no
 * uiOracle.attribute) and approved hybrid broken specs (variant.kind
 * presence/absence with uiOracle.attribute set).
 *
 * Shape requirements (round-7 contract):
 *
 *   - When `variant` is provided, `variant.kind` MUST be one of
 *     `"attribute" | "presence" | "absence"`.
 *   - `presence` / `absence` variants MUST have a non-empty `selector`
 *     on the parent `uiOracle`.  They MUST NOT also carry a legacy
 *     `uiOracle.attribute` field — that hybrid is rejected with
 *     E015b because the production code never toggles a `data-*`
 *     attribute for a presence/absence surface.
 *   - `attribute` variants MUST have a non-empty `selector` AND a
 *     non-empty `variant.attribute` object with both `name` and
 *     `value` populated.  (The shape is enforced at compile time by
 *     the union; runtime catches authors who bypass the type via
 *     `JSON.parse` / `as unknown`.)  If both `variant.attribute` and
 *     legacy `uiOracle.attribute` are set, `variant.attribute` wins
 *     and the legacy field is ignored — this is the round-5 legacy
 *     migration path.
 *
 * Legacy-shape migration (round-5 declaration kept for backwards
 * compat): when `variant` is ABSENT and `uiOracle.attribute` is set,
 * the validator accepts the spec but emits a deprecation warning so
 * the curator knows the legacy shape will be removed in a future
 * round.  The warning is surfaced via `SuiteValidationResult.warnings`
 * and does NOT count as a validation error.
 *
 * Error messages name the scenario id, step id (when applicable),
 * and the offending variant shape so the curator can fix it without
 * re-reading the type definition.
 */
const isUiOracleVariantKind = (
	kind: unknown,
): kind is UiOracleVariant["kind"] =>
	kind === "attribute" || kind === "presence" || kind === "absence";

/**
 * Validation warning (round-7 Blocker 2).  Warnings are advisory — they
 * do NOT fail validation — and surface migration / deprecation hints
 * that the curator should act on before the next round.  Today the
 * validator only emits one warning code:
 *
 *   - `W001_LEGACY_UI_ORACLE_ATTRIBUTE` — the spec omits `variant` but
 *     carries the legacy `uiOracle.attribute` field.  The legacy shape
 *     is still accepted (round-5 backwards-compat) but will be removed
 *     in a future round.  Migrate by moving the `attribute` object onto
 *     `variant.attribute` and setting `variant.kind = "attribute"`.
 */
interface ValidationWarning {
	readonly code: string;
	readonly message: string;
	readonly stepId?: string;
}

const checkUiOracleVariant = (
	uiOracle: UiOracleAssertion | undefined,
	scenarioId: string,
	stepId: string | undefined,
	errors: ValidationError[],
	warnings: ValidationWarning[],
): void => {
	if (!uiOracle) return;
	const variant = uiOracle.variant;
	const legacyAttribute = uiOracle.attribute;

	// Legacy shape: variant absent, uiOracle.attribute set.  Accept
	// but emit W001 so the curator migrates to the variant shape.
	if (variant === undefined) {
		if (
			legacyAttribute &&
			typeof legacyAttribute.name === "string" &&
			legacyAttribute.name.trim().length > 0 &&
			typeof legacyAttribute.value === "string"
		) {
			warnings.push({
				code: "W001_LEGACY_UI_ORACLE_ATTRIBUTE",
				message: `Scenario "${scenarioId}" step "${stepId ?? "(scenario-level)"}" carries the legacy uiOracle.attribute shape (round-5 declaration). Migrate by setting variant = { kind: "attribute", attribute: { name, value } } — the legacy field will be removed in a future round.`,
				stepId,
			});
		}
		return;
	}

	if (typeof variant !== "object" || variant === null) {
		errors.push({
			code: "E015b_INVALID_UI_ORACLE_VARIANT",
			message: `Scenario "${scenarioId}" step "${stepId ?? "(scenario-level)"}" uiOracle.variant must be an object with a kind field, got ${typeof variant}. Use one of attribute / presence / absence.`,
			stepId,
		});
		return;
	}

	const kind = (variant as { kind?: unknown }).kind;
	if (!isUiOracleVariantKind(kind)) {
		errors.push({
			code: "E015b_INVALID_UI_ORACLE_VARIANT",
			message: `Scenario "${scenarioId}" step "${stepId ?? "(scenario-level)"}" uiOracle.variant.kind "${String(kind)}" is not one of "attribute" | "presence" | "absence". Pick the oracle variant that matches what the production code does to the DOM (mount / unmount / toggle data-attribute).`,
			stepId,
		});
		return;
	}

	const selector = uiOracle.selector;
	const hasSelector =
		typeof selector === "string" && selector.trim().length > 0;

	// Hybrid shape: presence/absence with a legacy uiOracle.attribute
	// is rejected — production code never toggles data-* for these
	// surfaces, so carrying attribute here is a sign of Gherkin /
	// Procedure drift.
	if (
		(kind === "presence" || kind === "absence") &&
		legacyAttribute !== undefined
	) {
		errors.push({
			code: "E015b_INVALID_UI_ORACLE_VARIANT",
			message: `Scenario "${scenarioId}" step "${stepId ?? "(scenario-level)"}" declares uiOracle.variant.kind "${kind}" but also carries the legacy uiOracle.attribute field. The attribute oracle is only valid when variant.kind is "attribute" or when variant is absent (legacy). Remove uiOracle.attribute — production code MOUNTS / UNMOUNTS the element rather than toggling a data-* attribute.`,
			stepId,
		});
		// Continue to selector check below — both errors are useful.
	}

	if ((kind === "presence" || kind === "absence") && !hasSelector) {
		errors.push({
			code: "E015b_INVALID_UI_ORACLE_VARIANT",
			message: `Scenario "${scenarioId}" step "${stepId ?? "(scenario-level)"}" declares uiOracle.variant.kind "${kind}" but uiOracle.selector is empty. The runner queries the DOM against the selector to assert presence / absence; provide the production anchor (e.g. "[data-settings-sidebar]").`,
			stepId,
		});
		return;
	}

	if (kind === "attribute") {
		if (!hasSelector) {
			errors.push({
				code: "E015b_INVALID_UI_ORACLE_VARIANT",
				message: `Scenario "${scenarioId}" step "${stepId ?? "(scenario-level)"}" declares uiOracle.variant.kind "attribute" but uiOracle.selector is empty. Provide the production anchor the runner will read the attribute from.`,
				stepId,
			});
			return;
		}
		// Round-7 Blocker 2 — read `variant.attribute` (the canonical
		// path), NOT `uiOracle.attribute`.  If both are set the
		// variant wins and the legacy field is silently ignored.
		// `variant` was narrowed by the `kind === "attribute"` branch
		// above; cast it to the union member so the attribute field
		// is reachable on the type.
		const attributeVariant = variant as Extract<
			UiOracleVariant,
			{ kind: "attribute" }
		>;
		const variantAttr = attributeVariant.attribute;
		if (
			!variantAttr ||
			typeof variantAttr.name !== "string" ||
			variantAttr.name.trim().length === 0 ||
			typeof variantAttr.value !== "string"
		) {
			errors.push({
				code: "E015b_INVALID_UI_ORACLE_VARIANT",
				message: `Scenario "${scenarioId}" step "${stepId ?? "(scenario-level)"}" declares uiOracle.variant.kind "attribute" but variant.attribute is missing name or value. Provide both (e.g. { name: "data-state", value: "placed" }).`,
				stepId,
			});
		}
	}
};

const checkRealAnchorsInEvidence = (
	evidence: ScenarioSpec["evidence"] | undefined,
	errors: ValidationError[],
): void => {
	if (!evidence) return;
	for (const raw of evidence.screenshotSelectors) {
		if (typeof raw !== "string") continue;
		if (!isSelectorStrictWhitelisted(raw)) {
			errors.push(syntheticSelectorError(raw, undefined));
		}
	}
	for (const raw of evidence.computedStyleSnapshots) {
		if (typeof raw !== "string") continue;
		const stripped = raw.startsWith("computed-style: ")
			? raw.slice("computed-style: ".length)
			: raw;
		if (!isSelectorStrictWhitelisted(stripped)) {
			errors.push(syntheticSelectorError(raw, undefined));
		}
	}
};

/**
 * E009 / E010 — required Computer-Use contract sections.
 */
const checkExecutionContract = (
	spec: ScenarioSpec,
	errors: ValidationError[],
): void => {
	const env = spec.environment;
	if (!env || typeof env.os !== "string" || env.os.length === 0) {
		errors.push({
			code: "E009_MISSING_ENVIRONMENT",
			message: `Scenario "${spec.id}" is missing environment.os.`,
		});
	} else if (env.os !== "macos" && env.os !== "windows" && env.os !== "linux") {
		errors.push({
			code: "E009_MISSING_ENVIRONMENT",
			message: `Scenario "${spec.id}" environment.os "${env.os}" is not one of macos / windows / linux.`,
		});
	}
	if (
		!env ||
		typeof env.hostVersionRange !== "string" ||
		env.hostVersionRange.length === 0
	) {
		errors.push({
			code: "E009_MISSING_ENVIRONMENT",
			message: `Scenario "${spec.id}" is missing environment.hostVersionRange. Use semver range syntax (e.g. ">=26.5.0").`,
		});
	}
	if (
		!env ||
		typeof env.panelState !== "string" ||
		env.panelState.length === 0
	) {
		errors.push({
			code: "E009_MISSING_ENVIRONMENT",
			message: `Scenario "${spec.id}" is missing environment.panelState.`,
		});
	}

	if (!Array.isArray(spec.stopConditions) || spec.stopConditions.length === 0) {
		errors.push({
			code: "E010_MISSING_STOP_CONDITIONS",
			message: `Scenario "${spec.id}" has no stopConditions. The runner needs at least one to know when to abort.`,
		});
	}

	if (
		!spec.automation ||
		!Array.isArray(spec.automation.requiredCapabilities) ||
		spec.automation.requiredCapabilities.length === 0
	) {
		errors.push({
			code: "E011_MISSING_AUTOMATION_CAPS",
			message: `Scenario "${spec.id}" has no automation.requiredCapabilities. The runner cannot gate itself without a declared capability surface.`,
		});
	}

	if (!spec.onFailure) {
		errors.push({
			code: "E011_MISSING_AUTOMATION_CAPS",
			message: `Scenario "${spec.id}" is missing onFailure policy (capture / do_not).`,
		});
	} else if (
		!Array.isArray(spec.onFailure.capture) ||
		!Array.isArray(spec.onFailure.doNot)
	) {
		errors.push({
			code: "E011_MISSING_AUTOMATION_CAPS",
			message: `Scenario "${spec.id}" onFailure policy must declare both capture and doNot arrays.`,
		});
	}
};

/**
 * E019 — `hostVersionRange` MUST parse as a semver range expression
 * (round-5 Blocker C; tightened in round-6 needs-fix 1).  Real AE
 * host versions are reported as `26.5.x` (the marketing year `2026`
 * ≠ host version `26.x`), so marketing-year strings like
 * `">=2026.0.0"` are rejected.
 *
 * Round-6 needs-fix 1 replaces the round-5 hand-rolled regex with
 * `semver.validRange()` from Node's `semver` package.  That makes the
 * validator accept the FULL semver range grammar, including
 * space-separated comparators (e.g. `">=26.5.0 <27.0.0"`) that the
 * round-5 regex rejected as malformed.
 *
 * The legacy `aeVersionRange` field is honoured only as a
 * migration signal: when present without `hostVersionRange`, the
 * validator emits E019 with a clear migration message rather
 * than silently accepting a non-semver value.
 *
 * AE-version normalisation contract (round-6 needs-fix 1): AE's
 * `app.version` reports the host version with `x` instead of `.`
 * for the patch segment — e.g. `26.5x89`.  The runner that consumes
 * `app.version` and calls `semver.satisfies()` normalises the value
 * via `normalizeAeHostVersion()` before the comparison.  See the
 * helper below for the contract.
 */

/**
 * Round-6 needs-fix 1 — AE `app.version` reports the host version
 * with `x` instead of `.` for the patch segment (e.g. `26.5x89`
 * instead of `26.5.89`).  The semver range expression in the
 * scenario spec uses the canonical `X.Y.Z` shape, so the runner
 * MUST normalise the raw AE value before passing it to
 * `semver.satisfies()`.
 *
 * Conversion rules:
 *
 *   1. `26.5x89`        → `26.5.89`  (AE x-patch)
 *   2. `26.5.89`        → `26.5.89`  (canonical, pass-through)
 *   3. `26.5`           → `26.5.0`   (no patch → coerce to 0)
 *   4. `garbage`        → `null`
 *
 * The helper delegates to `semver.coerce()` for the
 * shortest-valid-semver extraction (cases 2, 3, 4) and runs an
 * explicit regex replacement for the `x` → `.` swap before
 * coercion so the AE-style patch is preserved rather than dropped.
 *
 * The runner that owns the `app.version` read imports this helper
 * from `validator.ts` (re-exported) so the contract lives in one
 * place.  Validator tests cover cases 1–4.
 */
const AE_X_PATCH_RE = /^(\d+)\.(\d+)x(\d+)$/;

export function normalizeAeHostVersion(raw: string): string | null {
	if (typeof raw !== "string") return null;
	const trimmed = raw.trim();
	if (trimmed.length === 0) return null;

	const xMatch = AE_X_PATCH_RE.exec(trimmed);
	if (xMatch) {
		return `${xMatch[1]}.${xMatch[2]}.${xMatch[3]}`;
	}

	// Fall through to semver.coerce for canonical X.Y / X.Y.Z /
	// bare-X inputs.  coerce extracts the leading valid semver
	// substring and fills missing patch / minor with 0.
	const coerced = coerce(trimmed, { loose: true });
	return coerced === null ? null : coerced.version;
}

const isSemverRange = (value: string): boolean => {
	if (typeof value !== "string") return false;
	const trimmed = value.trim();
	if (trimmed.length === 0) return false;
	// `validRange` returns `null` when the input is not a valid
	// range expression; it accepts the FULL semver range grammar
	// (>=26.5.0 <27.0.0, ~16.x, ^x.y.z, x.y, hyphen ranges,
	// tilde ranges, ||, *, etc.).
	return validRange(trimmed, { loose: true }) !== null;
};

/**
 * Walk the source tokens of a semver range expression and reject
 * any comparator whose MAJOR part is >= 100 (i.e. looks like a
 * marketing-year string such as `2026.0.0` rather than a real AE
 * host version like `26.5.0`).  Source-token walk keeps the rule
 * authoring-time cheap and avoids depending on semver's internal
 * `Range` shape, which is implementation-defined across semver
 * versions.
 */
const hasMarketingYearMajor = (range: string): boolean => {
	return MAJOR_YEAR_RE.test(range);
};

const checkHostVersionRange = (
	spec: ScenarioSpec,
	errors: ValidationError[],
): void => {
	const env = spec.environment;
	if (!env) return;

	const host = env.hostVersionRange;
	const legacy = env.aeVersionRange;

	if (typeof host === "string" && host.length > 0) {
		if (!isSemverRange(host)) {
			errors.push({
				code: "E019_INVALID_HOST_VERSION_RANGE",
				message: `Scenario "${spec.id}" environment.hostVersionRange "${host}" is not a valid semver range expression (semver.validRange() returned null). Examples of accepted ranges: ">=26.5.0", ">=26.5.0 <27.0.0", "^26.5.0", "~26.5.0", "26.5.x". Marketing-year strings like ">=2026.0.0" are not accepted because real AE host versions are reported as 26.5.x.`,
			});
		} else if (hasMarketingYearMajor(host)) {
			errors.push({
				code: "E019_INVALID_HOST_VERSION_RANGE",
				message: `Scenario "${spec.id}" environment.hostVersionRange "${host}" parses as semver but its MAJOR part is >= 100 — this looks like a marketing-year string (e.g. "2026.0.0") rather than the real AE host version. AE's app.version reports the host as \`26.5.x\` (MAJOR < 100). Use a real host-version range (e.g. ">=26.5.0").`,
			});
		}
		// hostVersionRange wins; legacy field is silently ignored.
		return;
	}

	if (typeof legacy === "string" && legacy.length > 0) {
		// Legacy field present without the new field — emit E019
		// with a clear migration hint so the curator renames the
		// field rather than guessing the host version.
		errors.push({
			code: "E019_INVALID_HOST_VERSION_RANGE",
			message: `Scenario "${spec.id}" declares environment.aeVersionRange "${legacy}" but no environment.hostVersionRange. The round-5 Blocker C rename replaces the marketing-year string (e.g. ">=2026.0.0") with the real host-version semver (e.g. ">=26.5.0"). Rename the field in the binding or scenario JSON; do NOT derive the host version from the marketing year.`,
		});
	}
	// hostVersionRange === "" is handled by E009_MISSING_ENVIRONMENT above.
};

export function validateScenarioSpec(
	spec: ScenarioSpec,
): ScenarioValidationResult {
	const errors: ValidationError[] = [];
	const warnings: ValidationWarning[] = [];

	// E007 — evidence level.
	if (
		!ALLOWED_EVIDENCE_LEVELS.includes(
			spec.evidenceLevel as (typeof ALLOWED_EVIDENCE_LEVELS)[number],
		)
	) {
		errors.push({
			code: "E007_INVALID_EVIDENCE_LEVEL",
			message: `Evidence level "${spec.evidenceLevel}" is not in the allowed set (${ALLOWED_EVIDENCE_LEVELS.join(", ")}).`,
		});
	}

	// E008 — evidence section present and non-empty.
	if (!spec.evidence) {
		errors.push({
			code: "E008_MISSING_EVIDENCE",
			message: `Scenario "${spec.id}" carries no evidence section. Every scenario must declare screenshotSelectors / computedStyleSnapshots / persistedStateDumps / logAssertions.`,
		});
	} else {
		const totalEvidence =
			spec.evidence.screenshotSelectors.length +
			spec.evidence.computedStyleSnapshots.length +
			spec.evidence.persistedStateDumps.length +
			spec.evidence.logAssertions.length;
		if (totalEvidence === 0) {
			errors.push({
				code: "E008_MISSING_EVIDENCE",
				message: `Scenario "${spec.id}" has an evidence section but every array is empty. At least one selector / snapshot / dump / log assertion must be declared.`,
			});
		}
	}

	// E006 — dual oracles at the SCENARIO level.
	const loweredTitle = spec.title.toLowerCase();
	const titleSaysImportant = IMPORTANT_TITLE_KEYWORDS.some((kw) =>
		loweredTitle.includes(kw),
	);
	if (spec.oracles.dual) {
		const hasUi = spec.oracles.ui !== undefined;
		const hasPersistence = spec.oracles.persistence !== undefined;
		if (!hasUi || !hasPersistence) {
			errors.push({
				code: "E006_MISSING_DUAL_ORACLE",
				message: `Scenario "${spec.id}" declares important (oracles.dual = true) but is missing ${hasUi ? "persistence" : hasPersistence ? "ui" : "ui and persistence"} oracle on the oracles block.`,
			});
		}
	}
	if (titleSaysImportant && !spec.oracles.dual) {
		errors.push({
			code: "E006_MISSING_DUAL_ORACLE",
			message: `Scenario "${spec.id}" title contains an important-behaviour keyword (one of: ${IMPORTANT_TITLE_KEYWORDS.join(", ")}) but oracles.dual is false. Declare dual oracles for important scenarios.`,
		});
	}

	// E009 / E010 / E011 — Computer-Use execution contract.
	checkExecutionContract(spec, errors);

	// E003 — mutation → checkpoint pairing.
	checkMutationCheckpoint(spec.procedure, errors);

	// E004 — mutation → cleanup / noCleanupReason.
	checkMutationCleanup(spec, errors);

	// E012 — Gherkin ↔ Procedure ref traceability.
	checkGherkinRefs(spec, errors);

	// E014 (rolled into E011) — required capabilities per mutation step.
	checkRequiredCapabilities(spec, errors);

	// E015 — Procedure step selectors and evidence selectors MUST
	// resolve to real production anchors.  Walk `procedure[*].expectedResult.uiOracle.selector`,
	// `evidence.screenshotSelectors`, and
	// `evidence.computedStyleSnapshots` against the whitelist.
	for (const step of spec.procedure) {
		checkSelectorInExpectedResult(step.expectedResult, step.id, errors);
	}
	checkRealAnchorsInEvidence(spec.evidence, errors);
	if (spec.oracles.ui) {
		const oracleSelector = spec.oracles.ui.selector;
		if (
			typeof oracleSelector === "string" &&
			oracleSelector.length > 0 &&
			!isSelectorStrictWhitelisted(oracleSelector)
		) {
			errors.push(syntheticSelectorError(oracleSelector, undefined));
		}
	}

	// E015b — UiOracleVariant runtime shape check (round-6 Blocker C;
	// round-7 Blocker 2 tightens the attribute path and adds W001
	// for the legacy shape migration).
	for (const step of spec.procedure) {
		checkUiOracleVariant(
			step.expectedResult.uiOracle,
			spec.id,
			step.id,
			errors,
			warnings,
		);
	}
	if (spec.oracles.ui) {
		checkUiOracleVariant(spec.oracles.ui, spec.id, undefined, errors, warnings);
	}

	// E005 — forbidden wording across the spec body.
	findForbiddenWordsIn(spec, "root", undefined, errors);

	// E016 — missing fixture for AE-required scenarios (round-3 Blocker 4).
	checkRequiredFixtureForAeRequired(spec, errors);

	// E017 — verified-run-id format (round-3 needs-fix 1).
	checkLastVerifiedRunId(spec, errors);

	// E018 — Scenario Outline without Examples rows (round-4 Blocker D).
	checkScenarioOutlineExamples(spec, errors);

	// E019 — hostVersionRange semver (round-5 Blocker C).
	checkHostVersionRange(spec, errors);

	return { id: spec.id, errors, warnings };
}

/**
 * E016 — when `environment.aeRequired === true`, the scenario depends
 * on a real `.aep` file the runner opens via the host bridge.  At
 * least one FixtureSpec MUST declare a non-empty `projectPath` so the
 * runner has a real fixture to materialise.  Scenarios that do not
 * need the host bridge (`aeRequired: false` or unset for non-AE
 * panel-only scenarios) MUST NOT trip this rule.
 */
const checkRequiredFixtureForAeRequired = (
	spec: ScenarioSpec,
	errors: ValidationError[],
): void => {
	if (!spec.environment) return;
	if (spec.environment.aeRequired !== true) return;
	const hasProjectPath = spec.fixtures.some(
		(f) => typeof f.projectPath === "string" && f.projectPath.trim().length > 0,
	);
	if (!hasProjectPath) {
		errors.push({
			code: "E016_MISSING_AE_FIXTURE",
			message: `Scenario "${spec.id}" declares environment.aeRequired = true but no FixtureSpec carries a non-empty projectPath. Add a fixture entry with projectPath pointing at the validation host's .aep (or run a host that materialises the path from the runner's aep_root convention — see docs/architecture/quality/aep-fixture-strategy.md).`,
		});
	}
};

/**
 * E017 — `lastVerifiedRunId` (when non-empty) MUST match the canonical
 * UUID v4 format so empty / prose strings cannot be mis-read as
 * "verified" by future consumers (round-3 needs-fix 1, tightened in
 * round-4 needs-fix 1).
 *
 * Round-4 needs-fix 1 replaced the round-3 pattern
 * `/^[0-9a-f-]{36}$/i` — which accepted a 36-hyphen string or any
 * 36-character mix of hex digits and hyphens — with the canonical
 * UUID v4 layout per RFC 4122 §4.4:
 *
 *   /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
 *
 *   - `xxxxxxxx-xxxx-` — 8 + 4 hex digits
 *   - `-Mxxx-`           — version digit `4` (UUID v4) followed by 3 hex digits
 *   - `-Nxxx-`           — variant `[89ab]` (RFC 4122 variant bits) followed by 3 hex digits
 *   - `-xxxxxxxxxxxx`    — 12 hex digits
 *
 * The literal empty string is allowed (= "not yet verified") so the
 * matrix can carry `""` cells without tripping the rule.
 *
 * The validator does NOT scan the matrix doc; the matrix's
 * seeder test (`verification-matrix.test.ts`) parses the markdown and
 * surfaces the same UUID rule so the two views agree.  Scenarios
 * loaded from JSON do not currently carry `lastVerifiedRunId` on the
 * ScenarioSpec itself — the field lives on the matrix.  This check
 * is the safety net for the future case where the field is moved
 * onto the ScenarioSpec (e.g. the runner seeds it after a real run).
 */
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const checkLastVerifiedRunId = (
	spec: ScenarioSpec,
	errors: ValidationError[],
): void => {
	const raw = (spec as { lastVerifiedRunId?: unknown }).lastVerifiedRunId;
	if (raw === undefined || raw === null) return;
	if (typeof raw !== "string") {
		errors.push({
			code: "E017_INVALID_VERIFIED_RUN_ID",
			message: `Scenario "${spec.id}" lastVerifiedRunId must be a string (or empty); got ${typeof raw}.`,
		});
		return;
	}
	if (raw.length === 0) return; // empty == "not yet verified", allowed.
	if (!UUID_RE.test(raw)) {
		errors.push({
			code: "E017_INVALID_VERIFIED_RUN_ID",
			message: `Scenario "${spec.id}" lastVerifiedRunId "${raw}" is not a canonical UUID v4 (must match /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i). Use empty string for "not yet verified".`,
		});
	}
};

/**
 * E018 — `Scenario Outline` scenarios MUST carry at least one
 * non-empty `Examples:` block, and each row's column count MUST
 * equal the header's column count (round-4 Blocker D).
 *
 * Cucumber's `Scenario Outline` parameterises the scenario body by
 * the rows declared in `Examples:` tables.  An outline with no
 * Examples block is semantically equivalent to "the runner runs
 * nothing" — silently dropping Cucumber's data model.  The
 * round-3 loader did not preserve `scenario.examples`, so this
 * rule could not fire.  Round-4 (Blocker D) surfaces the data
 * on `gherkin.examples` and adds this check.
 */
const checkScenarioOutlineExamples = (
	spec: ScenarioSpec,
	errors: ValidationError[],
): void => {
	if (spec.isScenarioOutline !== true) return;
	const examples = spec.gherkin.examples ?? [];
	if (examples.length === 0) {
		errors.push({
			code: "E018_OUTLINE_NO_EXAMPLES",
			message: `Scenario "${spec.id}" declares isScenarioOutline: true but gherkin.examples is empty. A Scenario Outline MUST declare at least one Examples block with at least one data row; otherwise the parameterisation is meaningless and Cucumber silently skips the run.`,
		});
		return;
	}
	for (const block of examples) {
		if (block.rows.length === 0) {
			errors.push({
				code: "E018_OUTLINE_NO_EXAMPLES",
				message: `Scenario "${spec.id}" Examples block${
					block.name.length > 0 ? ` "${block.name}"` : ""
				} declares no data rows. Drop the block or add rows.`,
			});
			continue;
		}
		const headerCount = block.headers.length;
		for (const row of block.rows) {
			if (row.length !== headerCount) {
				errors.push({
					code: "E018_OUTLINE_NO_EXAMPLES",
					message: `Scenario "${spec.id}" Examples block${
						block.name.length > 0 ? ` "${block.name}"` : ""
					} has ${row.length} columns but the header declares ${headerCount}. Each row MUST match the header column count.`,
				});
			}
		}
	}
};

export function validateScenarioSpecCollection(
	specs: readonly ScenarioSpec[],
): SuiteValidationResult {
	const results: ScenarioValidationResult[] = [];
	const idCount = new Map<string, number>();

	for (const spec of specs) {
		const result = validateScenarioSpec(spec);
		results.push(result);
		idCount.set(spec.id, (idCount.get(spec.id) ?? 0) + 1);
	}

	// E001 — duplicate ids.
	for (const [id, count] of idCount) {
		if (count > 1) {
			results.push({
				id,
				errors: [
					{
						code: "E001_DUP_ID",
						message: `Scenario id "${id}" appears ${count} times in the suite. Scenario ids must be unique.`,
					},
				],
				warnings: [],
			});
		}
	}

	const allErrors = results.flatMap((r) => r.errors);
	const allWarnings = results.flatMap((r) => r.warnings);
	return {
		results,
		errors: allErrors,
		warnings: allWarnings,
		scenarios: specs,
	};
}
// Re-export fixture type for downstream consumers.
