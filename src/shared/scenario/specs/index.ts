/**
 * Barrel of the initial scenario-spec suite (Issue #147, 5-blocker rework).
 *
 * Scenarios are aggregated by the canonical loader
 * (`src/shared/scenario/loader.ts`), which reads:
 *
 *   - `src/shared/scenario/features/*.feature` — canonical Gherkin
 *   - `src/shared/scenario/procedures/*.json` — ISTQB-aligned procedure
 *   - `src/shared/scenario/scenario-bindings.json` — scenario metadata
 *     (environment, fixtures, requirement refs, stop conditions, on-
 *     failure policy, automation caps, postconditions)
 *
 * The rule-check runner (`scenario-rule-runner.test.ts`) consumes this
 * barrel.  Future runners (real AE driver, Computer Use driver) consume
 * the same barrel so the contract is the single source of truth.
 */

import { specs } from "../loader";
import type { ScenarioSpec } from "../types";

export const allScenarioSpecs: readonly ScenarioSpec[] = specs;
