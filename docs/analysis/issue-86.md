# Issue #86 static analysis

- Issue: `bug(workspace.dnd): group → workspace 直下 D&D の挙動が不安定 (要再現)` (P3, 0.10.0)
- Base SHA: `2173b3979d31bddbc5289a91bed44ef81171c4d4` (`release-0-9-0` HEAD)
- Scope: read-only static analysis of the workspace D&D layer
- Verdict: **the inverse drop handler (group tile → workspace root) does not exist in the codebase.** `onPresetDropToGroup` is declared in `handler.ts` and never wired up in production; the only analog (group panel → outside, `Panel.tsx`) drags *members* of an opened group, not the group tile itself. No drag-out / dissolve handler exists for the group tile. The user-facing "Release Group" context menu item (`CTX_MENU_IDS.releaseGroupPreset`) is rendered but has **no case handler**, so it is a dead menu entry. The reported instability is therefore not a state-update ordering bug — it is a missing-feature bug whose only available path is the menu, and that menu path does nothing.

---

## 1. Files and helpers read

- `src/management/workspace/events/handler.ts` — pointer event coordinator; declares `EventsOptions.onPresetDropToGroup` at line 313 and consumes it at lines 976-1056.
- `src/management/workspace/events/handler.test.ts` — integration tests for the coordinator; see F6.
- `src/management/workspace/hook.ts:2604-2668` — the only production caller of `setupInteractionEvents(...)`.
- `src/management/workspace/events/constants.ts` — `DRAG_THRESHOLD`, `DRAG_HANDLE_MARGIN`, `RESIZE_MARGIN`, `PREVIEW_TRANSITION`.
- `src/management/workspace/placement/types.ts:20-22` — attribute constants `ATTR_GROUP_TILE`, `ATTR_GROUP_PANEL`, `ATTR_PLACEMENT_INDEX`, etc.
- `src/management/preset/group/events.ts` — `dispatchGroupWorkspaceRequest` / `GROUP_WORKSPACE_EVENT`; only one `type` is exposed today: `"toggle-open"`. No `"drop-out"` / `"dissolve"` / `"release"` is part of the contract.
- `src/management/preset/group/Panel.tsx` — the only file that performs a *group→workspace* write. Operates on **member presets** of an opened group panel, not on the group tile in the surface grid.
- `src/management/preset/group/WorkspaceLayer.tsx`, `PanelOverlay.tsx`, `ContainerCatalogTile.tsx`, `CatalogTileBody.tsx` — group surface rendering; none wires drag-out.
- `src/management/preset/group-catalog.ts:222-271` — `removeGroupEntry` and `removePresetFromGroupEntry` are the disk-side primitives used by `Panel.tsx`. No helper combines them atomically.
- `src/management/preset/persist-folder-group.ts` — write path for *creating* folder groups. No dissolve path.
- `src/management/dialog/dialogs/unified-context-menu.ts:1395-1416, 1462-1473` — menu construction. `releaseGroupPreset` is offered to the user in two menus.
- `src/management/dialog/dialogs/unified-context-menu-constants.ts:97-98` — menu IDs `releaseGroupPreset`, `removePresetFromOpenedGroup`.
- `src/management/preset/group/surface-visibility.ts` — `shouldHideGroupedMemberSurfaceTile`; explains why dissolved presets must be re-added to `surfaceTiles`.

There are no unit tests for the missing drag-out path. Existing tests exercise only `onPresetDropToGroup`'s call site (and only indirectly; see F6).

---

## 2. Drop-handler inventory (the four directions in the issue)

The issue names four drag directions and asks which are wired. Each is enumerated against the source.

### Direction A — preset tile → another group tile (`onPresetDropToGroup`)

Declared at `src/management/workspace/events/handler.ts:313-318`:

```ts
onPresetDropToGroup?: (payload: {
    groupPresetId: string;
    presetIds: readonly string[];
    dropClientX: number;
    dropClientY: number;
}) => boolean;
```

Consumed at `src/management/workspace/events/handler.ts:976-1056` inside `onPointerUp`:

