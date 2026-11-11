# Storage Violations Check

Automated check to verify that Runtime Memory Storage is not misused for data requiring persistence.

## Purpose

This check identifies files that incorrectly use `runtime-memory-storage` for data that should be persisted to Managed Storage. Runtime Memory Storage is appropriate only for truly ephemeral IPC data that does not need to survive panel reloads.

## Running the Check

### Quick Run

```bash
# Find all files importing runtime-memory-storage
rg "runtime-memory-storage" src/management --files-with-matches
```

### Full Violation Analysis

```bash
# 1. List all files using runtime-memory-storage
rg "runtime-memory-storage" src/management --files-with-matches

# 2. For each file, verify the data type being stored:
#    - Settings → must use Managed Storage
#    - UI state (positions, collapsed) → must use Managed Storage
#    - Notification cache → must use Managed Storage
#    - Locale preference → must use Managed Storage
#    - Undo snapshots (session-only) → Runtime Memory is acceptable
```

## Violation Criteria

A file is in violation if it uses `runtime-memory-storage` for:

| Data Category | Violation If | Correct Storage |
|---------------|--------------|-----------------|
| Settings | Any persistence of settings | Managed Storage (`settings.json`) |
| UI State | Position, size, collapsed state | Managed Storage or CEP shared |
| Cache | Notification cache, read state | Managed Storage |
| Preferences | Language, theme preferences | Managed Storage |
| Records | Preset, widget, group records | Managed Storage |

### Acceptable Uses (Not Violations)

| Use Case | Rationale |
|----------|-----------|
| IPC handshake data | Ephemeral by design |
| Temporary computation results | No persistence needed |
| Undo/redo stack (session-only) | Intentional session scope |

## Expected Output

When run against a compliant codebase:

```
# No files should appear for these patterns:
rg "writeRuntimeJson.*settings" src/management --files-with-matches
rg "writeRuntimeJson.*notification" src/management --files-with-matches
rg "writeRuntimeJson.*control-panel" src/management --files-with-matches
```

## CI Integration

Add to pre-commit or CI pipeline:

```bash
# Fail if new runtime-memory-storage violations are introduced
rg "from.*runtime-memory-storage" src/management --files-with-matches > /dev/null
if [ $? -eq 0 ]; then
  echo "ERROR: runtime-memory-storage imports found. Check storage-policy.md"
  exit 1
fi
```

## Manual Verification Steps

1. Run the grep to find all files importing `runtime-memory-storage`
2. For each file, read the code and classify the stored data
3. Mark as violation if data type matches the forbidden categories
4. Update `docs/architecture/storage-policy.md` with any new violations

## Re-checking After Fixes

After migrating violations to Managed Storage:

1. Remove the `runtime-memory-storage` import from the fixed file
2. Replace with appropriate `src/management/storage/persistence/` imports (`readJson` / `readJsonText` / `writeJson` keyed by the PATHS registry)
3. Verify the file no longer appears in the grep results
4. Confirm the file uses the unified persistence API, not direct file I/O
