# T2 excluded Vitest inventory

Audit snapshot: 2026-08-14 (working tree)

This review records the test files hidden by `vitest.config.ts` at the T2 gate. It is a plan artifact, not an official product specification.

## Gate summary

- Configured run: 145 files, 1,356 tests, 1,356 passed.
- Repository candidates matching `src/**/*.test.{ts,tsx}` or `tools/**/*.test.ts`: 163 tracked files.
- Existing exclusions in the config: 19 paths; 18 exist and one stale path (`src/management/storage/migration.test.ts`) does not exist.
- Audit run of the 18 existing exclusions: 18 files, 86 collected tests, 53 passed, 33 failed, exit 1.
- File result: 4 pass, 8 assertion-fail, 6 collection-fail.
- The six collection failures can hide additional tests because their modules did not finish loading.
- `passWithNoTests` is not enabled. A nonexistent file filter exits 1.

The audit used an OS-temporary Vitest config which imported the tracked config and replaced only `test.exclude` with the ordinary dependency/build/document exclusions. No product or repository config was changed.

## Implementation status

```yaml
implementation_snapshot: 2026-08-14
tasks:
  T2-VITEST-REINCLUDE-GREEN:
    status: complete
    changes:
      reenabled_files: 4
      removed_stale_exclusions: 1
    evidence:
      files_only: 156
      focused_passed_files:
        - src/function/onboarding/ui/Animation.test.tsx
        - src/management/preset/workspace/Tile.test.tsx
        - src/management/setting/dialog/sections/ComponentPreviewSection.test.tsx
        - src/management/storage/initialization.test.ts
  T2-VITEST-DOM-HARNESS:
    status: verification_pending
    changes:
      reenabled_files: 7
      environment: happy-dom
      global_browser_mock_added: false
      product_fallback_added: false
    verified_passed_files:
      - src/management/dialog/ModelessRoot.test.ts
      - src/management/panel/boot.test.tsx
      - src/management/preset/editor/Code.test.tsx
    final_patch_not_reverified:
      - src/function/preset/tool-dialogs.test.tsx
      - src/management/dialog/Root.test.ts
      - src/management/panel/Main.test.tsx
      - src/management/workspace/background/Dialog.test.tsx
    verification_note: >-
      File-level transforms for these heavy suites took 33-52 seconds. The final
      Main-only run reached its 35-second process limit before Vitest emitted a
      result, so additional heavy commands were stopped for the supervisor's
      serialized verification run.
  T2-TSC-TEST-014:
    status: runtime_partial
    changes:
      type_diagnostics_fixed: 16
      reenabled_files: 2
      production_fallback_added: false
    evidence:
      typecheck_test_owned_diagnostics: 0
      typecheck_test_total_remaining: 18
      focused_passed_files:
        - file: src/management/storage/widget-state-store.test.ts
          tests: 7
        - file: src/management/widget/__e2e__/display.test.tsx
          tests: 13
        - file: src/management/workspace/placement/notify-panels-after-preset-save.test.ts
          tests: 3
      preset_edit_probe:
        result: pass
        tests: 1
        skipped: 24
        duration_seconds: 23.67
      preset_edit_full_run:
        result: timeout
        limit_seconds: 180
        exclusion_retained: true
      files_only: 158
      biome_checked_files: 5
      biome_result: pass
```

After these changes, `vitest list --filesOnly` discovers 158 files. Five real file-specific exclusions remain and belong to the other ownership groups below. The preset edit suite now collects with its file-local editor mock, but remains excluded because the bounded full-file run did not complete.

## Machine-readable inventory

