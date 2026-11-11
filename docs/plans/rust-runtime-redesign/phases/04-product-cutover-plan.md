# Phase 4 Product Cutover Plan

## Overview

Phase 4 Rust storage modules are implemented and tested. This document outlines the cutover plan for switching product code from old Node fs/CEP fs implementations to new Rust implementations via IPC.

## Cutover Order

Each slice follows: Rust impl → TS mapper → product cutover → old path deletion → guard removal.

### STO-009: Shared JSON File Store

**Old implementation:**
- `src/management/storage/read/json-file.ts` — `readJsonFileText()`
- `src/management/storage/write/json-file.ts` — `writeJsonFileText()`
- `src/management/storage/json-file-store.ts` — deprecated barrel

**New implementation:**
- `rust/crates/storage/src/json_store.rs` — `JsonFileStore`

**Consumers to cutover:**
1. `src/management/workspace/undo/layout-undo-cache.ts`
2. `src/management/workspace/persistence/store.ts`
3. `src/management/storage/widget-state-store.ts`
4. `src/management/setting/persistence/workspace-ui-settings-file.ts`
5. `src/management/panel/persistence/chrome-store.ts`
6. `src/management/storage/persistence/io.ts`

**Cutover steps:**
1. Create `StorageGateway` TS implementation that calls Rust `JsonFileStore` via IPC
2. Update each consumer to use `StorageGateway` instead of `readJsonFileText`/`writeJsonFileText`
3. Remove old `read/json-file.ts` and `write/json-file.ts`
4. Remove deprecated `json-file-store.ts` barrel
5. Update architecture guard

### STO-010: Persistent Cache

**Old implementation:**
- `src/management/storage/cache-store.ts`

**New implementation:**
- `rust/crates/storage/src/persistent_cache.rs`

**Cutover steps:**
1. Create `CacheGateway` TS implementation
2. Update `cache-store.ts` to use new gateway
3. Remove old file I/O code

### STO-011: Workspace Snapshot

**Old implementation:**
- `src/management/storage/snapshot-store.ts`

**New implementation:**
- `rust/crates/storage/src/snapshot.rs`

**Cutover steps:**
1. Create `SnapshotGateway` TS implementation
2. Update `snapshot-store.ts` to use new gateway
3. Remove old file I/O code

### STO-012: Workspace Records

**Old implementation:**
- `src/management/workspace/store.ts`
- `src/management/workspace/persistence/store.ts`

**New implementation:**
- `rust/crates/storage/src/workspace_records.rs`

**Cutover steps:**
1. Create `WorkspaceRecordsGateway` TS implementation
2. Update workspace store to use new gateway
3. Remove old file I/O code

### STO-013: Widget State

**Old implementation:**
- `src/management/storage/widget-state-store.ts`

**New implementation:**
- `rust/crates/storage/src/widget_state.rs`

**Cutover steps:**
1. Create `WidgetStateGateway` TS implementation
2. Update `widget-state-store.ts` to use new gateway
3. Remove old file I/O code

### STO-014: Workspace Layout

**Old implementation:**
- `src/management/workspace/layout-store.ts`

**New implementation:**
- `rust/crates/storage/src/workspace_layout.rs`

**Cutover steps:**
1. Create `WorkspaceLayoutGateway` TS implementation
2. Update layout store to use new gateway
3. Remove old file I/O code

### STO-015: Settings Files

**Old implementation:**
- `src/management/setting/persistence/workspace-ui-settings-file.ts`

**New implementation:**
- `rust/crates/storage/src/settings_files.rs`

**Cutover steps:**
1. Create `SettingsGateway` TS implementation
2. Update settings file to use new gateway
3. Remove old file I/O code

### STO-016: i18n Preference

**Old implementation:**
- `src/management/i18n/preference/storage.ts`

**New implementation:**
- `rust/crates/storage/src/i18n_preference.rs`

**Cutover steps:**
1. Create `I18nGateway` TS implementation
2. Update i18n storage to use new gateway
3. Remove old file I/O code

