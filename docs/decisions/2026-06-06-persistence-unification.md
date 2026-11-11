# Persistence JSON I/O Unification

**Date:** 2026-06-06
**Status:** Accepted

> **Superseded in part:** Rust 移行後の process、責務、権限の境界は [2026-08-21 Rust operation worker boundary](2026-08-21-rust-operation-worker.md) に従う。本文は Rust 移行に先行した TypeScript 統合の決定として保持する。

## Context

Before this refactor, ty-plus had multiple competing I/O paths for its
managed JSON files:

- `src/management/storage/persistence/store.ts` — a 1,800+ line file
  with hand-rolled path resolution, file I/O, and an ExtendScript
  fallback chain (CEP Node fs → CEP Node fs legacy → ExtendScript
  new → ExtendScript legacy).
- `src/management/workspace/layout/panel-json-files.ts` — its own
  set of `readNJson` / `writeNJson` / `readBackgroundJson` /
  `writeBackgroundJson` helpers that took a `supportRoot` argument
  explicitly.
- `src/management/storage/workspace/store.ext.ts` and
  `layout-store.ext.ts` — ExtendScript templates.
- `src/management/storage/workspace-store.ts` and
  `workspace-layout-store.ts` — re-export wrappers.
- `src/management/storage/file.ts` — 32 path resolvers, half of
  which pointed at the legacy `data/workspace/...` layout that was
  superseded by the new managed tree in `workspaces/`, `settings/`,
  `presets/`, `groups/`, `widgets/`, `cache/`, `styles/`, `logs/`.
- `src/management/storage/migration.ts` — a one-time migration
  service from the legacy layout to the new one, plus UAC elevation
  retry logic that only worked on Windows.

Symptoms:

1. The orphan-file bug — settings files materialising at
   `<supportRoot>/ty-plus/settings/*.json` instead of
   `<managed>/settings/*.json` — was hard to track because no
   single file described "where the settings file lives".
2. The ExtendScript fallback was untestable in jsdom and added
   roughly 800 lines of dead-on-CEP code paths.
3. `readNJson` callers had to thread a `supportRoot` argument
   through, which was redundant with the managed-root resolver.
4. `migrateLegacyStorageIfNeeded` was the only consumer of the
   legacy `data/workspace/...` path resolvers in
   `src/management/storage/file.ts`.
5. A global `__ty_plus_workspace_persistence_ready__` flag was set
   in `boot.tsx` to gate writes during onboarding. The flag
   duplicated the constraint that
   `resolveWriteManagedRoot` already enforced (throws when
   `ty-plus-init.json` is missing or incomplete).

## Decision

Centralise all managed JSON file I/O under
`src/management/storage/persistence/`. The module exposes three
APIs:

- `readJson(win, key, ...args)` / `writeJson(win, key, value, ...args)`
  — strongly-typed via the PATHS registry; the registry's
  `Tail<Parameters<...>>` type-derivation enforces per-key variadic
  args (e.g. `workspace-1.json` takes an `index: 1..5`).
- `readJsonText(win, key, ...args)` — returns the raw text for
  callers that need to parse themselves.
- `resolveReadManagedRoot(win)` / `resolveWriteManagedRoot(win)` —
  the only "where to write" helpers. `ty-plus-init.json` is the
  sole authority.

Asymmetric throw/null contract: writes throw when the locator is
missing or incomplete; reads return null in the same case. This is
the entire point — pre-onboarding writes surface as exceptions
that callers can decide to handle.

Specifically:

- ExtendScript fallback chain is removed. CEP Node fs is the only
  I/O path.
- `migrateLegacyStorageIfNeeded` is removed. The demo phase has
  no backward-compat shims.
- `__ty_plus_workspace_persistence_ready__` is removed. The
  persistence layer is its own gate.
- The `data/workspace/...` legacy path resolvers in
  `src/management/storage/file.ts` are removed.
- `readNJson` / `writeNJson` lose their `supportRoot` argument
  and route through `readJsonText` / `writeJson` keyed by
  `"workspace"`.
- 14 dead path resolvers in `file.ts` are deleted (8 test-only,
  4 zero-usage, 2 duplicated by `contracts/paths.ts`).

## Consequences

**Positive**

- One file describes "where the settings file lives":
  `src/management/storage/persistence/paths.ts`. Adding a new
  managed file is a 2-line change in the registry, not a search
  through 4 modules.
- The orphan-file bug is fixed because every writer funnels
  through the same resolver.
- Test count is stable: 791 tests pass after the refactor vs.
  797 before (5 tests deleted with the removed gate, plus 11
  added for the new `readJsonText` API and updated path
  resolvers).
- Extendscript typecheck passes — confirming no `.ext.ts`
  consumers remain.
- Window-specific concerns (UAC elevation, ExtendScript
  fallbacks) are no longer mixed with file-format concerns.

**Negative**

- Anyone who depended on the global readiness flag
  (`usePublicLink`, `useWorkspaceRuntime`) now relies on the
  persistence layer to throw on missing locator. Both call
  sites were updated; new callers must do the same.
- Removing the migration module means any pre-refactor users
  with data at `<managed>/data/...` would have to manually
  relocate it. Accepted: demo phase, no production users.

## Files

- `src/management/storage/persistence/` — new unified module
- `src/management/storage/file.ts` — 319 → 187 lines
- `src/management/workspace/persistence/store.ts` — 1,862 → 1,260 lines
- `src/management/workspace/layout/panel-json-files.ts` — 400 → 44 lines
- Deleted: `workspace/store.ext.ts`, `layout-store.ext.ts`,
  `workspace-store.ts`, `workspace-layout-store.ts`,
  `migration.ts`, `migration.test.ts`,
  `initialization-migration-wiring.test.ts`
- Net change: 8 commits, ~3,400 lines deleted
