# Workspace Records

Storage records for local file operations. `layout.json` is not used.

## Storage Responsibility

| File | Responsibility |
| --- | --- |
| `workspaces/workspace-[1-5].json` | Workspace item placement (JSON array) |
| `workspaces/background/background-[1-5].json` | Workspace background configuration |
| `presets/presets.json` | Preset catalog and preset records |
| `widgets/widgets.json` | Widget catalog and widget records |
| `groups/groups.json` | Group catalog and group records |
| `styles/theme.css` | Panel/dialog common styles |
| `styles/workspaces/workspace-[1-5].css` | Workspace-specific style overrides |

## Legacy Compatibility

Legacy paths are read-only. New writes use the new structure.

| Legacy Path | Target Path |
| --- | --- |
| `data/workspace/workspace-[1-5].json` | `workspaces/workspace-[1-5].json` |
| `data/preset/presets.json` | `presets/presets.json` |
| `data/widget/widgets.json` | `widgets/widgets.json` |
| `data/group/groups.json` | `groups/groups.json` |

## Reading Order

1. [common/index.md](common/index.md) — common fields and `type`/`param` conventions
2. [workspace/layout.md](workspace/layout.md) — workspace layout record
3. [workspace/appearance.md](workspace/appearance.md) — workspace background/appearance
4. [preset/index.md](preset/index.md) and [preset/types.md](preset/types.md) — preset record and `preset.type`
5. [widget/index.md](widget/index.md) and [widget/types.md](widget/types.md) — widget record and `widget.type`
6. [group/index.md](group/index.md), [group/types.md](group/types.md), [group/folder-sync.md](group/folder-sync.md), [group/matchers.md](group/matchers.md) — group record and sync conditions
7. [icon/index.md](icon/index.md) and [icon/rules.md](icon/rules.md) — icon common data type and condition application

## Decisions

- `layout.json` is not used.
- `kind` is not used — `type` is the discriminator.
- Differential data uses `param`, not `detail`.
- Icon is a common data type within records, not a separate JSON file.
- Workspace layout and workspace background are separate files.
- Style settings are in CSS files, not JSON records.
- Preset/widget/group detail bodies are not embedded in workspace layout records.
