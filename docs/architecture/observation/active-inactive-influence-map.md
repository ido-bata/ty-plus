# Active/Inactive Influence Map

Code physically present vs code reachable through active imports, registries, manifests, routes, build targets, tests, or docs.

## Active Influence

### Core Active Paths

- `src/function/*` — widget and preset feature implementations
- `src/management/*` — storage, persistence, dialogs, i18n, settings
- `src/shared/*` — pure utilities and primitive components

### Registry-Reachable

- `src/function/widget/contract.ts` — Widget registry reachable from workspace panel
- `cep.config.ts` — panel and dialog routes for build targets

## Inactive / Physically Present

| Path | Status | Evidence |
|------|--------|----------|
| `archive/` | inactive | No active import paths; contains tests for removed code |
| `docs/no-use/` | inactive | Clearly deprecated, no active references |
| `docs/plans/` | inactive (except explicit) | Not referenced from main docs |
| `reference/bolt-cep/` | upstream reference | Read-only upstream, not active workflow |

## Frozen But Present

| Item | Location | Notes |
|------|----------|-------|
| panel2–panel5 | cep.config.ts (commented) | Frozen routes, no cleanup confirmed |

## Unknown

- `archive/` test activation: **Unknown** — no confirmed CI pipeline usage

## Debt Signals

1. Frozen panels in cep.config.ts — commented entries with no confirmed cleanup plan
2. archive/ directory physically present but no active influence
