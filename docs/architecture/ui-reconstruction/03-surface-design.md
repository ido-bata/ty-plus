# 03 Surface Design

## Panel Shell

The panel shell is a dense production tool, not a landing page. It should open
directly into the workspace after onboarding is complete.

Primary panel responsibilities:

- Own onboarding.
- Own the status bar.
- Own workspace-level dialogs and secondary panel launchers.
- Persist panel-level settings.
- Publish cross-surface state changes.

Secondary panel responsibilities:

- Render the workspace with its own `panelId`.
- Show waiting guidance only while onboarding is incomplete.
- Avoid global status controls unless the feature is intentionally duplicated.

Panel layout:

```text
WorkspaceRoot
  WorkspacePanel
    WorkspaceViewport
      WorkspaceCanvas
        WorkspaceGridItem[]
    FloatingControlPanel
    StatusBar primary only
```

## Workspace Canvas

The workspace is a scrollable absolute-positioned grid. Widgets use fixed grid
coordinates and stable dimensions. Hover, focus, selected, loading, and drag
states must not resize the grid.

Required states:

- Empty workspace: restore default widgets for primary panel.
- Loading workspace: render a stable full-size root with no layout jump.
- Corrupted layout: repair obsolete widget layouts and show a status message.
- Drag/drop: preserve current layout until drop commit succeeds.
- Host unavailable: keep UI usable and show host-specific actions disabled.

## Status Bar

The status bar is the command strip for workspace-level actions. Use icon
buttons with tooltips/titles for undo, redo, snapshot, presets, cloud library,
debug console, messages, settings, and secondary panels.

Status text is a single truncating line. Never let status text push controls
offscreen.

## Floating Control Panel

The floating control panel is a compact toolbar for creating local presets and
later high-frequency commands. It persists position, orientation, and collapsed
state. It must be draggable by middle mouse and must not block widget
interaction outside its bounds.

## Dialog Surfaces

All modeless dialogs use `DialogRoot` and a shared shell:

```text
DialogRoot(surfaceId)
  DialogShell
    DialogHeader
    DialogContent or ShellDialogBody
    DialogFooter optional
```

Dialog routing must support:

- `dialog-preset-add`
- `dialog-preset-edit`
- `dialog-presets`
- `dialog-preset-library`
- `dialog-messages`
- `dialog-settings`
- `dialog-background-panel`
- `debug-console`

Frozen preset tool surfaces may render an explicit unsupported state until
their feature spec is implemented. Do not silently fall through to unknown
dialog UI.

## Onboarding

Onboarding is a primary-panel overlay that blocks the workspace only until setup
is complete. Secondary panels display waiting guidance and listen for unlock
events. Onboarding completion must be persisted through the same settings path
used by the rest of the shell.

