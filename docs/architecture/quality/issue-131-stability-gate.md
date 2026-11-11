# Issue #131 — AE freeze / startup starvation

## Symptom (Windows AE 2026, real machine)

When the ty-plus panel loads in After Effects 2026 on Windows,
some processing continues after first paint and **After Effects
itself becomes unresponsive** — not just the panel. Mouse/keyboard
input to AE's main window is dropped while the panel is finishing
its boot. The freeze lasts several seconds on cold start and
shortly returns. Functional verification of #127/#128/#130 was
suspended until this is resolved.

## Release SHA

Bundle SHA verified at audit time:
`ae2ecac4e2a74f762b2c9a4164b8ef01e7d23727` (release-0-10-0).
Bundle source matches repo HEAD — no drift.

## Startup workload (concurrent at boot)

1. `tryBuildThumbnailGateway(window)` — Rust worker spawn for
   thumbnail lookup. Heavy Node → CEP → Extendscript → Rust
   chain. Bounded by the scheduler.
2. `tryBuildCloudGateway(window)` — trust-mode / platform /
   extension-root gate, then `createOperationWorkerComposition`
   spawns the operation worker child for the online methods.
3. **Boot-time connectivity probe** (auto-fired on success).
4. **Boot-time catalog probe** (auto-fired on success).
5. **`runStartupPresetAssetScan`** — enumerates the local
   catalog and runs `verifyPresetAsset` per record via
   ExtendScript. Old code: `Promise.all(presets.map(...))`
   flushed N host round-trips into AE's main thread in one tick.
6. `initializeLogRetention(window)` — fire-and-forget host
   round-trip.
7. `initializeI18n(window)` — i18next init.
8. Layout/watch init inside the React tree (after first paint).

Items 3 + 4 + 5 have been the three effects exercising the AE
host main thread concurrently on first paint, producing the
observed freeze.

## Suspected unbounded host-call concurrency

- `scanPresetsForMissingAssets` previously used
  `Promise.all(presets.map(async preset => verifyPresetAsset(...)))`.
  Each `verifyPresetAsset` is a CEP → AE ExtendScript evalScript
  round-trip on the AE host main thread. A 100-item catalog
  starts 100 such round-trips in one tick, blocking AE for the
  duration of the batch.
- Boot-time connectivity + catalog probes fired
  unconditionally on every successful gateway boot (from
  `tryBuildCloudGateway` after `publishGatewayHealth({state:"live"})`).
- The startup workload also overlapped with the React tree's
  first mount, which itself issues `getPreset(...)` /
  catalog reads via `useSyncExternalStore`.

## Snapshot identity contract violation

`useSyncExternalStore` requires
`Object.is(getSnapshot(), getSnapshot()) === true` when state
is unchanged. The `runtime-gateway-health` and
`preset-asset-health` stores previously:

- Returned `clone(_current)` from `read*` — new object every
  call. React sees a "different" snapshot each render, drifts
  into "Maximum update depth exceeded".
- Fired `listener(clone(_current))` synchronously on `subscribe`.
  Every consumer of the gateway-health store pushed a fresh
  snapshot into the React render loop, compounding the
  depth-exceeded error.

Both stores now hold a single immutable snapshot per publish
and return it directly; subscribe does NOT fire on attach.

## Acceptance criteria (stability gate — primary)

The first acceptance gate is **stability**, not feature
completeness. Pass:

1. On Windows AE 2026 real machine, with default boot probe
   flag (off), load the panel. AE UI remains responsive
   throughout — no input drops, no-main-thread freeze.
2. With `TY_PLUS_BOOT_PROBES=on` set, repeat the load. AE UI
   remains responsive — boot probes fire but the asset scan
   no longer saturates the host thread.
3. Run for at least 60 seconds with the panel active. CPU %
   on `AfterFX.exe` does not stay pinned. Operation-worker
   child process count returns to 0 within 30 s of panel
   closing (or panel reload).
4. Debug Console (canonical `boot` source) shows, per panel
   reload, an entry for each of:
   `boot.workload.start` (8 entries: thumbnail-gateway-boot,
   cloud-gateway-boot, debug-log-retention, i18n-init,
   startup-preset-asset-scan, …)
   `boot.workload.finish` (matching finish entries; total
   count == start count)
   `boot.workload.report` (final aggregate)

If any `boot.workload.budget-exceeded` warning fires, the
operator should:
(a) note the workload name and elapsed-ms,
(b) correlate against the canonical `online-runtime` /
`operation-worker` log entries for the same reload,
(c) record the trace in this document under
`## Observations from AE verification`.

## What changed (commit summary)

- `scanPresetsForMissingAssets` runs sequentially,
  `concurrency: 1`, `perItemTimeoutMs: 1500`, accepts an
  `AbortSignal` for panel unload cancellation.
- `runStartupPresetAssetScan(win, signal?)` plumbs the
  AbortSignal through; abort snapshots `null` (no partial
  publish).
- `runtime-gateway-health` and `preset-asset-health`:
  single-immutable-snapshot per publish, identity-stable
  reads, no synchronous listener-on-subscribe.
- `boot-feature-flags.ts`: `TY_PLUS_BOOT_PROBES` env var
  gates the connectivity/catalog probes (default-unresolved,
  i.e. legacy-ON for backward compat). Production can set
  `=off` to opt out.
- `boot-workload-budget.ts`: per-workload 5 s soft budget
  with `boot.workload.start`, `boot.workload.finish`,
  `boot.workload.budget-exceeded`, `boot.workload.report`.
  Aborts in-flight scans on `pagehide` / `beforeunload`.
- `OperationWorkerScheduler` regression test: 64-job
  sustained enqueue shows peak `activeCount() ≤ 4` and
  returns to 0.

## Branch + commit strategy

All changes land directly on `release-0-10-0`. No feature
branch. Commits added on top of #128/#130:

1. `fix(stores): identity-stable snapshot contract (#131c)`
2. `fix(scan): sequential host verification with timeout (#131b)`
3. `feat(boot): boot-probe feature flag (#131d)`
4. `feat(boot): workload budget + panel-unload abort (#131e)`
5. `test(workers): outstanding-child-count invariant (#131f)`

## Out of scope (explicit)

- Functional acceptance of #128 / #130 deferred until
  stability gate passes.
- The single-shot React `useEffect` dependency that imports
  logger source on first paint — kept as-is. The
  useSyncExternalStore contract fix is the durable cure.
- Adding more fine-grained boot-side-effect budgets (per
  probe, per catalog record) — kept coarse so flag sets
  don't fragment.