```ts
if (
    kind === "move" &&
    !isWidget(state, op.targetSurfaceIndexStr) &&
    opts?.onPresetDropToGroup &&
    !op.selectedTileIndices.some((i) =>
        isWidgetSurfaceIndex(state, String(i)),
    )
) {
    const dropClientX = ev?.clientX ?? Number.NaN;
    const dropClientY = ev?.clientY ?? Number.NaN;
    if (Number.isFinite(dropClientX) && Number.isFinite(dropClientY)) {
        const dragIndices = ...;
        const draggedCatalogIds = ...;
        /* hide drag placements, then read dropTarget via elementFromPoint */
        const dropTarget = (
            document.elementFromPoint(dropClientX, dropClientY)
        )?.closest<StyledElement>(`[${ATTR_GROUP_TILE}]`);
        ...
        if (groupPresetId) {
            const sourceIds = draggedCatalogIds.filter(
                (id) => id !== groupPresetId,
            );
            if (sourceIds.length > 0) {
                const handled = opts.onPresetDropToGroup({ ... });
                if (handled) { op = null; rerender(); return; }
            }
        }
    }
}
```

Routing logic: at pointer-up, if the dragged items are preset (non-widget) and `onPresetDropToGroup` is wired, the code temporarily sets `pointer-events: none` on the dragged tiles, calls `document.elementFromPoint(dropClientX, dropClientY)`, and walks up to the nearest `[data-workspace-group-tile]` ancestor. If that exists, it calls the callback with the resolved `groupPresetId`, the dragged catalog ids (excluding the target itself), and the drop coordinates.

Finding **A1 — production wiring is missing.** `setupInteractionEvents` is called exactly once in production, at `src/management/workspace/hook.ts:2604-2668`. The options object passed there is:

```ts
{
    hostCode,
    fileBrowser: fileBrowserService,
    importWorkspaceFile: (filePath) => importFile(...),
    executePreset,
    presentContextMenuAt: unifiedCtxMenu.presentContextMenuAt,
}
```

No `onPresetDropToGroup` is passed. Therefore in production the entire branch in `handler.ts:976-1056` is dead: `opts?.onPresetDropToGroup` is always undefined, the outer `if` short-circuits, and the drop falls through to the generic move logic at line 1059 and onward. **The preset → group direction itself is unwired**, not just the inverse direction.

Classification: **missing wiring**, not a state-ordering bug. The issue's premise that `onPresetDropToGroup` is "implemented" is true at the type level only; the runtime callback is never supplied.

### Direction B — preset tile → workspace background

There is **no dedicated handler.** When `onPresetDropToGroup` returns false or is absent, the code falls through to `hasAnyMultiMove` (line 1075) and eventually calls `resolveLayout` to snap the dragged tiles onto the workspace grid at lines 1184-1197. This is the *generic tile move* path and applies to both preset and widget tiles. It does not consult `groupCatalogEntries` and does not call `removePresetFromGroupEntry`.

Classification: **exists as a side-effect of the generic move path.** Not the topic of the issue.

### Direction C — group tile → workspace background (dissolve a group)

The only thing exposed to the user is the context menu entry **Release Group** (`CTX_MENU_IDS.releaseGroupPreset`).

Offered in two menus:

- `src/management/dialog/dialogs/unified-context-menu.ts:1402-1408` (preset-row variant when the row *is* a group):
  ```ts
  if (isGroupPresetRow && includeCep) {
      rows.push({
          id: CTX_MENU_IDS.releaseGroupPreset,
          label: "Release Group",
          enabled: hasId,
      });
  }
  ```
- `src/management/dialog/dialogs/unified-context-menu.ts:1467-1473` (group tile on the workspace grid):
  ```ts
  if (groupCatalogHit && includeCep) {
      rows.push({
          id: CTX_MENU_IDS.releaseGroupPreset,
          label: "Release Group",
          enabled: hasId,
      });
  }
  ```

There is **no `case CTX_MENU_IDS.releaseGroupPreset:`** in `src/management/workspace/hook.ts` (verified by `grep -n "case CTX_MENU_IDS\."` listing all 70+ handled cases). `grep -rn "releaseGroupPreset" src/` returns the menu definition and the constants file only — no consumer.

Selection therefore falls through the `handleUnifiedCtxSelect` switch and is a no-op. The user sees "Release Group", clicks it, and nothing happens.

There is no `onGroupDrop`, no `data-dnd-zone` constant for group tiles, and no `document.elementFromPoint` consumer that targets group tiles for "drop out". `ATTR_GROUP_TILE` (`data-workspace-group-tile`) is only used as a *target* selector for `onPresetDropToGroup` (Direction A); it is never treated as a *source* for any dissolve flow.