### STO-017: Clipboard

**Old implementation:**
- `src/management/storage/clipboard-store.ts`

**New implementation:**
- `rust/crates/storage/src/clipboard.rs`

**Cutover steps:**
1. Create `ClipboardGateway` TS implementation
2. Update clipboard store to use new gateway
3. Remove old file I/O code

### STO-018: Panel Persistence

**Old implementation:**
- `src/management/panel/persistence/chrome-store.ts`

**New implementation:**
- `rust/crates/storage/src/panel_persistence.rs`

**Cutover steps:**
1. Create `PanelPersistenceGateway` TS implementation
2. Update chrome store to use new gateway
3. Remove old file I/O code

### STO-019: Tool Handoff

**Old implementation:**
- `src/management/preset/tool-handoff-file.ts`

**New implementation:**
- `rust/crates/storage/src/tool_handoff.rs`

**Cutover steps:**
1. Create `ToolHandoffGateway` TS implementation
2. Update tool handoff to use new gateway
3. Remove old file I/O code

### STO-020: Support Root Relocate

**Old implementation:**
- Various relocation helpers

**New implementation:**
- `rust/crates/storage/src/relocation.rs`

**Cutover steps:**
1. Create `RelocationGateway` TS implementation
2. Update relocation code to use new gateway
3. Remove old file I/O code

### STO-021: Operation History

**Old implementation:**
- `src/management/workspace/undo/history.ts`

**New implementation:**
- `rust/crates/storage/src/operation_history.rs`

**Cutover steps:**
1. Create `HistoryGateway` TS implementation
2. Update history code to use new gateway
3. Remove old file I/O code

## Gateway Architecture

All gateways follow the same pattern:

```typescript
// Example: WidgetStateGateway
import { type StorageRuntimeGatewayPort } from "./runtime-gateway-port";

export type WidgetState = {
  widgetType: string;
  widgetId: string;
  state: unknown;
};

export const createWidgetStateGateway = (port: StorageRuntimeGatewayPort) => ({
  get: (widgetType: string, widgetId: string): Promise<WidgetState | null> =>
    port.request("widget-state/get", { widgetType, widgetId }),
  
  save: (state: WidgetState): Promise<void> =>
    port.request("widget-state/save", state),
  
  delete: (widgetType: string, widgetId: string): Promise<void> =>
    port.request("widget-state/delete", { widgetType, widgetId }),
  
  listByType: (widgetType: string): Promise<WidgetState[]> =>
    port.request("widget-state/list-by-type", { widgetType }),
});
```

## Testing Strategy

For each cutover:
1. Verify Rust tests pass: `cargo +1.85.0 test -p ty-plus-storage`
2. Verify TS tests pass: `bun run vitest run`
3. Verify typecheck passes: `bun run typecheck`
4. Verify no old imports remain: `rg "readJsonFileText|writeJsonFileText" src/`
5. Verify architecture guard passes: `bun run scripts/check/check-storage-read-write-split.ts`

## Current Status

### Cutovered via persistence I/O layer (automatic)
These modules use `readJson`/`writeJson` from `persistence/io.ts`, which now routes to Rust:
- [x] settings-files-store.ts (app, ui, paths)
- [x] widget-state-store.ts
- [x] snapshot-store.ts
- [x] catalog/json-files.ts
- [x] candidates-cache/candidates.ts
- [x] cache-store.ts (read/write)
- [x] widget/persistence/records-file.ts
- [x] workspace/persistence/store.ts
- [x] workspace/layout/persistence.ts
- [x] workspace/layout/panel-json-files.ts

### Remaining modules (need dedicated gateways)
- [x] STO-017: Clipboard — uses persistence layer with legacy fallback
- [x] STO-018: Panel Persistence — uses persistence layer
- [x] STO-019: Tool Handoff — uses persistence layer with CEP fallback
- [x] STO-021: Operation History — already uses snapshot-store (cutovered)
