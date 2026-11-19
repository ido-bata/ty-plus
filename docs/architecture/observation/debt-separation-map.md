# Debt Separation Map

Evidence/classification pass for active debt separation. This document records findings without changing source code.

## Snapshot Notice

This map is a dated evidence snapshot. References to `supabase/functions/`, the Supabase edge function, `PresetLibraryDialog`, or other unprovided online surfaces describe the pre-port repository or pre-#193 state; those surfaces do not exist in the current tree (see `docs/architecture/observation/index.md`).

## Classification System

| Tag | Meaning |
|-----|---------|
| **active-blocking** | Reachable through active imports/registries, blocks clean debt separation |
| **active-tolerated** | Reachable but explicitly temporary, scheduled for resolution |
| **implemented-not-exposed** | Physical presence confirmed; no active import/registry path found |
| **historical-reference** | Useful as precedent/documentation; not active |
| **obsolete-remove-later** | Dead code, no active path, can be removed without product impact |

## Widget Registry Status

**Primary authority:** `src/function/widget/contract.ts` — 6 active entries

**Legacy:** `src/js/ui/widgets/widgets.ts` — archived

## Media Surface

**Status:** Optional via `--with-media-surface` flag or `TY_PLUS_MEDIA_SURFACE=true` env var

- `src/media-surface/` preserved for future expansion
- Not active in default dev workflow

## Debug Console

**Status:** Extension ID exists but may not have active CEP panel entry.

## Summary Table

| Item | Classification | Blocking? | Action Required |
|------|--------------|----------|-----------------|
| Widget registry | resolved | No | Primary authority is `src/function/widget/contract.ts` |
| Media surface | resolved (P1) | No | Optional via flag |
| Debug console | active-tolerated | No | Verify CEP manifest entry exists |

## Debt Signals Not Addressed in This Pass

1. **Dual i18n directories** — Legacy path references exist. Current consolidation is in progress.

2. **Dialog extension ID competing authorities** — Active-blocking but requires dialog system refactor.

3. **Supabase edge function in-memory fallback** — production behavior undefined.

4. **Command ID / Environment ID definitions** — unknown authority.