Classification: **the inverse direction does not exist as either a drag handler or a working menu handler.** The user's only available action is "Release Group" via context menu, and that action is dead.

### Direction D — group tile → group tile (rearrange groups)

Not implemented. Group tiles do not nest, and there is no API surface for "merge two group rows into one". Out of scope for this issue, listed here for completeness.

### Side-channel — group panel member → outside

`src/management/preset/group/Panel.tsx:143-191` handles pointer-up for a preset dragged from inside an *opened* group panel:

```ts
const onPointerUp = (event: PointerEvent): void => {
    void (async () => {
        ...
        const droppedInside = gridEl !== null && /* pointer inside the panel grid rect */;
        if (droppedInside) {
            await reorderPresetInGroupEntry(window, groupId, groupDrag.startIndex, groupDrag.overIndex);
            await notifyPanelsAfterPresetSave(window, { sourceSurfaceId: panelId, catalogRefIds: [groupId] });
        } else {
            await removePresetFromGroupEntry(window, groupId, groupDrag.presetId);
            const workspaceGrid = gridRef.current?.closest<HTMLElement>(`[${ATTR_GRID}]`) ?? null;
            const dropPlacement = gridClientPointToCell(event.clientX, event.clientY, workspaceGrid, grid);
            await notifyPanelsAfterPresetSave(window, {
                sourceSurfaceId: panelId,
                catalogRefIds: [groupDrag.presetId],
                dropPlacement: dropPlacement ?? undefined,
            });
        }
        ...
    })();
};
```

This is the only existing path that removes a preset from a group and re-places it on the workspace grid. It does so by:

1. Calling `removePresetFromGroupEntry` (line 172) to rewrite `groups.json`.
2. Calling `notifyPanelsAfterPresetSave` (line 181) which calls `tryPersistAppendPresetFromDialog` to add the tile to the layout and broadcasts `presetPlacement` to other panels (see `notify-panels-after-preset-save.ts:73-108`).

This is the correct **disk-side** primitive for "preset removed from group, placed on workspace". The issue is that it lives in `Panel.tsx` (member preset drag), not in any "group tile dragged to workspace" flow.

---

## 3. Drag-handler routing (drop zones)

The issue asks where each drop target zone resolves to. There is no `dropZone` constant or `data-dnd-zone` attribute in the codebase. The D&D layer is event-driven, not zone-driven.

Concretely:

- The only "drop target" lookup is `document.elementFromPoint(...).closest(`[${ATTR_GROUP_TILE}]`)` at `handler.ts:1018-1023`. This walks upward from the point to the nearest element with `data-workspace-group-tile=""`.
- The `ATTR_GROUP_TILE` attribute is emitted in `src/management/workspace/surface/Grid.tsx:265` only on **group-role** tiles.
- There is no `[data-dnd-zone]` selector, no React `<Droppable>` component, no listener for `dragstart` / `dragend` / HTML5 native D&D events anywhere in the workspace layer. All motion is through `pointerdown` / `pointermove` / `pointerup`.
- `ATTR_GROUP_PANEL` (`data-workspace-group-panel`) is the only other group-related attribute, emitted at `Panel.tsx:212`. It is referenced at `handler.ts:441` and `unified-context-menu.ts:300-311` to *exclude* group-panel clicks from the workspace selection toggle. It is not a drop target.

**Modifier-key handling.** The issue hypothesizes that "modifier key (Shift) state reflection is missing". The relevant predicates in `handler.ts` are:

- `isPlainPrimaryMouseEvent(ev)` (line 69-79): rejects any `shiftKey`, `ctrlKey`, `metaKey`, `altKey`. Used at line 1243 to gate plain-click activation.
- `isWidget(state, op.targetSurfaceIndexStr)` and `!op.selectedTileIndices.some((i) => isWidgetSurfaceIndex(state, String(i)))` (line 978-983): require the drag to be *preset-only*.
- The `onPresetDropToGroup` branch (line 976) has **no `shiftKey` check whatsoever.** That is intentional: in the only possible "preset into group" semantic, Shift is not consulted.

The "Shift determines group vs. workspace" idea is consistent with none of the code. There is no branch that routes Shift-pressed drops differently.

