# Widget Types

Widget record `type` and `param` branches.

## Authority

Widget type enumeration and runtime metadata authority is in `src/function/widget/contract.ts`.

## Reading

- `type` is the reason for widget renderer and editor UI branching.
- Size constraints and singleton constraints are in registry metadata.
- `widgets.json` holds only instance-specific differential configuration.

## `param` Handling

- Widgets with state (`note`, `timer`, `text-editor`) have `param` as central.
- Widgets where runtime metadata is primary and persisted state is thin (`search`, `align`, `anchor-point`) have minimal `param`.
- Do not confuse registry metadata with instance state.
