# Phase 4 storage audit — STO-001

## Overview

This document audits the current storage implementation, mapping data types to their consumers and file paths.

## Storage Categories

### 1. JSON File Stores

| Store | Data Type | Consumer | Current Path | Notes |
| --- | --- | --- | --- | --- |
| `json-file-store.ts` | Generic JSON | Multiple | `supportRoot/data/*.json` | Core read/write |
| `settings-files-store.ts` | Settings | UI | `supportRoot/data/settings.json` | Version migration |
| `workspace-store.ts` | Workspace records | UI | `supportRoot/data/workspace*.json` | 5 workspaces |
| `layout-store.ts` | Layout | UI | `supportRoot/data/workspace*.css` | CSS files |
| `clipboard-store.ts` | Clipboard | UI | `supportRoot/data/clipboard.json` | Size limit |
| `snapshot-store.ts` | Snapshot | UI | `supportRoot/data/snapshot.json` | Crash recovery |
| `widget-state-store.ts` | Widget state | UI | `supportRoot/data/widget-state.json` | Type-specific |

### 2. Cache Stores

| Store | Data Type | Consumer | Current Path | Notes |
| --- | --- | --- | --- | --- |
| `cache-store.ts` | Generic cache | Multiple | `supportRoot/cache/*.json` | TTL-based |
| `candidates-cache/` | Search candidates | Search | `supportRoot/cache/candidates.json` | Restart persistence |

### 3. ExtendScript Stores

| Store | Data Type | Consumer | Current Path | Notes |
| --- | --- | --- | --- | --- |
| `workspace-store.ext.ts` | Workspace | ExtendScript | `supportRoot/data/*.json` | Legacy |
| `workspace-layout-store.ext.ts` | Layout | ExtendScript | `supportRoot/data/*.css` | Legacy |
| `file-operations.ext.ts` | File ops | ExtendScript | Various | Legacy |

### 4. Binary/Directories

| Store | Data Type | Consumer | Current Path | Notes |
| --- | --- | --- | --- | --- |
| `file-operations.ts` | Binary | Multiple | Various | Node fs |
| `elevation-service.ts` | Binary | Multiple | Various | Elevated ops |

## Data Shapes

### Workspace Record
```typescript
type WorkspaceRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};
```

### Widget State
```typescript
type WidgetState = {
  widgetId: string;
  state: unknown;
  updatedAt: string;
};
```

### Clipboard Entry
```typescript
type ClipboardEntry = {
  id: string;
  content: unknown;
  createdAt: string;
};
```

### Cache Entry
```typescript
type CacheEntry<T> = {
  key: string;
  value: T;
  expiresAt: string;
};
```

## Consumers

### UI Components
- `src/management/workspace/` - Workspace management
- `src/management/widget/` - Widget state
- `src/management/setting/` - Settings
- `src/management/i18n/` - Internationalization

### Runtime Services
- `src/management/storage/persistence/` - File operations
- `src/management/storage/read/` - Read operations
- `src/management/storage/write/` - Write operations

## Migration Plan

1. **STO-002**: Define TypeScript storage port
2. **STO-003**: Implement managed root resolution in Rust
3. **STO-004**: Create application folder manifest
4. **STO-005**: Implement transaction engine
5. **STO-006-021**: Migrate each store individually

## Key Findings

1. **No hardcoding**: Paths are derived from `supportRoot`
2. **Multiple consumers**: Same data accessed by UI and ExtendScript
3. **Legacy paths**: ExtendScript stores need migration
4. **Cache strategy**: TTL-based with restart persistence
