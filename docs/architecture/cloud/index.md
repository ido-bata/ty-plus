# Cloud

`cloud/` is a docs topic for reading about external connectivity surfaces.
It is **not** a source ownership root. In source ownership, online/account/
licensing/remote catalog/notification belong to `src/management/online/`.

## Tree

```text
cloud/
├─ index.md
├─ connectivity.md
├─ supabase.md
├─ secrets.md
└─ media-surface.md
```

## Reading Order

1. [connectivity.md](connectivity.md) — online/offline and fixture/remote switching
2. [supabase.md](supabase.md) — current client/edge/migration
3. [secrets.md](secrets.md) — self-hosted Infisical binding and Secret consumers
4. [media-surface.md](media-surface.md) — auxiliary HTTP surface

## Source Ownership Note

`cloud/` is a documentation category, not a source root. Online functionality
is owned by `src/management/online/`:
- `src/management/online/connectivity/` — online/offline detection
- `src/management/online/catalog/` — remote preset catalog (dormant; no backend in R0)
- `src/management/online/notifications/` — notification list
- `src/management/online/update/` — static update feed client

The licensing module was removed in #5 (see
[`../offline-core.md`](../offline-core.md)). The old repo's Supabase
implementation was excluded from the port — see [supabase.md](supabase.md).

## Boundaries

- `cloud/` handles external connectivity only.
- Storage tree is in [`../storage/index.md`](../storage/index.md).
- Schema definitions are in the data contracts under the owning module.
