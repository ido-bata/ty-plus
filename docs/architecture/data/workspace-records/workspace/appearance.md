# Workspace Appearance

Appearance information stored separately from workspace layout.

## Separation

- Layout holds placement only.
- Background is a separate structured JSON.
- Style is a separate CSS file.

## Storage

| File | Responsibility |
| --- | --- |
| `workspaces/background/background-[1-5].json` | Each workspace background configuration |
| `styles/theme.css` | Panel/dialog common theme and style overrides |
| `styles/workspaces/workspace-[1-5].css` | Workspace-specific visual differences |

## Background

- Background shape authority is [`src/management/workspace/background/contract.ts`](../../../../src/management/workspace/background/contract.ts).
- Background is not mixed into the layout file.

## Style

- Style is not pressed into JSON records — CSS files hold it.
- Theme and workspace differences are separate files.
