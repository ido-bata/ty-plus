/**
 * Gherkin / Procedure loader (Issue #147, round-2 rework).
 *
 * The loader glues three artifact families together:
 *
 *   1. Canonical `.feature` files under `src/shared/scenario/features/*.feature`,
 *      parsed by `@cucumber/gherkin`'s Parser.
 *   2. Procedure JSON files under `src/shared/scenario/procedures/*.json`,
 *      typed via `types.ts`'s `ProcedureStep` and friends.
 *   3. A scenario-binding JSON file (`scenario-bindings.json`) that
 *      declares, per scenario, the canonical `featureFile` path and
 *      `procedureFile` path.  The binding is the SINGLE source of
 *      truth — round-2 Blocker B.  Procedures are loaded by reading
 *      the binding, then reading the named file.  No filename search,
 *      no name-collision fallback.
 *
 * The loader is the ONLY entry point the rule-runner (`scenario-rule-
 * runner.test.ts`) calls — the spec files in `specs/` are thin
 * re-exports of the loader's output so the structural rule codes can
 * walk them uniformly.
 *
 * Decision log (documented for Issue #147 review):
 *
 *   - Gherkin parser: `@cucumber/gherkin` (MIT, 1 transitive dep, the
 *     canonical Cucumber Gherkin parser).  Avoids re-implementing the
 *     grammar and gives us free Tags / Scenario Outline / Rule support.
 *   - Procedure format: JSON.  Adding a YAML parser for one consumer
 *     would expand the dep surface (no other code in the project uses
 *     YAML).  JSON is parsed natively by `JSON.parse`.  Comments and
 *     human-facing rationale live in adjacent `.md` files where needed.
 *   - Scenario bindings: JSON, because they cross-reference multiple
 *     artifacts and JSON's structural typing makes the cross-ref
 *     invalidation obvious (the validator catches the cross-ref errors).
 *   - Background surface (round-2 Blocker A, round-3 Blocker 1):
 *     the parser's `feature.background` and `rule.children[*].rule.
 *     background` steps are surfaced as `gherkin.background` on the
 *     loaded scenario in canonical Cucumber order
 *     `[...featureBackground, ...ruleBackground]`.  Feature
 *     Background applies to every Scenario in the Feature; Rule
 *     Background APPENDS to Feature Background rather than
 *     overriding it.  Round-2 mistakenly over-wrote Rule Background
 *     with Feature Background; round-3 fixes this.  `gherkinRef.
 *     stepIndex` continues to refer to the visible scenario steps
 *     (NOT background) — the validator's `stepIndex = 0` semantics
 *     is preserved.
 *   - Loader is binding-driven (round-2 Blocker B): reading the
 *     binding gives the canonical featureFile + procedureFile pair.
 *     No silent fallbacks, no name-collision tolerance.  Renaming a
 *     procedure file surfaces as a clear error.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
	AstBuilder,
	GherkinClassicTokenMatcher,
	Parser,
} from "@cucumber/gherkin";
import type {
	Background as GherkinBackground,
	GherkinDocument,
	Examples as GherkinExamples,
	Step as GherkinStepRaw,
	Scenario,
	Tag,
} from "@cucumber/messages";

import type {
	ExampleBlock,
	GherkinBlock,
	GherkinFeature,
	GherkinKind,
	GherkinRule,
	GherkinScenario,
	GherkinStep,
	ScenarioSpec,
} from "./types";

const FEATURES_DIR = "src/shared/scenario/features";
const PROCEDURES_DIR = "src/shared/scenario/procedures";
const BINDINGS_FILE = "src/shared/scenario/scenario-bindings.json";

const repoRoot = (): string => process.cwd();

interface ParsedFeature {
	readonly source: string;
	readonly featureName: string;
	readonly featureDescription: string;
	readonly background: readonly GherkinStep[];
	readonly rules: readonly GherkinRule[];
}

const readFeatureFile = (relPath: string): ParsedFeature => {
	const absPath = join(repoRoot(), relPath);
	if (!existsSync(absPath)) {
		throw new Error(
			`Feature file declared in bindings does not exist: ${absPath}`,
		);
	}
	const source = readFileSync(absPath, "utf8");
	const builder = new AstBuilder(IdGenerator.uuid());
	const matcher = new GherkinClassicTokenMatcher();
	const parser = new Parser(builder, matcher);
	const doc: GherkinDocument = parser.parse(source);
	if (!doc.feature) {
		throw new Error(`Feature file ${relPath} has no Feature element.`);
	}
	const feature = doc.feature;

	// Background is the FIRST child of the Feature (or Rule) in the
	// AST — the parser does NOT surface it as a top-level property on
	// the Feature object.  Scan `feature.children` for a Background
	// entry; the position is canonical (Background always precedes
	// Rules / Scenarios).
	let featureBackground: readonly GherkinStep[] = [];
	for (const child of feature.children) {
		if (child.background) {
			featureBackground = toGherkinSteps(child.background.steps);
			break;
		}
	}

	const rules: GherkinRule[] = [];
	for (const child of feature.children) {
		if (!child.rule) continue;
		const rule = child.rule;
		// Canonical Cucumber Background semantics: Feature Background
		// applies to every Scenario in the Feature; Rule Background
		// applies to every Scenario in that Rule and APPENDS to the
		// Feature Background rather than overriding it
		// (https://cucumber.hexdocs.pm/feature_files.html).  Round-3
		// Blocker 1 fixed round-2's over-write where Rule Background
		// replaced Feature Background — round-2 only flattened one
		// of them, silently losing the Feature Background steps.
		let ruleOnlyBackground: readonly GherkinStep[] = [];
		for (const ruleChild of rule.children) {
			if (ruleChild.background) {
				ruleOnlyBackground = toGherkinSteps(ruleChild.background.steps);
				break;
			}
		}
		const composedBackground: readonly GherkinStep[] = [
			...featureBackground,
			...ruleOnlyBackground,
		];
		const scenarios: GherkinScenario[] = [];
		for (const ruleChild of rule.children) {
			if (!ruleChild.scenario) continue;
			scenarios.push(toGherkinScenario(ruleChild.scenario, composedBackground));
		}
		rules.push({ ruleName: rule.name, scenarios });
	}
	return {
		source: relPath,
		featureName: feature.name,
		featureDescription: feature.description,
		background: featureBackground,
		rules,
	};
};

const readAllFeatureFiles = (
	featureFiles: readonly string[],
): readonly ParsedFeature[] => {
	// Deduplicate: multiple bindings may point to the same .feature.
	const unique = Array.from(new Set(featureFiles));
	return unique.map(readFeatureFile);
};

const normalizeKeyword = (kw: string): GherkinKind => {
	const t = kw.trim();
	if (
		t === "Given" ||
		t === "When" ||
		t === "Then" ||
		t === "And" ||
		t === "But"
	) {
		return t;
	}
	// Gherkin supports localized keywords (Japanese etc.).  Default to "Given"
	// for the schema's first-step slot but flag the unknown keyword in tests.
	return "Given";
};

const toGherkinSteps = (
	steps: readonly GherkinStepRaw[],
): readonly GherkinStep[] =>
	steps.map((s, index) => ({
		index,
		kind: normalizeKeyword(s.keyword),
		text: s.text,
	}));

const toGherkinScenario = (
	scenario: Scenario,
	background: readonly GherkinStep[],
): GherkinScenario => ({
	id: scenario.id,
	name: scenario.name,
	tags: scenario.tags.map((t: Tag) => t.name),
	steps: toGherkinSteps(scenario.steps),
	background,
	examples: toExampleBlocks(scenario.examples),
});

/**
 * Round-4 Blocker D — preserve `Scenario Outline` Examples blocks.
 * Cucumber's AST exposes each `Examples:` as a `GherkinExamples`
 * with a header `tableHeader` (column names) and `tableBody` (data
 * rows).  We surface each block as an `ExampleBlock` so the
 * validator (E018) can reject empty Examples and so the runner can
 * iterate rows at execution time.  Outlines that declare no
 * Examples at all round-trip with an empty array — that case fails
 * E018 in the validator rather than being silently accepted.
 */
