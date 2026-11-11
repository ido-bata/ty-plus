# T2 TypeScript typecheck inventory

Date: 2026-08-14

## Purpose and snapshot

This is the resumable inventory for recovering the Phase 1 T2 TypeScript gate.
It is evidence for the redesign plan, not an official product specification.

The inventory was captured by removing the legacy `src/**/*.test.*` and
`src/function/**` exclusions from the main project and removing the Adobe
ambient package from the DOM project. The command was:

```text
bunx tsc -p tsconfig.json --noEmit
```

The snapshot contains exactly 284 diagnostics:

| Work class | Count | Meaning |
| --- | ---: | --- |
| `T2-TSC-ENV` | 75 | Project/test environment declarations or compiler policy |
| `T2-TSC-PROD` | 27 | Product source contract errors |
| `T2-TSC-TEST` | 182 | Stale test mocks, fixtures, payloads, and assertions |

Do not restore broad source exclusions to reduce these counts. Re-run the same
classification after each work group and record the new count in this file.

## Project split target

The final typecheck graph must make the runtime boundary explicit:

1. `tsconfig.base.json` owns platform-neutral strict compiler options and path
   aliases. It must not load DOM or Adobe ambient globals.
2. `tsconfig.json` is the React/CEP product project. It owns `ES2022` + `DOM`,
   includes `src/function/**`, `src/management/**`, and `src/shared/**`, and does
   not load `types-for-adobe`.
3. `tsconfig.test.json` extends the React project for `*.test.ts(x)`, `__e2e__`,
   and `vitest.setup.ts`. It loads the Vitest and Testing Library matcher types.
4. `tsconfig.extendscript.json` owns only `src/**/*.ext.ts`, `ES2015`, and the
   Adobe ambient packages. It must not inherit the DOM project.
5. `bun run typecheck` must enumerate `typecheck:main`, `typecheck:test`, and
   `typecheck:extendscript`. A project is not considered covered merely because
   another project excludes it.

`src/function/**` can remain in the React project. A dedicated function project
is only justified if it needs a materially different lib/type environment.

## Environment and project work

### T2-TSC-ENV-001 — split the compiler projects

- Status: implemented and verified on 2026-08-14; awaiting supervisory commit.
- Ownership: `tsconfig.base.json`, `tsconfig.json`, new
  `tsconfig.test.json`, `tsconfig.extendscript.json`, and the typecheck scripts
  in `package.json`.
- Required result: no DOM/Adobe ambient overlap; all product, tests, and
  ExtendScript files belong to one listed project.
- Verification:
  - `bun run typecheck:main`
  - `bun run typecheck:test`
  - `bun run typecheck:extendscript`
  - `bun run typecheck`

The independent results are main 27 product diagnostics, test 182 diagnostics,
and ExtendScript 0 diagnostics. The aggregate script names all three projects;
it remains red because main correctly fails on product source.

### T2-TSC-ENV-002 — install the test matcher declarations

- Status: complete; the matcher diagnostic count is now 0.
- Count: 70 `TS2339` diagnostics.
- Ownership: `tsconfig.test.json` and `vitest.setup.ts`.
- Expected fix: load the Vitest-specific Testing Library matcher augmentation;
  do not add assertion casts at each call site.
- Highest-count files:

| File | Count |
| --- | ---: |
| `src/management/preset/edit/Dialog.test.tsx` | 27 |
| `src/management/preset/__e2e__/remove.test.tsx` | 16 |
| `src/management/workspace/background/Dialog.test.tsx` | 8 |
| `src/function/preset/tool-dialogs.test.tsx` | 6 |
| `src/management/preset/workspace/Tile.test.tsx` | 5 |
| `src/management/preset/__e2e__/create.test.tsx` | 4 |
| component preview tests | 3 |
| `src/management/preset/markdown/LiveEditor.test.tsx` | 1 |

### T2-TSC-ENV-003 — remove explicit `.tsx` import suffixes

