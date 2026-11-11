# Workflow Map

Active user-facing workflows discovered from panel routes, dialog registries, widget registries, manifests, and build entrypoints.

## Active Panels

| Panel ID | Route | Type | Notes |
|----------|-------|------|-------|
| `panel1` | workspace | main | autoVisible: true |
| `dialog` | modeless shell | dialog | |
| `dialog-preset-add` | modeless | dialog | |
| `dialog-preset-edit` | modeless | dialog | |

## Widget Registry

**Primary authority: `src/function/widget/contract.ts`**

Active widgets: search, easing, menu, align, anchor-point, text-style (6 MVP)

Widget renderer implementations are in `src/function/widget/` directory.

## Workflow Traces

### Panel 1 / Workspace Flow
```
User opens panel → WorkspacePanel mounts → Widget registry resolves → Widgets render
```

### Dialog Flow
```
User triggers dialog → openDialog() called → dialog-manager resolves ID + extension
→ dialog-root mounts in modeless shell
```

### Host Execution Flow
```
Widget action → management/ae host bridge → CSInterface.evalScript → After Effects ExtendScript
```

## Unknown Links

- Preset save/load workflow path: **Unknown**
- Cloud sync workflow: **Unknown** — Supabase edge function exists but sync trigger not traced
- Widget configuration persistence: **Unknown**

## Debt Signals

- Dialog polling via storage keys (no RPC) — fragile cross-process communication
