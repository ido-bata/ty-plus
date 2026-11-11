# STO-022 — Storage Cleanup Plan

## Status

- **Task**: STO-022
- **Status**: `in-progress`
- **Blocked by**: Product cutover (steps 6-10 of slice procedure)

## Current State

All Rust storage modules (STO-009 through STO-021) are implemented and tested:
- `snapshot.rs` — workspace snapshots
- `workspace_records.rs` — workspace records
- `widget_state.rs` — widget state
- `workspace_layout.rs` — workspace layout
- `settings_files.rs` — settings files
- `i18n_preference.rs` — i18n preference
- `clipboard.rs` — clipboard persistence
- `panel_persistence.rs` — panel persistence
- `tool_handoff.rs` — tool handoff
- `relocation.rs` — support root relocate
- `operation_history.rs` — operation history

However, the product code has not been cut over to use these new modules. The legacy Node fs/CEP fs patterns remain in:

## Legacy Patterns to Remove

### 1. `src/management/storage/write/json-file.ts`
- Uses CEP Node `fs` or `node:fs/promises` for file writes
- Creates parent directories with `mkdir`
- Will be replaced by Rust `JsonFileStore` write operations

### 2. `src/management/storage/read/json-file.ts`
- Uses CEP Node `fs` or `node:fs/promises` for file reads
- Parses JSON with error handling
- Will be replaced by Rust `JsonFileStore` read operations

### 3. `src/management/storage/file.ts`
- File operations using CEP Node fs
- Will be replaced by Rust `ScopedDirectory` operations

### 4. `src/management/storage/cep.ts`
- CEP-specific file system abstractions
- Will be removed after Rust migration

### 5. `src/management/storage/cache-store.ts`
- In-memory and file-based cache
- Will be replaced by Rust `PersistentCache`

### 6. `src/management/storage/clipboard-store.ts`
- Clipboard persistence using file I/O
- Will be replaced by Rust `ClipboardStore`

### 7. `src/management/storage/json-file-store.ts`
- JSON file store implementation
- Will be replaced by Rust `JsonFileStore`

## Cleanup Procedure

After product cutover is complete:

1. **Remove legacy files** from `src/management/storage/`
2. **Remove CEP fs abstractions** from `src/management/storage/cep.ts`
3. **Remove ExtendScript File/Folder references** from storage modules
4. **Update architecture guard** to remove storage allowlist entries
5. **Verify** no Node fs/CEP fs references remain in storage/

## Verification

```bash
# Search for Node fs patterns
rg -l "node:fs|cep_node|require\(\"fs\"\)" src/management/storage/

# Search for ExtendScript File/Folder
rg -l "new File\(|new Folder\(" src/management/storage/

# Search for fire-and-forget patterns
rg -l "\.then\(\(\) =>" src/management/storage/
```

## Evidence

After cleanup, repository search should show:
- 0 Node fs references in storage/
- 0 CEP fs references in storage/
- 0 ExtendScript File/Folder references in storage/
- Only elevation task exceptions (if any)

## Next Steps

1. Complete product cutover for each slice (STO-009 through STO-021)
2. Delete old reader/writer implementations
3. Remove architecture guard allowlist entries
4. Execute this cleanup plan
