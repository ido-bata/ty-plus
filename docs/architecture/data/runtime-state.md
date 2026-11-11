# Runtime State

Live state in `src/management/` vs auxiliary state models.

## State Boundaries

| Boundary | Definition | Primary Consumers |
| --- | --- | --- |
| Settings model | [`src/management/setting/types.ts`](../../src/management/setting/types.ts) | [`src/management/setting/`](../../src/management/setting/), [`src/management/dialog/`](../../src/management/dialog/) |
| Live workspace state | [`src/management/workspace/state/context-contract.ts`](../../src/management/workspace/state/context-contract.ts) | [`src/management/workspace/state/`](../../src/management/workspace/state/), [`src/management/panel/`](../../src/management/panel/) |
| Persisted workspace subset | [`src/management/storage/hook.ts`](../../src/management/storage/hook.ts) | [`src/management/workspace/workspace-store.ts`](../../src/management/workspace/workspace-store.ts) |
| Widget state | [`src/function/widget/state-slice-contract.ts`](../../src/function/widget/state-slice-contract.ts) | [`src/function/widget/`](../../src/function/widget/) |

## Decisions

- Panel UI live state authority is in `src/management/workspace/state/`.
- Widget runtime state authority is in `src/function/widget/state-slice-contract.ts`.
- Settings management is in `src/management/setting/`.
- State flows from storage to UI through `src/management/storage/hook.ts`.
