# UI Composition

This document defines the overall composition of panel / dialog / widget / common UI components.

This document describes runtime surfaces and UI execution structure, not source ownership. Source file locations follow `src/function/`, `src/management/`, and `src/shared/` as defined in INV-1.

## Canonical Source Paths

| Role | Path |
|---|---|
| CEP surface declaration | `cep.config.ts` |
| dialog root | `src/management/dialog/` |
| dialog id normalization | `src/management/dialog/` |
| dialog shell components | `src/management/dialog/` |
| shared UI component exports | `src/shared/component/` |
| widget registry | `src/function/widget/` |
| widget implementations | `src/function/widget/` |
| theme storage | `src/management/` |

## Key Principles

- `type` is not a special runtime mechanism — it is a plain discriminator.
- The same `type` governs storage, dialog, panel, execution, and sync branching.
- UI surfaces are built from common shells and common components, not per-screen custom implementations.
- UI components are placed under the feature system that owns them. e.g. preset list dialog under preset indexing, easing widget body under widget easing.

## CEP Surface List

### panel

- `panel1`
- `panel2`
- `panel3`
- `panel4`
- `panel5`

### manifest-declared modeless surfaces

- `dialog`
- `dialog-preset-add`
- `dialog-preset-add-folder`
- `dialog-preset-edit`
- `dialog-widget-selector`
- `dialog-code-preset`
- `dialog-footage-preset`
- `dialog-animation-preset`
- `dialog-layer-comp-preset`
- `dialog-import-preset`
- `dialog-easing-preset`
- `dialog-background-panel`

## Runtime Dialog Surfaces

- `dialog-preset-add`
- `dialog-preset-add-folder`
- `dialog-preset-edit`
- `dialog-code-preset`
- `dialog-footage-preset`
- `dialog-animation-preset`
- `dialog-layer-comp-preset`
- `dialog-import-preset`
- `dialog-easing-preset`
- `dialog-widget-selector`
- `dialog-presets`
- `dialog-preset-library`
- `dialog-messages`
- `dialog-settings`
- `dialog-background-panel`
- `debug-console`
- `dialog-probe`
- `dialog`

## Surface Notes

`dialog-preset-edit` exists as a manifest surface but does not yet have a dedicated branch in the dialog root. It is currently reserved/legacy.

`openDialog(surfaceId)` alias normalization is authoritative in `src/management/dialog/`.

## Workspace Opener Panel (`panel-1` … `panel-5`)

modeless or tool surfaces need to know which workspace panel an operation targets.

- CEP: `requestOpenExtension` carries `openerSurfaceId` in JSON. **AE may not receive `getArguments()`**, so the panel writes to `userData/.../ty-plus/preset-tool-handoff/app.ty-plus.dialog-widget-selector.json` before launching.
- browser dev: URL query `?openerSurfaceId=panel-2` (also `panel` key works).
- Optional override: `data-ws-action` element with `data-opener-workspace-panel="panel-N"` takes precedence over `SurfaceState.panelId`.

Implementation: `src/management/workspace/surface/opener-workspace-panel-id.ts`.

## Dialog Composition

dialogs compose as:

1. `DialogShell`
2. `DialogHeader`
3. `DialogContent`
4. `DialogFooter`
5. `ShellDialogBody`
6. domain-specific editor

## Common UI Components

New dialogs and widgets assemble from:

- `Accordion`
- `Button`
- `AffordanceGlyph`
- `FolderRow`
- `Icon`
- `Input`
- `PresetIconStrip`
- `ScrollArea`
- `SearchField`
- `Select`
- `Tooltip`
- `ShellMarkdownEditor`
- `ShellMonacoEditor`
- `ShellPresetIconField`
- `WidgetRenderer`
- `WidgetShell`

## UI Assembly Rules

- Do not add custom layout shells per screen.
- dialogs use `DialogShell` families.
- widgets use `WidgetShell` and `WidgetRenderer`.
- If common controls are insufficient, extract to `src/shared/component/` first, then reuse.
- `type`-driven differences are reasons to switch displayed fields and editor blocks, not the shell.

## Style and Appearance

- Common theme / style settings are stored as CSS files.
- per-workspace style diffs are also CSS files.
- workspace background is stored separately from layout files, not mixed in.

 |