const toExampleBlocks = (
	raw: readonly GherkinExamples[],
): readonly ExampleBlock[] =>
	raw.map((block) => ({
		name: typeof block.name === "string" ? block.name : "",
		headers: (block.tableHeader?.cells ?? []).map((c) => c.value),
		rows: block.tableBody.map((row) => row.cells.map((cell) => cell.value)),
	}));

const IdGenerator = {
	uuid: () => () => crypto.randomUUID(),
};

// ---------------------------------------------------------------------------
// Bindings + procedure JSON loading.
// ---------------------------------------------------------------------------

interface ProcedureFile {
	readonly scenarioId: string;
	readonly steps: readonly unknown[];
	readonly cleanup?: ScenarioSpec["cleanup"];
}

interface ScenarioBindingsFile {
	readonly bindings: readonly {
		readonly scenarioId: string;
		readonly featureFile: string;
		readonly procedureFile: string;
		readonly scenarioName: string;
		readonly title: string;
		readonly description?: string;
		readonly evidenceLevel: ScenarioSpec["evidenceLevel"];
		readonly oracles: ScenarioSpec["oracles"];
		readonly evidence: ScenarioSpec["evidence"];
		readonly cleanup?: ScenarioSpec["cleanup"];
		readonly environment: ScenarioSpec["environment"];
		readonly fixtures: ScenarioSpec["fixtures"];
		readonly requirementRefs: ScenarioSpec["requirementRefs"];
		readonly stopConditions: ScenarioSpec["stopConditions"];
		readonly onFailure: ScenarioSpec["onFailure"];
		readonly automation: ScenarioSpec["automation"];
		readonly postconditions: ScenarioSpec["postconditions"];
		readonly requirement_id?: string;
		readonly verification_rows?: readonly string[];
		/**
		 * Round-4 Blocker D — `true` for `Scenario Outline` entries.
		 * The loader copies this onto the resulting `ScenarioSpec`
		 * so validator rule E018 can require a non-empty Examples
		 * block.  Omitted / `false` for plain Scenarios.
		 */
		readonly isScenarioOutline?: boolean;
	}[];
}

