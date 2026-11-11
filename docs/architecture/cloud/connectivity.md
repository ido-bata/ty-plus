# Connectivity

This document defines online/offline behavior in the current repo.

## Source Authority

Online surface implementation is under `src/management/online/`. The local core
(workspace, local presets, preset execution) must not depend on it — see
[`../offline-core.md`](../offline-core.md).

## Current Behavior

- `createFixtureCloudGateway()` returns an **empty** preset/notification
  catalog; no sample fixtures are bundled. The dialog renders an empty state,
  and `resolvePreset` for an unknown id throws by design.
- `createRuntimeCloudGateway()` binds the gateway to a runtime port. Without a
  deployed backend the gateway stays **dormant**: boot failure and
  unreachability degrade to a status display and never block the local core
  (the `cloud-gateway-boot` degraded path, plus the old #128/#187 separation
  fixes ported into this repo).
- Update/notification feeds are **static JSON** fetched directly by the panel
  (`docs/architecture/feeds.md`). They are fail-soft: fetch failure shows as
  "取得失敗" and does not affect local features.

## Product Decision

- Offline mode does not block local workspace / local preset execution.
- Online is additive value over the local route.
- Fixture / dormant mode is the dev/test/unset fallback, not the product value
  itself.

## Local Persistence Contract

| Contract | Implementation |
| --- | --- |
| Local persistence is authoritative | local preset store writes with `source: "local"`; local catalog read never touches the gateway |
| Cloud is non-blocking overlay | gateway health and catalog failures surface as status only, never throw into local paths |
| Core AE workflows work offline | unit suite runs without network; `PanelRoot.offline.test.ts` pins the wiring contract |

## Not in This Repo

The old repo's Supabase client/edge implementation was excluded from the port.
See [supabase.md](supabase.md) for the current status and re-porting
preconditions.

## See Also

- [feeds.md](../feeds.md) — static update/notification feed contract
- [offline-core.md](../offline-core.md) — offline core contract
- [supabase.md](supabase.md) — Supabase status (not ported)
- [media-surface.md](media-surface.md) — media surface
