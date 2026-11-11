# Workspace Panel State Load Order

## Overview

Documents the complete initialization sequence for workspace panel state in `useWorkspaceRuntime` (hook.ts), including file reads, fallbacks, and localStorage/CepStorage usage.

## Files Read at Startup

| Order | File | Function | Fallback if Missing |
|-------|------|----------|--------------------|
| 1 | runtime memory (`_store` Map) | `readRuntimeJson(CP_STORAGE_KEY)` — control panel state | default state |
| 2 | `ty-plus-init.json` locator | via `resolveWorkspaceSupportBaseRootFromLocatorViaNodeFs` | use hostSupportRoot as-is |
| 3 | `settings.json` | `readWorkspaceSettingsJson(window)` → `readWorkspacePanelStateFromSettingsJson` | returns baseState (initial state) |
| 4 | `workspaces/background/background-{N}.json` | `readWorkspaceNBackgroundJson(window, wsIndex)` | silently ignored (non-fatal) |

## Load Sequence in `useWorkspaceRuntime` (hook.ts)

```
1. createInitialWorkspaceState({ grid, panelId, hostCode, hostName, mode })
   ↓
2. ensurePrimaryPanelWidgets(nextState) — recovers if persisted widgets are empty/corrupted
   ↓
3. commit(nextState) — React state set, UI renders with defaults
   ↓
4. async block starts:
   a. getWorkspaceDataServices().presetRepository.list() — loads preset records
   b. loadWorkspaceFontOptions() — via CEP host executor (AEFT only)
   c. refreshWorkspaceFileBrowser() — via fileBrowserService
   d. readWorkspaceSettingsJson(window)
      ↓
      readWorkspacePanelStateFromSettingsJson(settingsJson, baseState)
      → returns patched baseState or baseState if missing
      ↓
      commit(ensurePrimaryPanelWidgets({ ...cur, ...loadedState }))
   e. readWorkspaceNBackgroundJson(window, wsIndex)
      → if bg !== null && currentBg === null → commit background patch
   ↓
5. workspacePersistenceReady = true
   ↓
6. persistWorkspaceState() — writes merged state back to settings.json
```

## Key State Transitions

### State Initialization

`createInitialWorkspaceState` returns a WorkspaceState with:
- `widgets: getDefaultWidgetsForPanel(panelId)` — hardcoded defaults per panel
- All other fields as empty/null defaults

### Recovery: `ensurePrimaryPanelWidgets`

Located in hook.ts lines 180-199:

```
if panelId !== "panel-1" → no-op
else if widgets array has at least one RENDERABLE widget → no-op
else → replace widgets with DEFAULT_WIDGETS, set status message
```

**Renderable widget** = widget type is in `SHELL_WIDGET_RENDERER_TYPES`.

This handles the case where persisted widgets array is empty or contains only non-renderable legacy entries.

### Persistence: `persistWorkspaceState`

- Guard: `if (!workspacePersistenceReady) return;` — no-op until async load completes
- Reads current `settings.json`
- Merges current runtime state via `mergeWorkspacePanelStateIntoSettingsJson`
- Writes to `settings.json`
- Writes `workspaces/background/background-{N}.json` if `workspaceBackground !== null`

## What Uses localStorage / CepStorage

**Control Panel state** uses an in-memory `Map` (`_store`), not browser localStorage:

- `readRuntimeJson(CP_STORAGE_KEY)` — reads from `_store` Map (runtime-memory-storage.ts)
- `writeRuntimeJson(CP_STORAGE_KEY)` — writes to `_store` Map

This is **runtime-only memory**, not CepStorage/localStorage. It does not survive page reloads.

**Preset local cache** (`local-cache.ts`) uses `WorkspaceSnapshotStorage` which delegates to CEP localStorage or CEP Node fs — but this is for preset records, not workspace panel layout state.

**No localStorage fallback for workspace panel state** — if `settings.json` is missing or unreadable, the panel starts with initial runtime defaults, not with any localStorage copy.

## Layout Fallback Behavior When Files Are Missing

