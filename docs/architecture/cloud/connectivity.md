# Connectivity

This document defines online/offline behavior in the current repo.

## Source Authority

Online surface implementation is under `src/management/online/`. The local core
(workspace, local presets, preset execution) must not depend on it — see
[`../offline-core.md`](../offline-core.md).

## Current Behavior

- The only provided online surfaces are the **static JSON feeds** for updates
  and notifications, fetched directly by the panel
  (`docs/architecture/feeds.md`). They are fail-soft: fetch failure shows as
  "取得失敗" and does not affect local features.
- The unprovided online surfaces — remote preset catalog, public links, cloud
  gateway, Preset Library UI, `online.*` wire methods, the Rust `online`
  crate, and the cloud-gateway boot path — were removed structurally in #193.
  There is no fixture gateway, no `isFixture` badge contract, and no dormant
  service layer left to fall back to.

## Product Decision

- Offline mode does not block local workspace / local preset execution.
- Online is additive value over the local route.
- Unprovided features are removed from the structure entirely rather than
  kept unreachable; reintroduction requires a new backend contract and a new
  surface design (see [`../offline-core.md`](../offline-core.md)).

## Local Persistence Contract

| Contract | Implementation |
| --- | --- |
| Local persistence is authoritative | local preset store writes with `source: "local"`; the local catalog never touches a remote source |
| Provided feeds are non-blocking | feed fetch failures surface as status only, never throw into local paths |
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