Classification: **the modifier-key hypothesis is not borne out by the code.** The lack of Shift handling is not the bug; the lack of any handler is.

---

## 4. Group catalog mutations and atomicity

`src/management/preset/group-catalog.ts` exposes:

- `upsertGroupEntry` (line ~178): writes one group entry to `groups.json`.
- `removeGroupEntry` (line 223-236): removes one group row by id.
- `removePresetFromGroupEntry` (line 242-271): removes one preset id from one group's `presetIds`.
- `reorderPresetInGroupEntry` (line 273-305): reorders within one group.
- `mergeGroupEntries` (line 308-341): bulk merge.

Each function reads `groups.json`, computes the next state, and writes the new JSON via `writeGroupJson(win, ...)`. Each is independent. **There is no helper that updates `groupCatalogEntries` and `surfaceTiles` in one transaction.**

The dual-write that matters for dissolve:

1. Disk: drop preset ids from `groups.json` (`removePresetFromGroupEntry`).
2. Layout: add tiles to `surfaceTiles` for the dissolved presets (`notifyPanelsAfterPresetSave → tryPersistAppendPresetFromDialog → presetPlacement` broadcast, see `notify-panels-after-preset-save.ts:73-108`).
3. React: re-render with the updated `groupCatalogEntries` so `shouldHideGroupedMemberSurfaceTile` (`surface-visibility.ts:13-24`) no longer hides the members.

`Panel.tsx:172-185` does steps 1 and 2 in sequence (await both), and the broadcast in step 2 brings the catalog into the new state in step 3. This is the only place where the three writes are coordinated.

There is no equivalent coordinator for "drag a group tile out to dissolve the entire group at once". A dissolve would need:

- For each member: remove from `groups.json` (`removePresetFromGroupEntry`) or replace with `removeGroupEntry`.
- For each member: re-append to the workspace layout (`notifyPanelsAfterPresetSave` with `dropPlacement`).
- Remove the group tile itself from `surfaceTiles`.

None of this is wired.

---

## 5. Persistence side

`persist-folder-group.ts` is the *creation* path only. It calls `upsertGroupEntry` / `mergeGroupEntries` and never `removeGroupEntry` / `removePresetFromGroupEntry`. There is no `persistGroupDissolve` or equivalent.

`removeGroupEntry` and `removePresetFromGroupEntry` are *only* called from:

- `hook.ts:2073` — inside the `deletePreset` context menu branch (deletes the group *and* its row in one shot via `removeGroupEntry`, then broadcasts deletion).
- `hook.ts:2105` — inside the `removePresetFromOpenedGroup` context menu branch (removes one preset from one group via `removePresetFromGroupEntry`, then refreshes the catalog and broadcasts placement).
- `edit/Dialog.tsx:907` — preset edit dialog's remove path (uses `removeGroupEntry` when the preset is a group row).
- `Panel.tsx:172` — the only drag-driven removal (member of opened group).

So persistence-side primitives exist, but the drag-out path that would compose them for a **group tile** dissolve does not.

---

## 6. Existing tests

- `src/management/workspace/events/handler.test.ts:1022-1088` — `Ctrl+click on preset element initiates move operation`. The comment at line 1023-1025 explicitly states:

  > Note: The full drop-to-group flow requires `elementFromPoint` which is difficult to mock in test environment, so we test the operation initiation.

  So even the existing tests do not exercise `onPresetDropToGroup`'s callback firing; they only test that a move operation is initiated when the user Ctrl-clicks a preset.

- No test in `src/management/preset/group/Panel.test.ts` (does not exist) or any e2e test simulates dragging a **group tile** out to the workspace background.
- `notify-panels-after-preset-save.test.ts` exercises `notifyPanelsAfterPresetSave` directly, including a placement-add path; it does not exercise the dissolve order.
- `unified-context-menu.test.ts` (mentioned in grep) covers menu construction, not the action handlers in `hook.ts`.

There is no regression net for the direction the issue names.

Classification: **test gap.** The test file even acknowledges it.

---

## 7. Findings table

