# Data

`data/` guides to type definitions without redefining them in docs. Each entry shows the definition source and primary consumers.

## Source Authority

Per INV-1, only `src/{function,management,shared}` paths are current. All other paths are legacy.

## Tree

```text
data/
├─ index.md
├─ contracts.md
├─ contracts-module-layout.md
├─ local-storage-contracts.md
├─ runtime-state.md
├─ workspace-path-contracts.md
└─ workspace-records/
   ├─ index.md
   ├─ common/
   │  └─ index.md
   ├─ workspace/
   │  ├─ layout.md
   │  └─ appearance.md
   ├─ preset/
   │  ├─ index.md
   │  └─ types.md
   ├─ widget/
   │  ├─ index.md
   │  └─ types.md
   ├─ group/
   │  ├─ index.md
   │  ├─ types.md
   │  ├─ folder-sync.md
   │  └─ matchers.md
   └─ icon/
      ├─ index.md
      └─ rules.md
```

## Reading Order

1. [contracts.md](contracts.md) — shared contracts for workspace, preset, widget, group
2. [contracts-module-layout.md](contracts-module-layout.md) — how contracts are organized under `src/management/` and `src/function/`
3. [workspace-path-contracts.md](workspace-path-contracts.md) — `WorkspacePaths` and canonical path names
4. [local-storage-contracts.md](local-storage-contracts.md) — contract split for local file operations
5. [runtime-state.md](runtime-state.md) — live state and settings in `src/management/`
6. [workspace-records/index.md](workspace-records/index.md) — workspace, preset, widget, group persistence responsibilities

## Rules

- Do not redefine TypeScript types or JSON schemas in docs.
- Always show definition source and primary consumers together.
- Do not add fields or shapes in docs alone.
- JSON record structures may be explicit here when needed for storage responsibility separation.
- Upper-level `type` semantics are understood by reading `src/management/` and `src/function/`. Do not treat `data/` as a closed concept.
- Overall UI composition uses [`../runtime/ui-composition.md`](../runtime/ui-composition.md) as the canonical guide.
