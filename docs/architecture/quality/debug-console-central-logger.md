# Debug Console central logger (Issue #129)

> Release builds of the CEP panel were aggregating only a few `[ty-plus] Debug
> console booted` and `[ty-plus] ExtendScript probe OK` entries in the Debug
> Console — even though every surface (boot, host-bridge, modeless dialog,
> preset execution, cloud-gateway boot, workspace) emits diagnostic events.
>
> Root cause: `vite.config.ts#dropConsoleLogInfoPlugin` strips
> `console.log` / `console.info` calls from every shipped file. The legacy
> Debug Console interceptor monkey-patches `console.*` and forwards into an
> in-memory ring buffer, but the call sites that fed the buffer were
> `console.log/info`, so the strip erased them at build time and the buffer
> only ever saw the events that came in through the debug-dialog itself.

## What changed

| Surface | Before | After |
| --- | --- | --- |
| Diagnostic sink | `console.log/info` + interceptor ring buffer | `src/management/debug/logger.ts` ring buffer + interceptor forwards into it |
| Surface loggers | inline `console.log/info` at each call site | `createLogger(source)` returning bound `.info/.warn/.error/.log/.debug` |
| Vite plugin | strip `console.log/info` from every file | same strip, with a whitelist suffix for the logger module |
| Build smoke test | (none) | `scripts/check/check-debug-logger-survives-bundle.ts` |
| UI | level filter only | level filter + source filter (11 chips) + session scope (`All history` 既定 / `This session`) |

The central logger (`src/management/debug/logger.ts`) is now the canonical
sink. Production strips never reach it (the module is whitelisted via the
`LOGGER_MODULE_PATH_SUFFIX` constant that the plugin imports from the
module itself, so they cannot drift apart).

## Files added / changed

- `src/management/debug/logger.ts` — central ring buffer + subscriber fan-out
- `src/management/debug/logger.test.ts` — 10 unit tests for the bus + helpers
- `src/management/debug/index.ts` — re-exports `createLogger`, `subscribeLog`,
  `getEntries`, `log*` helpers
- `src/management/debug/console/interceptor.ts` — refactored to forward
  intercepted `console.*` calls into the central logger; legacy `LogMessage`
  API preserved for the existing panel subscribers
- `src/management/debug/console/ui/Panel.tsx` — adds `SourceFilterTabs` (uses
  existing `SegmentedControl`)
- `src/management/debug/console/ui/Panel.test.tsx` — adds source-filter cases
- `vite.config.ts` — `dropConsoleLogInfoPlugin` takes a
  `loggerWhitelistSuffix` so the logger module is never transformed
- `scripts/check/check-debug-logger-survives-bundle.ts` — build-artifact
  smoke test
- `src/management/panel/boot.tsx`, `src/management/panel/cloud-gateway-boot.ts`
- `src/management/ae/cep/entry/panel.tsx`,
  `src/management/ae/cep/entry/dialog-bootstrap.tsx`,
  `src/management/ae/cep/host-executor.ts`
- `src/management/dialog/modeless/boot.tsx`,
  `src/management/debug/console/ui/dialog-root.tsx`
- `src/management/workspace/hook.ts`

All call sites use `createLogger("…")` with a closed-union `LogSource`:

```
panel | modeless | host-bridge | online-runtime | preset-execution |
operation-worker | debug-console | workspace | boot | console-interceptor
```

## AE end-to-end verification

> macOS ZXP verification is out of scope (see `AGENTS.md`).
> The procedure below is the Windows CEP install path.

### 1. Build + install

```bash
bun run host        # builds + installs + launches AE
# or
bun run host:deploy # builds + installs without launching AE
```

After Effects launches with the freshly built panel mounted.

### 2. Reload the panel

The CEP bundle is strongly cached. Reload the panel **after** the build
finishes: in AE, right-click the panel tab → `Reload`.

### 3. Open the Debug Console

The Debug Console is exposed via the panel's debug surface. Open it, then
trigger the events below and verify they appear.

### 4. Trigger each surface