- Status: complete; the `TS5097` diagnostic count is now 0.
- Count: 5 `TS5097` diagnostics.
- Ownership:
  - `src/function/widget/core/align/descriptor.ts`
  - `src/function/widget/core/anchor-point/descriptor.ts`
  - `src/function/widget/core/anchor-point/index.test.tsx`
  - `src/function/widget/core/layout-lock/index.ts`
  - `src/function/widget/core/menu/index.ts`
- Implemented fix: use `.jsx` runtime specifiers. Each directory contains both
  `index.ts` and `index.tsx`, so an extensionless import resolves to the wrong
  `index.ts` module. TypeScript resolution tracing confirms that `.jsx` maps to
  the intended `index.tsx` source. No `allowImportingTsExtensions` exception was
  enabled.
- Verification: run `bun run typecheck:main` and `bun run typecheck:test`.

## Product source work

| ID | Ownership | Count | Primary contract failure |
| --- | --- | ---: | --- |
| `T2-TSC-PROD-001` | `src/function/widget/core/easing/Component.tsx` | 9 | stale state/value/clipboard/event contracts and an undefined `customColors` binding |
| `T2-TSC-PROD-002` | `src/function/widget/utility/info/preset-sections.tsx` | 6 | unresolved imports and stale preset-section shapes |
| `T2-TSC-PROD-003` | `src/function/widget/core/align/index.tsx` | 3 | `SurfaceState.alignTarget` no longer exists |
| `T2-TSC-PROD-004` | `src/function/widget/utility/font-viewer/Component.tsx` | 3 | current component/state contracts do not match |
| `T2-TSC-PROD-005` | `src/function/widget/utility/info/preset.tsx` | 2 | current preset contract does not match |
| `T2-TSC-PROD-006` | anchor-point, menu, font-viewer descriptor, and quick-actions source | 4 | isolated current-contract errors |

Product work totals 27 diagnostics. Each ID should be reviewed against current
type definitions; do not restore removed fields merely to satisfy legacy UI.

## Test mock and fixture work

After the environment work and concurrent fixture remediation,
`bun run typecheck:test` reports 182 diagnostics. Of these, 160 are in test
files and 22 are imported product-source diagnostics. The 160 test diagnostics
are primarily `TS2339`, `TS2353`, `TS2322`, `TS2345`, `TS2352`, and `TS2741`.
They indicate mocks or payloads that no longer implement the current contracts,
rather than missing ambient globals.

| ID | Ownership | Count |
| --- | --- | ---: |
| `T2-TSC-TEST-001` | `src/management/workspace/events/handler.test.ts` | 22 |
| `T2-TSC-TEST-002` | `src/management/storage/snapshot-store.test.ts` | 14 |
| `T2-TSC-TEST-003` | cache-store, candidates-cache, and grid-coords tests | 27 |
| `T2-TSC-TEST-004` | `src/management/workspace/__e2e__/place.test.ts` | 8 |
| `T2-TSC-TEST-005` | `src/function/onboarding/ui/SetupRequired.test.tsx` | 7 |
| `T2-TSC-TEST-006` | preset markdown and onboarding tests | 12 |
| `T2-TSC-TEST-007` | setting onboarding initialization test | 6 |
| `T2-TSC-TEST-008` | `src/management/storage/contract.test.ts` | 6 |
| `T2-TSC-TEST-009` | append-preset-from-dialog-disk test | 6 |
| `T2-TSC-TEST-010` | `src/management/storage/ui/DirectoryBrowser.test.tsx` | 5 |
| `T2-TSC-TEST-011` | catalog-grouping tests | 5 |
| `T2-TSC-TEST-012` | directory-browser context-menu test | 4 |
| `T2-TSC-TEST-013` | online catalog use-case and gateway tests | 5 |
| `T2-TSC-TEST-014` | preset edit, widget-state, widget display, and notify-panel tests | 16 |
| `T2-TSC-TEST-015` | remaining lower-count test files | 17 |

### TEST-001 through TEST-007 checkpoint

Completed on 2026-08-14, awaiting supervisory commit:

