# Architecture Observation

Evidence artifacts documenting the current active system. Read-only records for repair, migration, and archival decisions.

## Purpose

These maps document the current architecture. They exist so later repair, migration, cutting, and archival decisions are based on evidence rather than assumptions.

## Constraint

These are evidence artifacts, not implementation instructions. They do not instruct changes. Unknowns remain `Unknown`.

## Legacy Notice

Some maps reference legacy paths (`src/cep-shell/`, `src/js/`, `src/packages/`, `src/packages/host-scripts/`, `command-dispatch`) that have been superseded by `src/{function,management,shared}`. These references are preserved for historical accuracy and are annotated as legacy where applicable.

## Maps

- [Workflow Map](./workflow-map.md) — Active user-facing workflows
- [Runtime Ownership Map](./runtime-ownership-map.md) — Code classified by runtime
- [Source-Of-Truth Map](./source-of-truth-map.md) — Active definitions and authority classification
- [Active/Inactive Influence Map](./active-inactive-influence-map.md) — Code reachable through active paths vs physically present but inactive
- [Verification Evidence Map](./verification-evidence-map.md) — Strongest available evidence per workflow
- [Temporary Ambiguity Map](./temporary-ambiguity-map.md) — Bridges, compatibility paths, fallbacks, and duplicates

## Debt Signals

This plan labels observed debt signals without resolving them:

- active workflow debt
- runtime ownership debt
- source-of-truth debt
- active/inactive influence debt
- verification evidence debt
- temporary ambiguity debt

Resolution belongs to later context-bounded plans after the evidence is reviewed.
