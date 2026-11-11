# Workspace Path Contracts

Canonical path names for the workspace file tree.

## Principle

- Path names indicate their responsibility.
- `workspace` / `preset` / `widget` / `group` separation is reflected in path names.
- Do not use the ambiguous word `layout` in path names.
- Numbered workspace files use `workspaceNJson` style properties.

## `WorkspacePaths` Target Shape

### Root / Directory

| Field | Meaning |
| --- | --- |
| `root` | Managed root |
| `settingsDir` | `settings/` |
| `workspacesDir` | `workspaces/` |
| `presetsDir` | `presets/` |
| `widgetsDir` | `widgets/` |
| `groupsDir` | `groups/` |
| `historyDir` | `history/` |
| `cacheDir` | `cache/` |
| `stylesDir` | `styles/` |
| `workspaceStylesDir` | `styles/workspaces/` |
| `assetsDir` | `assets/` |
| `workspaceAssetsDir` | `assets/workspace/` |
| `workspacePresetsDir` | `assets/workspace/presets/` |
| `workspaceScriptsDir` | `assets/workspace/scripts/` |
| `workspaceFootageDir` | `assets/workspace/footage/` |
| `workspaceBackgroundsDir` | `assets/workspace/backgrounds/` |
| `workspaceMetaDir` | `assets/workspace/meta/` |
| `logsDir` | `logs/` |

### Data Files

| Field | File |
| --- | --- |
| `settingsJson` | `settings/app.json` |
| `systemJson` | `settings/system.json` |
| `workspace1Json` | `workspaces/workspace-1.json` |
| `workspace2Json` | `workspaces/workspace-2.json` |
| `workspace3Json` | `workspaces/workspace-3.json` |
| `workspace4Json` | `workspaces/workspace-4.json` |
| `workspace5Json` | `workspaces/workspace-5.json` |
| `workspace1BackgroundJson` | `workspaces/background/background-1.json` |
| `workspace2BackgroundJson` | `workspaces/background/background-2.json` |
| `workspace3BackgroundJson` | `workspaces/background/background-3.json` |
| `workspace4BackgroundJson` | `workspaces/background/background-4.json` |
| `workspace5BackgroundJson` | `workspaces/background/background-5.json` |
| `presetRecordsJson` | `presets/presets.json` |
| `widgetRecordsJson` | `widgets/widgets.json` |
| `groupRecordsJson` | `groups/groups.json` |

### Style Files

| Field | File |
| --- | --- |
| `themeCss` | `styles/theme.css` |
| `workspace1Css` | `styles/workspace/workspace-1.css` |
| `workspace2Css` | `styles/workspace/workspace-2.css` |
| `workspace3Css` | `styles/workspace/workspace-3.css` |
| `workspace4Css` | `styles/workspace/workspace-4.css` |
| `workspace5Css` | `styles/workspace/workspace-5.css` |

### Log Files

| Field | File |
| --- | --- |
| `logFile` | `logs/ty-plus.log` |

## Legacy Compatibility

Legacy paths are read-only. New writes use the target paths above.

| Legacy Path | Target Path |
| --- | --- |
| `data/workspace/workspace-N.json` | `workspaces/workspace-N.json` |
| `data/preset/presets.json` | `presets/presets.json` |
| `data/widget/widgets.json` | `widgets/widgets.json` |
| `data/group/groups.json` | `groups/groups.json` |
