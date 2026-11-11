# Connectivity

This document defines online/offline behavior and fixture/remote switching.

## Source Authority

All cloud connectivity implementation is under `src/management/online/`.

## Current Behavior

- `createSupabaseGateway()` selects `remote` when `SUPABASE_URL` and
  publishable key are both set, otherwise `fixture`.
- `fixture` mode returns an **empty** preset/notification catalog; no sample fixtures are bundled. The dialog renders an empty-state, and `resolvePreset` for an unknown id throws by design (no fallback rows to mask miss-only behavior).
- `remote` mode provides `health`, `presets/search`, `download`, `upload-url`,
  `reports`, `presets` CRUD, `notifications`, `notification blocks`.
- `GET /presets` returning 404 is treated as empty cloud — continues gracefully.

## Product Decision

- Offline mode does not block local workspace / local preset execution.
- Online is additive value over the local route.
- Fixture mode is the dev/test/unset fallback, not the product value itself.

## Local Persistence Contract (MVP)

The **local persistence and cloud boundary slice (2026-05-02)** established:

| Contract | Implementation |
| --- | --- |
| Local persistence is authoritative | `PresetRepository.list()` returns fixture + local store (local first). `localPresetStore` writes with `source: "local"` |
| Cloud is non-blocking overlay | `createCloudSyncService.syncPresets()` returns `SyncStatus` only. Does not throw |
| Core AE workflows work offline | `createSupabaseGateway({ mode: "fixture" })` returns always-safe fallback without network |
| Deferred cloud behavior is non-precedent | Cloud `resolvePreset` is `getById` miss-only. Cloud publish/upload does not overwrite local |

## Deferred Cloud Behavior (Non-Blocking / Non-Precedent)

These cloud behaviors are **deferred**. They are additional value and do not
block offline core AE operations:

| Behavior | Status | Notes |
| --- | --- | --- |
| `cloudSync.syncPresets()` health probe | deferred-to-online | Use `healthCheck` or `searchPresets`. `listPresets()` is not archive-compliant |
| `searchPresets()` (market browse) | deferred-to-online | Additional search when not found in local store. Non-blocking |
| `getPresetDownloadUrl()` | deferred-to-online | Download from cloud storage. Non-blocking |
| `listNotifications()` | deferred-to-online | Fetch notifications. Non-blocking |
| `submitReport()` | deferred-to-online | Send report. Non-blocking |

## See Also

- [supabase.md](supabase.md) — Supabase implementation details
- [media-surface.md](media-surface.md) — media surface