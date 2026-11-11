# Workspace Class Hooks Check

## Purpose

Forbids workspace-specific CSS class hooks in active workspace implementation.

Workspace widgets render into a Shadow DOM shell. The host page applies a post-processing step (`background-canvas-style.ts`) that uses specific CSS class names as hooks to inject Tailwind-generated styles. If workspace source contains hardcoded class names overlapping with those hooks, the post-processing will misfire on unrelated elements.

## Protected hooks

These class names are consumed by the host-page CSS injection and must NOT appear in workspace source as class attribute values:

- `ws-item`
- `ws-tile`
- `ws-grid`
- `ws-grid-item`
- `ws-placement`
- `ws-selection-rect`
- `ws-placeholder`
- `ws-widget`

## Running the check

```bash
bun run scripts/check/check-workspace-class-hooks.ts
```

Exit codes:
- `0` — pass, no workspace-specific class hook regressions found
- `1` — fail, workspace-specific class hook violations detected

## Integration status

NOT integrated into `bun run lint` or `ci`. The check currently reports violations on existing code that need deliberate cleanup decisions before it can gate lint.

Current violations (as of 2026-05-07):
- `src/function/widget/workspace/widget-renderer.ts:1253` — `class="ws-widget${selected..."` (line 1253)
- `src/management/workspace/components/PlacementItemContainer.tsx:31-32` — `border-ws-placement-*` Tailwind arbitrary values
- `src/function/widget/workspace/widget-renderer.ts:851,906,911` — `${flags.layoutClass}` contains `ws-grid` token reference

These require a deliberate cleanup: `ws-widget` needs `data-widget-id` migration, `border-ws-placement-*` needs CSS variable mapping confirmation, and `ws-grid` in layoutClass requires verifying token resolution.

## Adding new hooks

To add a new protected hook, update `PROTECTED_HOOKS` in `scripts/check/check-workspace-class-hooks.ts`. Document the hook in this file when added.