const readProcedure = (scenarioId: string, relPath: string): ProcedureFile => {
	const absPath = join(repoRoot(), relPath);
	if (!existsSync(absPath)) {
		throw new Error(
			`Procedure file declared in binding for scenario "${scenarioId}" does not exist: ${relPath}. ` +
				`The loader refuses silent fallbacks (round-2 Blocker B); rename the binding's procedureFile or restore the file at the declared path.`,
		);
	}
	const raw = readFileSync(absPath, "utf8");
	const parsed = JSON.parse(raw) as ProcedureFile;
	if (parsed.scenarioId !== scenarioId) {
		throw new Error(
			`Procedure file ${relPath} declares scenarioId "${parsed.scenarioId}" but was bound to scenario "${scenarioId}". ` +
				`The binding is the canonical mapping; either rename the procedure's scenarioId field or remove the binding.`,
		);
	}
	return parsed;
};

const readBindings = (): ScenarioBindingsFile => {
	const path = join(repoRoot(), BINDINGS_FILE);
	if (!existsSync(path)) {
		throw new Error(
			`Scenario bindings file does not exist: ${BINDINGS_FILE}. The loader is binding-driven (round-2 Blocker B); restore the file or the suite cannot load.`,
		);
	}
	const raw = readFileSync(path, "utf8");
	return JSON.parse(raw) as ScenarioBindingsFile;
};

/**
 * Find the Gherkin scenario within a single (already-parsed) feature
 * file.  Match by scenario name first; fall back to id.  If the
 * binding declared the wrong scenario name, throw — the binding is the
 * canonical mapping.
 */
const findScenarioInFeature = (
	feature: ParsedFeature,
	scenarioId: string,
	scenarioName: string,
): GherkinScenario | null => {
	for (const rule of feature.rules) {
		for (const scenario of rule.scenarios) {
			if (scenario.name === scenarioName) return scenario;
			if (scenario.id === scenarioId) return scenario;
		}
	}
	return null;
};