| ID | Before | After |
| --- | ---: | ---: |
| `T2-TSC-TEST-001` | 22 | 0 |
| `T2-TSC-TEST-002` | 14 | 0 |
| `T2-TSC-TEST-003` | 27 | 0 |
| `T2-TSC-TEST-004` | 8 | 0 |
| `T2-TSC-TEST-005` | 7 | 0 |
| `T2-TSC-TEST-006` | 12 | 0 |
| `T2-TSC-TEST-007` | 6 | 0 |

The seven groups removed 96 test-file diagnostics. The target Vitest run passes
all 10 files and 171 tests. The first combined run hit a transient `ENOSPC`
while loading `cache-store.test.ts`; the other 9 files and 160 tests passed,
and an immediate isolated retry passed the remaining file and 11 tests.

### TEST-008 through TEST-011 checkpoint

Completed on 2026-08-14, awaiting supervisory commit:

| ID | Owned files | Before | After |
| --- | --- | ---: | ---: |
| `T2-TSC-TEST-008` | `src/management/storage/contract.test.ts` | 6 | 0 |
| `T2-TSC-TEST-009` | `src/management/workspace/placement/append-preset-from-dialog-disk.test.ts` | 6 | 0 |
| `T2-TSC-TEST-010` | `src/management/storage/ui/DirectoryBrowser.test.tsx` | 5 | 0 |
| `T2-TSC-TEST-011` | `src/function/widget/utility/directory-browser/catalog-grouping.test.ts`, `src/function/widget/utility/directory-browser/catalog-grouping-integration.test.tsx` | 5 | 0 |

These four groups removed 22 test-file diagnostics. The storage contract now
uses the current `initializeWorkspaceStorage` mock contract, requires the
supplied session support root, and verifies that `ty-plus-init.json` is placed
directly below that root. It does not restore registry, environment-variable,
or fixed-path fallback behavior. Preset fixtures use the current `Preset`
shape, placement mocks preserve the production function signature, and
DirectoryBrowser/catalog fixtures satisfy their current component/data
contracts without `unknown` casts.

Validation evidence:

- `bun run typecheck:test`: all five owned files report zero diagnostics. The
  project still exits nonzero for later inventory groups.
- Standard focused Vitest run: four non-excluded files, 19 tests passed.
- `src/management/storage/contract.test.ts` is still excluded by the shared
  Vitest configuration, so it was run with an OS-temporary test-local config
  that retained the workspace alias/setup and removed that exclusion: 1 file,
  17 tests passed.
- `bun run biome check` over all five owned files: passed.

The next test-fixture restart marker is `T2-TSC-TEST-012`.

### T2-VITEST-WIDGET-ROUTING checkpoint

Completed on 2026-08-14, awaiting supervisory commit.

The stale `TileContent.test.tsx` serialized-markup assertion was replaced with
a structural DOM assertion against the real Align workspace component. The test
now verifies both registry identity (`descriptor.component === Align`) and the
rendered application surface with all six primary align action buttons.

Runtime audit exposed a resolver mismatch that the old mocks hid: TypeScript
resolved `./index.jsx` to `index.tsx`, while Vite/Vitest selected the adjacent
operations-only `index.ts`, leaving the descriptor component undefined. The UI
implementations for Align, Anchor Point, Menu, and the same-shape Layout Lock
module were moved from `index.tsx` to `Component.tsx`; descriptor, registry-test,
and component-test imports now use extensionless `./Component`. The concurrent
Anchor Point CEP-window mock additions were retained.

Validation evidence:

- `bun run typecheck:main`: passed.
- `bun run typecheck:test`: all routing/renamed-component files report zero
  diagnostics; the project still exits nonzero for later inventory groups.
- `registry.integration.test.ts` plus the Anchor Point component test: 2 files,
  7 tests passed.
- Excluded `TileContent.test.tsx`, run with an OS-temporary test-local config:
  1 file, 1 test passed; the temporary config was removed afterward.
- `bun run build:cep`: passed, exercising Vite's eager registry glob and module
  export resolution. The older `bun tools/check/widget-registry.ts` helper is
  not usable with the installed Bun 1.3 runtime because `import.meta.glob` is
  unavailable outside Vite.
