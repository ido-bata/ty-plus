# Widget Authority Policy

**Status:** Active

## Policy Statement

`src/function/widget/contract.ts` is the **primary authority** for widget exposure in the workspace.

Legacy: `src/packages/widgets/src/registry.ts` is deprecated — it is a secondary/competing influence, not authoritative for current workflow decisions.

## Widget Category Model

| Category | Condition | User Selectable? |
|----------|-----------|-----------------|
| `active-now` | Renderable component + `available: true` in primary registry | Yes |
| `implemented-not-exposed` | Renderable component exists, but no primary registry entry or `available: false` | No — preserved for future recovery |
| `broken-migration` | Primary registry entry exists, but no renderable component | No — requires investigation |
| `obsolete` | Neither renderable component nor registry entry | No — remove if found |

## Current State

**Active-now (6):** search, easing, menu, align, anchor-point, text-style

**Implemented-not-exposed (11):** note, timer, info, youtube, layout-lock, project-info, quick-actions, fx-search, file-browser, text-editor, font-viewer

All 17 renderers are preserved product capability evidence. A widget being "implemented-not-exposed" is a temporary state, not a permanent deletion. The correct path to expose it is to add it to the primary registry with `available: true`, not to delete the renderer.

## Legacy References

Legacy: `@ty-plus/widgets` package (`src/packages/widgets/src/registry.ts`) is deprecated. The current authority is `src/function/widget/contract.ts`.

## Implications for Code Review

When reviewing widget-related changes:
- **Do not** delete renderer implementations to "match MVP scope"
- **Do not** treat `available: false` as intent to remove the renderer
- **Do** treat the primary registry as the single source of truth for widget availability
