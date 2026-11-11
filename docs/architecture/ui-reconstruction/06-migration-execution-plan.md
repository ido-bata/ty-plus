# 06 Migration Execution Plan

## Strategy

Rebuild in vertical slices. Each slice must leave the app buildable and should
remove at least one category of `src/js` dependency. Do not delete `src/js`
until every slice passes.

## Phase 1: Freeze And Guard

1. Add an import-boundary rule that blocks new imports from `src/js`.
2. Add a test or check that fails when new files are added under `src/js`.
3. Record the current `src/js` file list as a deletion tracker.
4. Verify with `bun run check:boundaries`.

Exit gate: no new work can extend legacy UI.

## Phase 2: Surface Entrypoints

1. Make panel and dialog HTML artifacts generated from `src/management`.
2. Ensure `panel1` boots `src/management/ae/cep/entry/panel`.
3. Ensure every active modeless dialog boots `src/management/ae/cep/entry/dialog`.
4. Add smoke tests for surface id resolution.
5. Verify with `bun run build`.

Exit gate: CEP artifact entrypoints no longer depend on `src/js`.

## Phase 3: Workspace Runtime Split

1. Split `WorkspacePanel.tsx` into view, runtime hook, status bar, control
   panel, widget shell, and host action modules.
2. Move reusable non-React behavior into `src/management/workspace` or
   `src/shared`.
3. Replace remaining DOM mutation state with hook state where practical.
4. Add tests for layout repair, status actions, and host-unavailable actions.

Exit gate: workspace behavior is understandable and testable without raw HTML.

## Phase 4: Dialog Reconstruction

1. Implement each dialog as React inside `DialogRoot`.
2. Use shared `DialogShell`, `DialogHeader`, `DialogContent`, and
   `DialogFooter`.
3. Move preset editor form state into typed hooks.
4. Use the dialog result bridge for every modeless writeback.
5. Add React tests for create/edit/cancel/error states.

Exit gate: no dialog behavior requires `src/js/dialog`, `src/js/presets`, or
legacy UI components.

## Phase 5: Widget Reconstruction

1. Normalize widget metadata in `@ty-plus/widgets`.
2. Render every widget through `WidgetRenderer` or a feature-specific React
   component.
3. Replace legacy command widgets with React components and typed host actions.
4. Add tests for every widget type in the default workspace.

Exit gate: workspace can render default and persisted widgets without legacy
renderers.

## Phase 6: Settings, Theme, And Onboarding

1. Make settings the only source for onboarding completion and shell options.
2. Keep theme token editing in React and persist through `src/management/style/theme`.
3. Ensure secondary panels unlock from primary onboarding completion.
4. Add tests for onboarding completion propagation and theme application.

Exit gate: user setup, theme, and settings survive reloads and multi-panel use.

## Phase 7: Delete `src/js`

1. Run `rg "src/js|\\.\\./\\.\\./js|from [\"'].*src/js" src docs tests scripts`.
2. Fix all required references.
3. Delete `src/js`.
4. Run `bun run typecheck`.
5. Run `bun run test`.
6. Run `bun run build`.
7. Run `bun run check`.

Exit gate: `src/js` is gone and the full check suite passes.