- Biome over the 11 changed source/test files: passed.
- React Doctor diff scan: score 98/100, no issues.
- No `index.jsx` or `index.tsx` import/mock specifier remains for the four
  collision-fixed widget modules.

### TEST-015 checkpoint

Completed on 2026-08-14, awaiting supervisory commit.

The original group contained 17 diagnostics. During implementation,
`TileContent.test.tsx` and `anchor-point/index.test.tsx` moved to the dedicated
widget-routing work, leaving 15 diagnostics in these 10 owned test files:

- `src/function/preset/__e2e__/execute.test.ts`
- `src/function/widget/utility/directory-browser/single-click-navigation.test.tsx`
- `src/management/dialog/dialogs/unified-context-menu.test.ts`
- `src/management/preset/__e2e__/remove.test.tsx`
- `src/management/preset/icon-data.test.ts`
- `src/management/setting/onboarding/complete.test.ts`
- `src/management/setting/persistence/workspace-ui-settings-file.test.ts`
- `src/management/workspace/easing-colors.test.ts`
- `src/management/workspace/state/normalize.test.ts`
- `src/management/workspace/undo/history.test.ts`

All 15 diagnostics are now removed. Fixtures use the current preset, icon,
file-browser, workspace, and snapshot contracts. Snapshot-store mocks use
Vitest `MockedFunction` types derived from the production functions; no type
relaxation or new `unknown` cast was added. The remove E2E fixture also models
the current asynchronous host-confirmation boundary.

The final imported-product diagnostic came from the test project not including
`src/vite-env.d.ts`, so the oniguruma WASM import lost the Vite plugin's base64
string declaration. `tsconfig.test.json` now explicitly includes that ambient
definition; no product-source reference or compiler relaxation was added.

Validation evidence:

- `bun run typecheck:test`: passed with zero diagnostics.
- `bun run typecheck:main`: passed with zero diagnostics.
- Standard focused Vitest: 8 files and 122 tests passed; the history file's
  first test hit a transient five-second timeout only in the combined run, and
  its isolated retry passed all 16 tests.
- Excluded `remove.test.tsx`, run with an OS-temporary test-local config: 1 file,
  11 tests passed. The temporary config was removed afterward.
- Biome over the 10 owned tests plus `tsconfig.test.json`: passed.
- `git diff --check` over the owned changes: passed.

For each group, update fixtures to the current definition source and type mocked
functions with Vitest's mocked-function helpers. Do not silence the diagnostics
with `unknown` casts unless the test is specifically verifying an invalid input
boundary.

## Configuration review evidence

- The React/DOM project now includes `src/function/**`, the previously excluded
  panel product tree, and all other non-test product source. It does not load
  Adobe ambient types and reports only the 27 recorded product diagnostics.
- Tests are owned by `tsconfig.test.json`; the Vitest-specific Testing Library
  augmentation is loaded by both its type list and `vitest.setup.ts`.
- `tsconfig.extendscript.json` has `lib: ["ES2015"]` and Adobe types only, and
  passes independently.
- Biome 2.5.7 accepts the current rule schema. The constant-condition exception
  was narrowed to `src/management/ipc/request.test.ts`, the only intentional
  `if (false)` type-check block found by the linter.
- New generator and runtime boundary modules are Knip entries, not ignored
  files. `bunx knip` passes, apart from the existing `.css` configuration hint.
- `bunx biome check src` reaches all 727 files and passes. No `generated/**`
  exclusion was added; generated output remains subject to the same check.

## Resumption point

1. Start at `T2-TSC-PROD-001`; the environment work is complete.
2. Complete the six product groups before test fixture work.
3. Process the updated test groups in table order, rerunning `bun run typecheck:test` after
   every group.
4. When all three projects pass, run `bun run typecheck`, `bunx knip`, and
   `bunx biome check src`, then update `phase1-t2-gate.md` and the plan status.

The exact restart marker is `T2-TSC-PROD-001`; no product or test diagnostics in
this inventory have been waived.
