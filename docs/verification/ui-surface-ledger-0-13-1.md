# UI surface ledger — release-0-13-1 (audit #591)

Canonical audit target list for the UI/UX rollback investigation. Derived from
production entry points (`cep.config.ts` panels → `entry/panel.tsx` /
`entry/dialog.tsx` → `bootPanel()` / `bootTyPlusModelessDialog()`), NOT from
Storybook. Snapshot: `release-0-13-1` @ `15dd8017` (2026-11-25).

## Entry topology

- **Panel** (`shell/panel/index.html` → `entry/panel.tsx`): `PanelRoot` →
  `PanelApp` → `Main` workspace + `OnboardingView`/`SetupRequired` +
  `NotificationContainer`.
- **Modeless** (`shell/modeless/index.html` → `entry/dialog.tsx`):
  `DebugDialogRoot` (debug-console) / `ToolHost` (preset-add pool) /
  `ModelessDialogRoot` → `DialogRoot` + `NotificationContainer`.
- Dialog routing: `DialogRoot` (`dialog/Root.tsx`) + `DIALOG_ROUTES`
  (`dialog/routes.tsx`) + preset-tool pool (`TOOL_DIALOG_REGISTRY`, 8 tools).
- Widget registry: `function/widget/registry.ts` eager-glob → 10 widget types
  (core: align, anchor-point, easing, layout-lock, loop, menu; utility:
  directory-browser, font-viewer, info, quick-actions).

## Surface inventory summary

| Area | Reachable surfaces | With story | Gaps |
| --- | --- | --- | --- |
| Panel chrome | ~20 (Main, Grid, GridTile, Toolbar, StatusBar, pickers, banners, tutorial layer) | ~8 leaf pieces | Main/Grid/GridTile/Toolbar/StatusBar/AddWidgetPickerOverlay/GroupPanel/LayoutRestoreBanner/WidgetTutorialLayer/TileContent/WorkspaceCatalogTileBody — **no story** |
| Widget tiles | 10 widgets | all 10 have stories | sub-components thin (loop parts, dir-browser filter/toolbar, info preset-card) |
| Modeless dialogs | 16 routed surfaceIds | ~9 | ListDialog, PresetEditDialog, Settings sections ×11, AddWidgetDialog, PathDialog, GroupDialog, GenericPresetCreate, ImportDialog, code Dialog, ToolDialog shell, ToolHost, WorkspaceBackgroundDialog — **no/partial story** |
| Shared (`@ty-plus/ui`) | ~20 components | ~18 | `AnchoredPopover` (used by StatusBar), `MediaFrame` — no story |

Dead/unreachable (tracked in #609): `DebugConsole` overlay class
(`!isCep` only).

## Storybook ↔ production parity status (post #595/#596)

- Stub stories replaced with real production components (PresetInfo,
  QuickActions, PresetLibrary, NotificationCenter/Container).
- `check:story-subject` enforces every story imports a same-directory
  non-story module; `check:story-only` scans `src/`, `packages/ui`,
  `apps/web`.
- Remaining gap: stories cannot cover surfaces that have NO story (#610) and
  dead stories (#609).

## Regression audit result (2026-11-25)

- ~165 closed UI/UX issues/PRs triaged; ~125 claims verified PRESENT in
  `release-0-13-1` code with file:line evidence (two independent sweeps:
  in-code citation audit + uncited-issue verification).
  - Zero REGRESSED verdicts.
  - #581/#582/#583/#587 re-verified in integrated code — all genuinely fixed.
- Restoration PRs #598–#604 verified claim-by-claim — all PASS.
- Residual findings: #607 (doc rot), #608 (merge-stale coverage), #609 (dead
  UI), #610 (story coverage).

## Verification evidence

- Issue/PR inventory: `.audit-tmp/` triage (257 issues / 339 PRs exported).
- Worker reports: W-A1 (management+packages/ui), W-A2 (function+web),
  W-B (surface enumeration), W-C (restoration claims), W-D1/W-D2 (uncited).
- Visual review: see `docs/verification/` capture records for this RC.
