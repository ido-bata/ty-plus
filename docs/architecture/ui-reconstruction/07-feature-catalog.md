# 07 Feature Catalog

This catalog is the checklist for reconstructing visible UI. If an item here is
not implemented in React, `src/js` is not ready to delete.

## Workspace

Required UI:

- Scrollable grid canvas.
- Preset tiles with icon, label visibility, selection, execution, and context
  menu states.
- Widget tiles with fixed grid position and stable dimensions.
- Grid overlay toggle.
- Background image/color/appearance support.
- Empty, loading, repaired, and host-unavailable states.

Required commands:

- Execute preset.
- Drag imported files into workspace.
- Select widget.
- Open widget context menu.
- Save, restore, and delete layout snapshot.
- Undo and redo workspace changes.

## Status Bar

Required UI:

- Host/status message.
- Live/static status dot.
- Undo, redo, snapshot, presets, cloud library, debug console, messages,
  settings, and secondary panel controls.
- Primary-panel-only secondary surface launchers.

Constraints:

- Text truncates before controls.
- Buttons remain icon-sized and do not shift when disabled.

## Control Panel

Required UI:

- Floating compact toolbar.
- Local preset creation command.
- Collapsed and expanded states.
- Horizontal and vertical orientation.
- Persisted position.

Constraints:

- Does not cover the entire workspace.
- Does not steal unrelated widget clicks.

## Dialogs

Required dialogs:

- Preset add/edit.
- Preset list.
- Preset library.
- Settings.
- Messages.
- Background panel.
- Widget selector.
- Debug console.

Required behavior:

- Shared shell chrome.
- Modeless result bridge.
- Serializable request/result payloads.
- Explicit unsupported state for frozen surfaces.
- Cancel and error states for every write dialog.

## Preset Editors

Required preset editors (UI catalog names) map to the canonical `PresetType`
enum documented in
[`docs/architecture/data/workspace-records/preset/types.md`](../../data/workspace-records/preset/types.md).

| Catalog name (UI) | Storage `type` | `data.*` sub-flag | Editor folder |
| --- | --- | --- | --- |
| Animation preset | `"preset"` | (none) | `src/function/preset/animation/` |
| Code preset | `"script"` | (none) | `src/function/preset/code/` |
| Layer / Comp preset | `"script"` | `data.layerCompKind` | `src/function/preset/layer-comp/` |
| Footage preset | `"footage"` | `data.footageImportMode` | `src/function/preset/footage/` |
| Import preset | `"footage"` | `data.importStrategy` | `src/management/preset/import/` (shell) |
| Easing preset | `"preset"` | `data.easing` | `src/function/widget/core/easing/` (shell) |
| Group preset | (group storage) | (none) | `src/management/preset/group/` |

> **Removed**: Text style preset was deprecated and its editor was deleted.
> Folder preset and File/script preset are covered by the Import preset and
> the Code preset editors respectively.

Required fields:

- Name.
- Icon.
- Source path or type-specific payload.
- Group/folder ownership.
- Execution options.
- Validation errors.
- Save/cancel controls.

## Settings

Required panels:

- Workspace layout and behavior.
- Support root/directories.
- Theme/design tokens.
- Background appearance.
- Component gallery for design verification.
- Locale.

Required behavior:

- Settings persist through the canonical settings storage path.
- Changes that affect open panels publish cross-surface updates.
- Theme edits update CSS variables without requiring a full restart.

## Widgets

Required widget types:

- Search.
- Menu.
- Quick actions.
- Align.
- Anchor point.
- Easing.
- File browser.
- Font viewer.
- FX search.
- Info.
- Layout lock.
- Notes.
- Project info.
- Text editor.
- Text style.
- Timer.
- YouTube.

Required behavior:

- Every default widget renders in React.
- Host-only widgets handle host absence.
- Widget renderers use registry metadata from `@ty-plus/widgets`.
- Widget shells own selection and frame styling; widget bodies own content only.

## Onboarding

Required UI:

- Primary panel setup overlay.
- Language selection.
- Support path setup.
- Preset import step.
- Completion state.
- Secondary panel waiting state.

Required behavior:

- Completion persists to settings.
- Completion broadcasts to secondary panels.
- Workspace remounts cleanly after completion.

## Licensing

Required UI:

- Trial banner.
- License gate.
- License dialog.
- Feature unavailable state.

Required behavior:

- Uses `src/management/online/licensing/`.
- Does not block non-gated workspace recovery flows.

