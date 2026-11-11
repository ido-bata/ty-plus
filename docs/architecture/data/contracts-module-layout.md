# Contracts Module Layout

This document defines how contracts are organized under `src/management/` and `src/function/`.

## Principle

- Contracts are co-located with the module that owns the responsibility.
- Do not accumulate shapes into a single `platform.ts`.
- Each domain has its own contract file.

## Layout

### `src/management/`

| File | Responsibility |
| --- | --- |
| `storage/contract.ts` | Storage operations, file read/write |
| `workspace/placement/contract.ts` | Workspace layout items, placement |
| `workspace/background/contract.ts` | Workspace background records |
| `widget/contract.ts` | Widget registry index |
| `widget/persistence/records-file.ts` | Widget record files |
| `preset/contract.ts` | Preset catalog operations |
| `ae/host/contract.ts` | AE host bridge interface |
| `online/contract.ts` | Cloud/online services |

### `src/function/`

| File | Responsibility |
| --- | --- |
| `widget/contract.ts` | Widget metadata, registry index |
| `widget/state-slice-contract.ts` | Widget runtime state |
| `preset/operation-contract.ts` | Preset execution operations |

### `src/shared/`

| File | Responsibility |
| --- | --- |
| `types/` | Primitive types, UUIDs |
| `component/` | Shared UI primitives |
| `util/` | Pure utility functions |

## Import Rules

- External packages use only public exports from `@ty-plus/*`.
- Internal imports stay within `src/{function,management,shared}`.
- Deep imports from management into function are forbidden (INV-2).

## Type Locations

- `widget.type` is in `src/function/widget/contract.ts`
- `preset.type` is in `src/function/preset/operation-contract.ts`
- `workspace placement` type is in `src/management/workspace/placement/contract.ts`
- Background type is in `src/management/workspace/background/contract.ts`

Types are domain-closed. Do not create a single large union type.