const buildScenarioSpec = (
	featuresByFile: ReadonlyMap<string, ParsedFeature>,
	binding: ScenarioBindingsFile["bindings"][number],
): ScenarioSpec => {
	const feature = featuresByFile.get(binding.featureFile);
	if (!feature) {
		throw new Error(
			`Binding for scenario "${binding.scenarioId}" references featureFile "${binding.featureFile}" but no feature parsed for that path.`,
		);
	}
	const matched = findScenarioInFeature(
		feature,
		binding.scenarioId,
		binding.scenarioName,
	);
	if (!matched) {
		throw new Error(
			`No Gherkin scenario found in "${binding.featureFile}" for binding "${binding.scenarioId}" (name="${binding.scenarioName}"). ` +
				`The binding is the canonical mapping; check that the .feature file declares a scenario whose name matches the binding.scenarioName.`,
		);
	}

	// gherkin.scenarioId is the binding's human-readable scenario id (e.g.
	// "SCN-LIFECYCLE-01").  This MUST match the `gherkinRef.scenarioId`
	// fields used by the Procedure JSON so the validator's E012 ref
	// check resolves.  The parser's `matched.id` is an auto-generated
	// UUID-style identifier that we deliberately do not surface.
	const gherkin: GherkinBlock = {
		scenarioId: binding.scenarioId,
		scenarioName: matched.name,
		steps: matched.steps,
		tags: matched.tags,
		background: matched.background,
		// Round-4 Blocker D — preserve Scenario Outline Examples so
		// validator rule E018 can reject outlines with no rows and
		// so the runner can iterate rows at execution time.
		examples: matched.examples,
	};

	const procedureFile = readProcedure(
		binding.scenarioId,
		binding.procedureFile,
	);
	const cleanup =
		procedureFile.cleanup ??
		(binding.cleanup as ScenarioSpec["cleanup"] | undefined);
	return {
		id: binding.scenarioId,
		title: binding.title,
		description: binding.description,
		evidenceLevel: binding.evidenceLevel,
		gherkin,
		procedure: procedureFile.steps as ScenarioSpec["procedure"],
		oracles: binding.oracles,
		evidence: binding.evidence,
		cleanup,
		// Round-4 Blocker D — flag Scenario Outline entries so the
		// loader's caller (validator + runner) can treat them differently.
		isScenarioOutline: binding.isScenarioOutline === true ? true : undefined,
		environment: binding.environment,
		fixtures: binding.fixtures,
		requirementRefs: binding.requirementRefs,
		stopConditions: binding.stopConditions,
		onFailure: binding.onFailure,
		automation: binding.automation,
		postconditions: binding.postconditions,
	};
};

export const loadScenarioSpecs = (): readonly ScenarioSpec[] => {
	const bindings = readBindings();
	const featureFiles = bindings.bindings.map((b) => b.featureFile);
	const parsedFeatures = readAllFeatureFiles(featureFiles);
	const featuresByFile = new Map<string, ParsedFeature>();
	for (const f of parsedFeatures) {
		featuresByFile.set(f.source, f);
	}
	return bindings.bindings.map((b) => buildScenarioSpec(featuresByFile, b));
};

/**
 * Re-export so the spec index can hand consumers a `ScenarioSpec[]`
 * without exposing the loader surface area.
 */
export const specs = loadScenarioSpecs();

/**
 * Re-export the canonical feature index for tooling that needs to walk
 * the `.feature` files without binding context (e.g. the validator's
 * feature-name whitelist scan).
 */
interface LoadedFeature extends GherkinFeature {
	readonly source: string;
	readonly background: readonly GherkinStep[];
}

const loadFeatures = (): readonly LoadedFeature[] => {
	// No binding context — discover all .feature files directly.
	const dir = join(repoRoot(), FEATURES_DIR);
	const files = readdirSync(dir).filter((f) => f.endsWith(".feature"));
	const out: LoadedFeature[] = [];
	for (const file of files) {
		const parsed = readFeatureFile(`${FEATURES_DIR}/${file}`);
		out.push({
			featureName: parsed.featureName,
			featureDescription: parsed.featureDescription,
			rules: parsed.rules,
			source: parsed.source,
			background: parsed.background,
		});
	}
	return out;
};

// Silence the unused-import warning when GherkinBackground is not
// referenced elsewhere — keeping the explicit type import so the
// dependency on @cucumber/messages is documented.
type _GherkinBackgroundReference = GherkinBackground;
