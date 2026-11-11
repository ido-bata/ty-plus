# Scenario verification matrix (Issue #147, round-2 gap 1)

This file maps every verification row the QA / release gate cares about
to the canonical scenario ID that satisfies it.  It is the
read-side of the bidirectional traceability that the loader's
`scenario-bindings.json` `requirement_id` / `verification_rows`
fields declare on the write side.

The matrix is the SINGLE source of truth for "which scenarios does
this verification row actually exercise?".  A reviewer who wants to
understand what protects a requirement MUST find a row here and trace
it back to the binding entry.

## Schema

Each row is a TSV-style line:

```
<requirement_id>\t<acceptance>\t<scenario_id>\t<last_verified_run_id>
```

- `requirement_id` — stable identifier matching the binding's
  `requirement_id` field.  See `docs/architecture/quality/issue-131-
  stability-gate.md` for the existing `boot-stability` row and
  `docs/README.md` for the architectural dependency tree.
- `acceptance` — short prose describing the behaviour under
  verification.  One-line; the canonical Gherkin lives in
  `src/shared/scenario/features/*.feature`.
- `scenario_id` — the canonical scenario id from
  `src/shared/scenario/scenario-bindings.json` (e.g.
  `SCN-LIFECYCLE-01`).
- `last_verified_run_id` — UUID of the most recent `RunResult` that
  satisfied this row.  Empty (`""`) means "never verified".  When
  non-empty, the value MUST match the canonical UUID format
  `/^[0-9a-f-]{36}$/i` (round-3 needs-fix 1 — round-2 carried
  prose strings like `(round-2 cut: empty)` which were non-empty
  and could be mis-read as "verified").  This field is populated by
  the runner audit step (out of scope for this PR; only the schema
  is declared).

## Rows

| requirement_id    | acceptance                                                    | scenario_id(s)                                          | last_verified_run_id |
|-------------------|---------------------------------------------------------------|---------------------------------------------------------|----------------------|
| boot-stability    | preset lifecycle survives reload + cross-panel + restart       | SCN-LIFECYCLE-01, SCN-LIFECYCLE-02, SCN-FAILURE-01, SCN-BOOT-01 |  |
| catalog-crud      | catalog and preset CRUD round-trip preserves disk + storage   | SCN-CATALOG-01, SCN-PRESET-CRUD-01, SCN-GROUPS-01       |  |
| host-bridge       | panel-originated host actions dispatch through canonical bridge | SCN-HOST-01                                             |  |
| settings-dialog   | settings dialog round-trip persists edited values            | SCN-SETTINGS-01                                         |  |
| online-degraded   | degraded cloud switches to local fallback without blocking   | SCN-DEGRADED-01                                         |  |
| diagnostics       | diagnostics capture produces a verifiable evidence bundle     | SCN-DIAGNOSTICS-01                                      |  |
| runtime-lifecycle | host bundle action and worker attempt are attributable from the console | SCN-RUNTIME-01 |  |
| preset-authoring  | authored preset write under a protected root escalates once and commits after read-back | SCN-AUTHOR-01 |  |

## How `Verify` walks the matrix

`Verify` reads this file, parses the TSV rows, then walks
`src/shared/scenario/scenario-bindings.json` looking for each
`requirement_id` / `scenario_id` pair.  The seeder test
(`src/shared/scenario/verification-matrix.test.ts`) asserts:

1. Every matrix row references a `requirement_id` that appears in at
   least one binding.
2. Every matrix row references a `scenario_id` that appears in at
   least one binding.
3. Every binding's `requirement_id` and `verification_rows` fields
   appear in at least one matrix row (no orphan scenario / no orphan
   requirement).

If any of those invariants fails, the seeder surfaces a clear error
that names the offending ids — the matrix is the only place that
guards against silent drift between the spec and the gate.

## Updating this matrix

When adding a new scenario (or a new requirement_id on an existing
scenario):

1. Add the `requirement_id` and `verification_rows[]` to the binding.
2. Add the matching row(s) to the table above.
3. Run `bun run test:scenario-spec` — the seeder fails if either
   side of the link is missing.

## Why a doc and not a JSON file

The matrix is human-facing — release reviewers, QA, and the
gate-writer all read it.  Markdown keeps the prose and the structure
in one place.  JSON would hide the `acceptance` column behind
indirection and lose the table layout.  The seeder test parses the
TSV rows out of the markdown so the schema is machine-checked
without forcing a JSON representation on the document.