| ID | Finding | Classification | Severity for #86 |
|----|---------|----------------|------------------|
| F1 | `onPresetDropToGroup` is declared in `handler.ts` and consumed inside `onPointerUp`, but no production caller (`hook.ts:2604-2668`) ever passes the callback. The preset → group direction is dead in production. | Missing wiring | High (root cause for related instability reports) |
| F2 | No drag handler for **group tile → workspace background**. `ATTR_GROUP_TILE` is only used as a *drop target* selector in `onPresetDropToGroup`; never as a *source*. | Missing feature | High (the exact direction in the issue) |
| F3 | `CTX_MENU_IDS.releaseGroupPreset` is offered in two menus (`unified-context-menu.ts:1402-1408`, `1467-1473`) but has no `case` handler in `hook.ts`. Clicking it does nothing. | Dead menu entry | High (user-visible surface for the missing feature) |
| F4 | `GROUP_WORKSPACE_EVENT` (`group/events.ts`) only carries `type: "toggle-open"`. No dissolve / drop-out event type exists. | Missing contract | Medium |
| F5 | No atomic helper that updates `groupCatalogEntries` and `surfaceTiles` together. Only `Panel.tsx:172-185` performs the multi-write for member removal; no equivalent for whole-group dissolve. | Missing coordinator | Medium |
| F6 | Existing test acknowledges it cannot exercise `elementFromPoint`. No test covers the dissolve path in any form. | Test gap | Medium |
| F7 | Issue's modifier-key hypothesis ("Shift determines group vs. workspace") is not consistent with the code: `isPlainPrimaryMouseEvent` (line 69-79) gates plain clicks, not drops, and `onPresetDropToGroup`'s drop branch has no Shift handling at all. | Misdiagnosis | Low (the real bug is upstream of modifier semantics) |

---

## 8. Verdict

The issue's title describes "unstable behavior" for group → workspace drops. Static analysis shows there is **no behavior at all** for that direction:

- Drag-out (group tile → workspace root) is not implemented anywhere.
- The only path the user can reach today is "Release Group" via context menu, and that menu item is a dead entry with no handler.
- Even the related Direction A (preset → group tile) is unwired in production; the callback slot exists but no caller fills it.

Therefore the report's "instability" symptom is consistent with "the user is dragging a group tile and observing no result". A user might also be misinterpreting that "the group moves but nothing else changes" or "the group ends up in a different cell". Both observations would be consistent with the missing handler: the generic move path (`handler.ts:1059-1197`) does snap the group tile to the new grid cell *if* the user can start a drag on it, but no state change to the catalog or to the group's members occurs.

The reported 30-day close window for "no reproduction" may reflect this: a user trying to drag a group tile is not triggering a state mutation that could be observed and reported. What they observe is "the group moves" or "nothing happens". Both look like a non-reproducible bug rather than a missing feature.

## 9. Suggested follow-up (out of scope, not implemented)

For the implementer of the eventual fix, in priority order:

1. **Add a real handler for the group-tile-drag-out path.** Two options:
   - Wire a new `onGroupDropToWorkspace` option into `setupInteractionEvents`, called from `onPointerUp` when the drag source is a group tile (detected via `classifyFromCatalogs(state, op.targetSurfaceIndexStr) === "group"` and a workspace target rather than a group target).
   - Or implement the `CTX_MENU_IDS.releaseGroupPreset` case handler and document "drag-out is not supported; use the menu".
2. **Wire the existing `onPresetDropToGroup` callback in production** (Direction A). This is a small change at `hook.ts:2604-2668` and an F1 fix.
3. **Extend `GROUP_WORKSPACE_EVENT`** to carry a `"release"` or `"dissolve"` event type, paralleling `"toggle-open"`, so other panels can react.
4. **Add a coordinator** that combines `removeGroupEntry` (or N calls to `removePresetFromGroupEntry`) with `notifyPanelsAfterPresetSave({ dropPlacement })`, so the disk write and the layout write are made consistent.
5. **Add a test** that mocks `elementFromPoint` and exercises the drag-out path, closing F6.
6. **Re-read the issue's hypothesis** about modifier keys. If "Shift to dissolve" is the desired UX, the absence of any Shift handling today is a *symptom* of the missing handler, not the bug. Verify with product whether the desired modifier is Shift or Alt or none.

Closing conditions stated in the issue remain valid: with F1-F3 above corrected, the reproducer for "drag group tile out and observe drift" becomes trivial, and P3 can be re-evaluated only after the handler exists.

Out of scope (not requested): proposing the actual fix, writing the test, opening the PR. This document is read-only analysis.