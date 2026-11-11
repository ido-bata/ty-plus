# Workspace Surfaces

This document defines which UI surfaces constitute ty-plus's unified workflow.

This document describes runtime surfaces, not source ownership. Workspace is a UI/management
layer, not the feature itself.

## Canonical Source Paths

The authoritative source paths under `src/` are:

| Surface | Path |
|---|---|
| workspace panel | `src/management/workspace/` |
| workspace runtime / events | `src/management/workspace/events.ts`, `src/management/workspace/runtime.ts` |
| workspace messaging | `src/management/workspace/messaging/` |
| dialog components | `src/management/dialog/` |
| dialog root / id resolution | `src/management/dialog/` |
| shared UI components | `src/shared/component/` |
| widget registry | `src/function/widget/registry-v2.ts`, `src/function/widget/` |
| widget implementations | `src/function/widget/` |
| preset operations | `src/function/preset/` |
| AE host bridge | `src/management/ae/` |
| ExtendScript JSX | `src/management/ae/jsx/` |
| onboarding | `src/management/workspace/onboarding/` |
| licensing | `src/management/` |

## Surface Composition

- **panel** — persistent workspace area.
- **dialog** — auxiliary surfaces for preset authoring, preset library, settings, messages, debug console.
- **widget** — work units on the panel, placed by registry and layout.
- **onboarding and licensing** — gating surfaces for unified routing, not separate products.

## `type` and Surface

The `type` of preset / group / widget drives not only storage shape but also surface behavior:

- preset authoring dialog switches UI by preset `type`.
- group dialog switches UI by group `type` (e.g. `manual` / `folder-sync`).

`type` is a plain discriminator, not a special concept. See [type-driven-surfaces.md](type-driven-surfaces.md).

## Unified Workflow

ty-plus's unified workflow brings together:

- local preset execution
- script / footage / preset authoring
- settings / theme / layout
- notification / message
- licensing / onboarding

## Dialog and Panel Coordination

- surface id resolution: `src/management/workspace/surface/`
- bus payload: `../data/contracts.md`
- close / mount shell: `src/management/dialog/`
- full dialog list and common UI shell: [ui-composition.md](ui-composition.md)

## Authoring Dialog Design

- dialog separates record common fields from `type`-specific `param` editing.
- preset authoring / group authoring / widget settings are `type`-driven UIs, not plain forms.
