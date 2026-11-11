# Widget Records

`widgets/widgets.json` widget record definition.

## Legacy Compatibility

Legacy path `data/widget/widgets.json` is read-only. New writes use `widgets/`.

## Role

Widget record holds widget identification and display/runtime configuration for placement in workspace.
Referenced by id from workspace layout; position and size are held by the layout.

## Widget Record Responsibility

- Widget `type`
- Display name and description
- Widget-specific configuration
- Persisted `param` if needed

## Boundary with Registry

- Widget type enumeration and runtime metadata authority is in `src/function/widget/contract.ts`.
- `widgets.json` handles workspace-specific persisted state.
- Do not replicate registry metadata into `widgets.json`.

## `type`

- Candidates are enumerated in the widget registry and contract.
- Not free-form input.
- Details are in [types.md](types.md).
