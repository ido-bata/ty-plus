# Type-Driven Surfaces

`type` is a core axis used across panel / dialog / execution / sync, not just a storage concern.

## Purpose

`type` for `preset`, `widget`, `group`, `icon` is not a special mechanism name — it is a plain discriminator. The same `type` consistently determines:

- storage record shape
- dialog editing UI
- panel display and interactions
- execution path
- folder sync and icon rule application

## What `type` Connects

| Layer | What `type` determines |
|---|---|
| storage | `path` meaning, `param` schema |
| dialog | form structure, required fields, auxiliary UI |
| panel | display method, affordances, selection behavior |
| execution | execution method, targets, auxiliary conditions |
| sync | folder-sync expansion rules, exclusion conditions |
| icon | auto-application conditions, icon construction |

## Myths to Discard

- `type` is not a storage-only term
- `type` is not a UI-only term
- `type` is a plain discriminator — no special semantics per context

## Reading Guide

- storage responsibility and shape: [`../data/workspace-records/index.md`](../data/workspace-records/index.md)
- local contract details: [`../data/local-storage-contracts.md`](../data/local-storage-contracts.md)
- panel / dialog / widget surfaces: [workspace-surfaces.md](workspace-surfaces.md)
- UI overall composition: [ui-composition.md](ui-composition.md)
