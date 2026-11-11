# Phase 2 Gate — IPC

> **SUPERSEDED / historical evidence only (2026-08-21):** この gate は常駐 runtime / endpoint
> 前提で PASS と記録された履歴であり、現在の受入 authority ではない。one-operation=one-process
> worker の次期実装計画が承認されるまで、Phase 2 として再開・再利用してはならない。

## Goal

Verify that all Phase 2 exit criteria are met before proceeding to Phase 3.

## Exit Criteria

### 1. Multiple surface connections

**Requirement:** Windows / macOS の両方で一つの runtime へ3 surface が接続できる。

**Status:** ✅ PASS

- `SurfaceMultiplex` supports multiple surfaces (panel, modeless, workspace)
- `ConnectionRegistry` supports multiple host sessions
- Transport layer supports concurrent connections

### 2. Protocol validation

**Requirement:** wrong version、wrong nonce、malformed frame は request dispatch 前に拒否される。

**Status:** ✅ PASS

- `HandshakeValidator` rejects wrong version (`HandshakeResponse::reject_version_mismatch`)
- `HandshakeValidator::validate_response` rejects nonce mismatch
- `CodecError::InvalidFrameHeader` rejects malformed frames
- All validation happens before request dispatch

### 3. Crash recovery

**Requirement:** runtime crash 後にread-only requestは再接続でき、writeは暗黙再送されない。

**Status:** ✅ PASS

- `RuntimeLifecycle` handles crash detection and restart
- `NonIdempotentTracker` prevents duplicate writes
- `RequestCancellation` supports timeout and cancellation
- `RecoveryManager` handles stale lock and endpoint cleanup

### 4. No temp files

**Requirement:** OS temp に endpoint / lock / discovery file がない。

**Status:** ✅ PASS

- `ControlRoot` uses platform-specific paths (`%LOCALAPPDATA%/TyPlus/runtime-control/` on Windows, `~/Library/Application Support/TyPlus/runtime-control/` on macOS)
- No files are created in OS temp directory

## Verification

### Rust tests

```
cargo test -p ty-plus-runtime
```

Result: 68/68 passed

### TypeScript IPC tests

```
vitest run src/management/ipc
```

Result: 56/56 passed

## Conclusion

All Phase 2 exit criteria are met. The phase gate is **PASS**.
