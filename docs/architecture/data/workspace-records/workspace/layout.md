# Workspace Layout

`workspaces/workspace-[1-5].json` responsibility.

## Legacy Compatibility

Legacy path `data/workspace/workspace-[1-5].json` is read-only. New writes use `workspaces/`.

## Role

`workspace-[1-5].json` is layout-only.
Preset/widget/group detail bodies are not held here.

File format is JSON array, each element representing a placement item.

## File Contents

- Placement item list (JSON array)

## Layout Item

Layout item has at least:

| Field | Meaning |
| --- | --- |
| `id` | Target record id |
| `x` | Grid X coordinate |
| `y` | Grid Y coordinate |
| `width` | Occupied width |
| `height` | Occupied height |

Item `type` (preset/widget/group distinction) is resolved by catalog lookup from id. Layout item itself does not hold `type`.

## Not Held

- Grid size
- Placement item type
- Preset/widget/group detail bodies
- Workspace background
- Workspace style
- Group expansion results or folder sync intermediate state

These are separate records or CSS files.