| Scenario | Result |
|----------|--------|
| `settings.json` absent | `readWorkspaceSettingsJson` returns `null`, `readWorkspacePanelStateFromSettingsJson` returns `baseState` unchanged |
| `workspaces/background/background-{N}.json` absent | `readWorkspaceNBackgroundJson` returns `null`, background stays `null` |
| `ty-plus-init.json` absent | `resolveBaseRoot` returns `hostSupportRoot` as-is |
| CEP eval unavailable + Node fs unavailable | `readWorkspaceSettingsJsonViaNodeFs` returns `null` via try/catch |
| File write fails | `persistWorkspaceState` catches and silently continues; `workspacePersistChain` handles retries |

## Observations and Recommendations

### 1. Control Panel State is Ephemeral

`readCpState` reads from an in-memory `Map` (`_store`). After a page reload, the control panel always starts at `defaultState(panelId)` — position `bottom-right`, orientation `horizontal`, collapsed based on panel.

**Recommendation**: If persistent control panel position is desired, migrate `readCpState`/`writeCpState` to use `saveWorkspacePanelStateToSettings` / `loadWorkspacePanelStateFromSettingsAsync` pattern, storing in `settings.json` under a dedicated key.

### 2. No localStorage Fallback for Panel Layout

Workspace panel layout (widgets, grid, etc.) has no fallback to localStorage when `settings.json` is missing or corrupt. It simply uses `createInitialWorkspaceState` defaults.

This is a reasonable design for MVP, but users who have valid data that cannot be read (e.g., file permission issue) will lose their layout with no recovery path.

**Recommendation**: Consider adding `loadWorkspacePanelState` (localStorage-based, workspace-store.ts) as a fallback when file-based loading returns `baseState` unchanged.

### 3. Background JSON Has No Write-Error Feedback

`writeWorkspaceNBackgroundJson` catches errors and silently ignores them with a comment `/* background write failure is non-fatal */`. The user has no indication that background persistence failed.

**Recommendation**: Consider surfacing write failures via `workspaceStatusMessage` or a non-blocking toast, at least in debug mode.

### 4. Preset List Loads from Separate Store

Preset records (`workspacePresets`) come from `getWorkspaceDataServices().presetRepository.list()`, which uses `WorkspaceSnapshotStorage` — not from `settings.json`. This separation is intentional (preset records are standalone entities).

### 5. Persist Chain is Fire-and-Forget

`workspacePersistChain` accumulates writes via `.then()` chaining but errors are swallowed with `.catch(() => {})`. A failing write does not block subsequent writes.

This is acceptable for non-critical UI state but means persistent failures can go undetected.

## Architecture Diagram

```
useWorkspaceRuntime mount
  │
  ├─ createInitialWorkspaceState() → initial state (defaults)
  │     └─ ensurePrimaryPanelWidgets() → recovery if widgets empty
  │           └─ commit() → React renders with defaults
  │
  ├─ async:
  │     ├─ presetRepository.list() → workspacePresets
  │     ├─ loadWorkspaceFontOptions() [AEFT only]
  │     ├─ refreshWorkspaceFileBrowser()
  │     ├─ readWorkspaceSettingsJson()
  │     │     ├─ ty-plus-init.json (optional locator)
  │     │     └─ settings.json
  │     │           └─ readWorkspacePanelStateFromSettingsJson()
  │     │                 └─ applyPersistedWorkspaceState()
  │     │                       └─ commit() → React re-renders with persisted state
  │     ├─ readWorkspaceNBackgroundJson()
  │     │     └─ if bg !== null && currentBg === null → commit()
  │     │
  │     └─ workspacePersistenceReady = true
  │           └─ persistWorkspaceState() → write settings.json + background JSON
  │
  └─ on state change:
        └─ persistWorkspaceState() → debounced write via workspacePersistChain
```

## Summary

- **Primary persistence**: `settings.json` (workspace panel state) and `workspaces/background/background-{N}.json` (background)
- **Locator**: `ty-plus-init.json` points to custom support root
- **No localStorage fallback** for panel layout state
- **Control panel** uses in-memory `_store` Map — does not persist across reloads
- **Preset records** use a separate `WorkspaceSnapshotStorage` store
- **Missing files** are handled gracefully: defaults are used, errors are caught