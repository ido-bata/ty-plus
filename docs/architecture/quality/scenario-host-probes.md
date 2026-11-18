# Host-state-oracle probes (Issue #147, round-3 Blocker 3 + round-4 Blocker B)

AE-native UI (the AE settings dialog, the AE Project panel, ...) cannot
be addressed via CEP
DOM selectors because those surfaces are rendered by After Effects
itself, not by the CEP panel.  The Computer-Use runner needs to
verify what the host is showing, so the scenario spec carries a
`hostStateOracle` shape that runs an ExtendScript probe via
`evalScript` and matches the result against the expected value.

This document lists every host-state-oracle probe the round-3 / -4
scenarios depend on, where the probe lives, what it reads, and — for
each — whether the value is **real** (driven by production state
machine writes) or **removed** (no longer probe-able from CEP).

## Why real ExtendScript, not synthetic evalScript strings

Round-2 carried synthetic evalScript payloads like
`app.settingsVisibility` and `app.onlineState`.  AE's scripting
API does NOT expose either of those names — both probes would
return `undefined` and the runner would silently pass with a
false oracle.  Round-3 replaces them with real ExtendScript probes
that read panel-published state out of `$.global`.  Round-4 (Blocker
B) ensures every probe reads the SAME value the production state
machine writes; probes that cannot satisfy the contract are removed
rather than shipped with a synthetic flag.

## Probe catalogue (round-4 cut)

| probe id                                       | reads                                       | written by                                | round-4 status        | round-4 scenarios     |
|------------------------------------------------|---------------------------------------------|-------------------------------------------|-----------------------|-----------------------|
| `$.global.__TY_PLUS_HOST__.tyPlusProbeSettingsDialogState()` | n/a | n/a | **REMOVED** (round-4 Blocker B) | replaced by panel-state-oracle `[data-settings-sidebar]` on SCN-HOST-01 |
| `$.global.__TY_PLUS_HOST__.tyPlusProbeOnlineState()` | n/a | n/a | **REMOVED** (#193) | the cloud gateway / `runtime-gateway-health.ts` publisher was removed with the unprovided online surface; SCN-DEGRADED-01 was deleted |

## What was REMOVED (round-4 Blocker B)

`tyPlusProbeSettingsDialogState` was removed from
`host-bundle.ext.ts` and from `scenario-bindings.json` /
`procedures/SCN-HOST-01.json`.  Rationale:

- The "AE native Settings dialog" addressed by the round-3 probe
  does not have a CEP-side handle.  AE does not signal back to
  ExtendScript when the dialog opens / closes, so the round-3
  probe had to be panel-driven (`$.global.tyPlusSettingsDialogState`)
  for it to be observable.  That made the probe a self-fulfilling
  oracle: the panel wrote "shown" when its own click dispatched
  `openSettings`, and the panel wrote "hidden" when its own close
  dispatch landed.  The probe could not distinguish a real
  openSettings event from a stale flag.
- The `app.ty-plus.dialog-settings` (ty-plus CEP Settings
  dialog) is rendered by the panel, so it is addressable via a
  panel-state-oracle `[data-settings-sidebar]` (see SCN-SETTINGS-01).
  SCN-HOST-01 now uses this oracle on the open / close steps
  instead of a host-state-oracle probe.

SCN-HOST-01 was rewritten (round-4 Blocker A) to describe the
ty-plus CEP Settings dialog and to remove every reference to the
removed probe.

## What is intentionally NOT a probe

Probes that are **structurally infeasible** in AE were DROPPED
from round-2's spec rather than shipped as synthetic evalScript.
Concrete examples:

- `app.settingsVisibility` — AE's scripting API does not expose
  the AE settings dialog visibility.  Removed (round-4 Blocker B);
  replaced by the ty-plus CEP Settings dialog panel-state-oracle
  on SCN-HOST-01.
- `app.onlineState` — AE's scripting API does not expose the
  network connectivity state.  The panel-driven `tyPlusOnlineState`
  probe was removed in #193 together with the cloud gateway.
- `app.project.activeItem` accesses etc. — the canonical
  `host-bundle.ext.ts` already exposes `getHostContext` and
  selection-state probes via `wrapCallable`.  Future scenarios may
  reuse them.

If a future scenario needs a host-side signal that AE does not
expose, do NOT ship a synthetic evalScript — file an issue and
extend the probe catalogue above with a real ExtendScript
implementation that reads from `$.global` AND is wired to the
production state machine.

## Procedure binding shape

A `hostStateOracle.script` value is the literal ExtendScript call
string.  Procedure JSON files in `src/shared/scenario/procedures/*.json`
carry the call verbatim:

```json
{
  "hostStateOracle": {
    "method": "evalScript",
    "script": "$.global.__TY_PLUS_HOST__.getHostContext()",
    "expected": { "hasKey": "app_root" }
  }
}
```

The runner calls `evalScript(script)` and parses the JSON-encoded
result the `wrapCallable` helper returns.  The
`expected.equals` / `expected.contains` / `expected.matches`
predicates match against the `value` field of the result.

## Why this lives here, not in `aep-fixture-strategy.md`

The fixture doc describes `.aep` files and runner load paths.
Probes are a different concern: they describe host-side state
the runner reads AFTER the fixture is open.  Splitting the two
docs keeps each focused on one runtime concern.