```yaml
schema_version: 1
configured_scope:
  files: 145
  tests: 1356
  passed: 1356
repository_scope:
  tracked_candidate_files: 163
excluded_scope:
  configured_paths: 19
  existing_files: 18
  stale_paths:
    - src/management/storage/migration.test.ts
  collected_tests: 86
  passed_tests: 53
  failed_tests: 33
inventory:
  - file: src/function/onboarding/ui/Animation.test.tsx
    result: pass
    failed_tests: 0
    signature: null
    owner_task: T2-VITEST-REINCLUDE-GREEN
  - file: src/management/preset/workspace/Tile.test.tsx
    result: pass
    failed_tests: 0
    signature: null
    owner_task: T2-VITEST-REINCLUDE-GREEN
  - file: src/management/setting/dialog/sections/ComponentPreviewSection.test.tsx
    result: pass
    failed_tests: 0
    signature: null
    owner_task: T2-VITEST-REINCLUDE-GREEN
  - file: src/management/storage/initialization.test.ts
    result: pass
    failed_tests: 0
    signature: null
    owner_task: T2-VITEST-REINCLUDE-GREEN
  - file: src/management/dialog/ModelessRoot.test.ts
    result: assertion_fail
    failed_tests: 5
    signature: "ReferenceError: window is not defined"
    owner_task: T2-VITEST-DOM-HARNESS
  - file: src/management/dialog/Root.test.ts
    result: assertion_fail
    failed_tests: 6
    signature: "ReferenceError: window is not defined"
    owner_task: T2-VITEST-DOM-HARNESS
  - file: src/management/panel/boot.test.tsx
    result: assertion_fail
    failed_tests: 5
    signature: "TypeError: win.addEventListener is not a function"
    owner_task: T2-VITEST-DOM-HARNESS
  - file: src/management/storage/contract.test.ts
    result: assertion_fail
    failed_tests: 2
    signature: "ty-plus-init.json not found (no app root)"
    owner_task: T2-VITEST-STORAGE-CONTRACT
  - file: src/management/storage/widget-state-store.test.ts
    result: assertion_fail
    failed_tests: 2
    signature: "persistence mock does not export readJsonText"
    owner_task: T2-VITEST-MOCK-CONTRACTS
    remediation:
      status: pass
      tests: 7
      exclusion_removed: true
  - file: src/management/preset/editor/Code.test.tsx
    result: assertion_fail
    failed_tests: 2
    signature: "ReferenceError: window is not defined"
    owner_task: T2-VITEST-DOM-HARNESS
  - file: src/management/preset/__e2e__/remove.test.tsx
    result: assertion_fail
    failed_tests: 10
    signature: "delete action/callback assertions observe zero calls or no deleting button"
    owner_task: T2-VITEST-PRESET-FLOWS
  - file: src/management/widget/workspace/TileContent.test.tsx
    result: assertion_fail
    failed_tests: 1
    signature: "rendered application markup does not contain data-route=align"
    owner_task: T2-VITEST-WIDGET-ROUTING
  - file: src/function/preset/tool-dialogs.test.tsx
    result: collection_fail
    failed_tests: 0
    signature: "document.queryCommandSupported is not a function"
    owner_task: T2-VITEST-DOM-HARNESS
  - file: src/management/panel/Main.test.tsx
    result: collection_fail
    failed_tests: 0
    signature: "window is not defined"
    owner_task: T2-VITEST-DOM-HARNESS
  - file: src/management/preset/edit/Dialog.test.tsx
    result: collection_fail
    failed_tests: 0
    signature: "vscode-oniguruma/onig.wasm imports missing package env"
    owner_task: T2-VITEST-MONACO-HARNESS
    remediation:
      status: runtime_verification_pending
      collection_probe: pass
      passed_tests: 1
      skipped_tests: 24
      full_run: timeout_180s
      exclusion_removed: false
  - file: src/management/preset/__e2e__/create.test.tsx
    result: collection_fail
    failed_tests: 0
    signature: "hoisted vi.mock factory references invalid top-level state"
    owner_task: T2-VITEST-PRESET-FLOWS
  - file: src/management/widget/__e2e__/display.test.tsx
    result: collection_fail
    failed_tests: 0
    signature: "widget registry mock does not export _widgetGlobs"
    owner_task: T2-VITEST-MOCK-CONTRACTS
    remediation:
      status: pass
      tests: 13
      exclusion_removed: true
  - file: src/management/workspace/background/Dialog.test.tsx
    result: collection_fail
    failed_tests: 0
    signature: "document.queryCommandSupported is not a function"
    owner_task: T2-VITEST-DOM-HARNESS
```

## Recommended ownership groups

| Task | Scope | Exit condition |
| --- | --- | --- |
| `T2-VITEST-REINCLUDE-GREEN` | Remove the four currently passing files from `exclude`; delete the stale migration exclusion. | The configured suite discovers 149 files and remains green. |
| `T2-VITEST-DOM-HARNESS` | Put browser-dependent suites in an explicit nearby jsdom/happy-dom harness; provide only browser APIs the product actually requires (`window`, event listeners, `queryCommandSupported`). | All six owned files collect and pass without a global catch-all browser mock. |
| `T2-VITEST-MOCK-CONTRACTS` | Update partial mocks to preserve the current module exports (`readJsonText`, `_widgetGlobs`). | Both files collect and pass; mocks fail visibly when required exports change again. |
| `T2-VITEST-STORAGE-CONTRACT` | Align onboarding/app-root setup with the current storage contract. | Both storage assertions pass using an explicit test-owned support root. |
| `T2-VITEST-PRESET-FLOWS` | Repair hoisted create mocks and update remove-flow interaction/async expectations. | Create collects; all ten remove assertions and all create assertions pass. |
| `T2-VITEST-MONACO-HARNESS` | Isolate or provide the Monaco/oniguruma WASM dependency in the test harness. | Dialog suite collects and passes without a production fallback. |
| `T2-VITEST-WIDGET-ROUTING` | Update the route assertion or implementation after verifying the current widget registry contract. | The real align workspace component is asserted structurally, not through brittle serialized markup. |
| `T2-VITEST-REINCLUDE-ALL` | Remove the remaining file-specific exclusions after the owner tasks are green. | `vitest list --filesOnly` reports all 163 tracked candidates and the full run exits 0. |

## Reproduction commands

```text
bun run vitest list --filesOnly
bun run vitest run --reporter=json --outputFile=<os-temp-json>
bun run vitest run src/__audit_definitely_missing__.test.ts --reporter=dot
```

The excluded-file audit requires a temporary config because positional filters do not override configured exclusions. The temporary config must live in the OS temporary directory, set the repository as `root`, import the repository config, and replace only `test.exclude`.

## Remaining risks

- A green configured run currently proves only the 145-file subset, not the tracked 163-file repository scope.
- The six collection failures make 86 a lower bound for excluded tests; more tests may become discoverable after module loading is repaired.
- Five aliases in `vitest.config.ts` currently target missing paths. They have no active imports in `src/` or `tools/`, so they do not affect this run, but they are stale configuration debt.
- The global setup extends jest-dom matchers and initializes i18n, but does not provide the browser APIs responsible for the DOM-harness failures. Prefer per-domain/per-file harnesses over broad global stubs.