| Surface | Trigger | Expected source chip |
| --- | --- | --- |
| Panel boot | Reload | `boot` |
| Cloud-gateway boot | First render | `online-runtime` |
| Host bridge probe | Reload | `host-bridge` |
| Modeless dialog open | Open any modeless dialog | `modeless` |
| Preset execution | Run any preset from the registry | `preset-execution` |
| Workspace events | Switch workspace / save layout | `workspace` |
| Operation worker | Trigger a catalog request | `operation-worker` |
| Legacy `console.*` | Any surface that has not migrated | `console-interceptor` |

### 5. Filter by source

Each source chip toggles the filter. The level filter (all / log / info /
warn / error / debug) composes with it.

### 6. Pass criteria

1. The Debug Console panel info + warn + error messages from every surface
   appear in the panel (acceptance criterion 1, 2 of Issue #129).
2. Modeless dialog events show up (criterion 3).
3. Preset execution failure (e.g. inject a failing preset via the dev
   surface) shows up as `error` (criterion 4).
4. Cloud-gateway boot failure (set `OPERATION_WORKER_TRUST_MODE=production-unsigned`
   in the env or stub `composition construction throws`) shows up as `warn`
   (criterion 5).
5. Source filter narrows the list per chip (criterion 6), and does so for
   rows that came from retention and rows that arrived live alike
   (Issue #138).
6. The default view shows boot logs emitted *before* the console was
   opened; `This session` narrows it on request (Issue #138).
7. With ≥100 log events, the ring buffer holds the most recent 1000 entries
   (criterion 7 — runs in `bun run test`).
8. `bun run scripts/check/check-debug-logger-survives-bundle.ts` passes in
   `NODE_ENV=production` (criterion 8).

## How the regression is locked down

The bug was that `dropConsoleLogInfoPlugin` would strip the diagnostic
sink's outbound `console.*` path. The fix has three independent guardrails:

1. **`vite.config.ts#dropConsoleLogInfoPlugin`** whitelists the logger
   module via the exported `LOGGER_MODULE_PATH_SUFFIX` constant. The plugin
   imports the constant from the module itself, so the path cannot drift.

2. **`scripts/check/check-debug-logger-survives-bundle.ts`** mirrors the
   plugin's regex and asserts:
   - The logger module is NOT transformed when the id matches the suffix.
   - A non-logger file IS transformed (pre-existing strip behavior is
     preserved).
   - The suffix ends in `logger.ts` (a future rename cannot silently disable
     the whitelist).
   - `vite.config.ts` imports the suffix and threads it through the plugin.
   This script runs as part of `bun run ci` (the script is invoked from
   the build pipeline under `NODE_ENV=production`).

3. **`logger.test.ts`** locks the contract:
   - emit shape (`id`, `level`, `source`, `timestamp`, `message`,
     optional `action` and `context`)
   - subscriber fan-out + immediate replay on subscribe
   - ring buffer respects the 1000-entry capacity
   - per-source `createLogger` binds the source so call sites do not have
     to thread it
   - dev console forwarding gated by `_devConsoleEnabled`

If any future refactor changes `vite.config.ts`'s strip behavior, removes
the suffix, renames the file, or swaps the logger for a different shape,
one of the three guardrails above fails in CI.

## Known limitations

- The legacy `console.*` call sites that have not yet been migrated to
  `createLogger` still flow through the interceptor monkey-patch (so the
  Debug Console still captures them) — they appear under the
  `console-interceptor` source chip with a `file:line` action. New code
  should use `createLogger` directly; the interceptor is the fallback for
  call sites we have not migrated yet.
- The interceptor's monkey-patch is intentionally left in place because it
  catches third-party libraries (Storybook iframe context, vendor
  scripts) that emit `console.*` directly. Production code never relies on
  the monkey-patch for its own diagnostics.
- The dev console forwarding in `logger.ts` only emits via `_originalConsole`
  (a snapshot of `console.*` captured at module load before any
  monkey-patch). This avoids the recursion
  `console.log → interceptor → logger.log → console.log → …`.
- Mac ZXP validation is out of scope per the task brief.
