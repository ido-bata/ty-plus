# Data Contracts

Definition sources and primary consumers for shared contracts.

## Contract Sources

| Boundary | Definition | Primary Consumers |
| --- | --- | --- |
| Workspace storage | [`src/management/storage/contract.ts`](../../src/management/storage/contract.ts) | [`src/management/storage/hook.ts`](../../src/management/storage/hook.ts), [`src/management/workspace/workspace-store.ts`](../../src/management/workspace/workspace-store.ts) |
| Widget registry | [`src/function/widget/contract.ts`](../../src/function/widget/contract.ts) | [`src/management/widget/contract.ts`](../../src/management/widget/contract.ts), [`src/function/widget/index.ts`](../../src/function/widget/index.ts) |
| Preset operations | [`src/function/preset/operation-contract.ts`](../../src/function/preset/operation-contract.ts) | [`src/management/preset/contract.ts`](../../src/management/preset/contract.ts) |
| Workspace placement | [`src/management/workspace/placement/contract.ts`](../../src/management/workspace/placement/contract.ts) | [`src/management/workspace/placement/types.ts`](../../src/management/workspace/placement/types.ts) |
| Workspace background | [`src/management/workspace/background/contract.ts`](../../src/management/workspace/background/contract.ts) | [`src/management/storage/background/`](../../src/management/storage/background/) |
| Widget persistence | [`src/management/widget/persistence/records-file.ts`](../../src/management/widget/persistence/records-file.ts) | [`src/management/widget/record/types.ts`](../../src/management/widget/record/types.ts) |
| AE host contract | [`src/management/ae/host/contract.ts`](../../src/management/ae/host/contract.ts) | [`src/management/ae/`](../../src/management/ae/) |
| Online services | [`src/management/online/contract.ts`](../../src/management/online/contract.ts) | [`src/management/online/`](../../src/management/online/) |

## Notes

- `WorkspaceBackground` shape authority is [`src/management/workspace/background/contract.ts`](../../src/management/workspace/background/contract.ts).
- Icon is a common data type held within records, not a separate reference.
- Storage contract splits follow [local-storage-contracts.md](local-storage-contracts.md).
- Contract module layout follows [contracts-module-layout.md](contracts-module-layout.md).
