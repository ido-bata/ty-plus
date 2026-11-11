# Phase 1 T2 gate review

Date: 2026-08-14

## Result

`PRO-010` is not complete. The Rust/runtime-specific verification passes, but
the repository-wide TypeScript and Vitest baseline does not pass.

## Passing evidence

- `bun run check:rust-workspace`: pass.
- `bun run check:boundaries`: pass with no new import-boundary violations.
- `bun run check:rust-runtime-boundaries`: pass; 125 existing matches remain
  constrained to 24 exact file/rule exceptions.
- `bun run vitest run src/management/ipc/generated/wire-contract.test.ts`: 6/6 pass.
- `cargo +1.85.0 test -p ty-plus-protocol`: 20 unit and 6 golden tests pass.
- Rust and TypeScript schema generator `--check`: pass.

## Blocking evidence

`bun run typecheck` initially stopped at an unmatched generic delimiter in
`src/function/widget/state-slice-contract.ts`. The syntax defect was corrected
in `ff88a695`. The next run exposes repository-wide pre-existing failures,
including duplicate DOM / ExtendScript global declarations and stale test
fixtures, mock types, component props, workspace payloads, and matcher types.

`bun run test` also fails in pre-existing UI and storage suites. Reproduced
examples include preset removal tests whose environment has no `window.confirm`,
dialog roots that intentionally return the current null stub, stale editor and
widget fixtures, and storage tests whose mocks no longer match the current
persistence contracts.

These failures are outside the committed Rust workspace, generated protocol,
IPC boundary, and architecture-guard changes. The pre-existing dirty
`tsconfig*.json` and `vitest.config.ts` control which of this debt is exposed;
they were not staged or changed by the redesign commits.

## Gate decision

- `PRO-009`: complete at `a128f368`.
- `PRO-010`: blocked; do not mark the phase complete and do not mark `IPC-001`
  ready.
- Resumption requires an explicit decision to take ownership of the existing
  TypeScript/Vitest remediation as a separate workstream, or a clean repository
  baseline that passes T2. Do not weaken T2 or add broad exclusions to make the
  gate green.
