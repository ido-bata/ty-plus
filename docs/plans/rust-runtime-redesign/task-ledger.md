# Task ledger

> **SUPERSEDED / BLOCKED (2026-08-21):** Phase 2 の旧 `IPC-001`–`IPC-014` は、常駐
> daemon、endpoint discovery、named pipe / UDS、single-instance、shared session を
> 実装対象とする履歴 task であり、one-operation=one-process 決定により superseded された。
> 下記の履歴 status と evidence は削除せず保持するが、実装 authority として使用してはならない。
> 次の one-shot 実装計画が承認されるまで、旧 IPC task は再開不可 (`blocked`) とする。
> 正典: [`docs/architecture/runtime/operation-worker.md`](../../architecture/runtime/operation-worker.md)、
> [`docs/decisions/2026-08-21-rust-operation-worker.md`](../../decisions/2026-08-21-rust-operation-worker.md)、
> [`task-operation-worker-design-brief.md`](../../../.superpowers/sdd/architecture/task-operation-worker-design-brief.md)。
> 置換先 task ID は `DESIGN-OW-001`（次の one-shot 実装計画は未承認）である。

> 全 task の status はこの file を正とする。`in_progress` は常に一件だけ。`done` にするには `status.md` の completion evidence 行が必要。

## Phase 0

| ID | Status | Evidence / note |
| --- | --- | --- |
| `FND-001` | `done` | `reviews/wip-disposition.md`; supervisor reviewed |
| `FND-002` | `done` | WIP metadata/test 12 passed |
| `FND-003` | `done` | file-level reuse/rewrite/delete disposition recorded |
| `FND-004` | `done` | appRoot discovery rejected and deletion tasks mapped |
| `FND-005` | `done` | one-shot CLI assumptions mapped to runtime replacement |
| `FND-006` | `ready` | session/default/shared root contract committed; OS control root values and retention policy remain |
| `FND-007` | `blocked` | official author integration contract unavailable; see licensing report |
| `FND-008` | `pending` | phase gate |

## Phase 1

| ID | Status | Evidence / note |
| --- | --- | --- |
| `REP-001` | `done` | `f11ab893`; six-member Rust workspace pinned to 1.85.0 |
| `REP-002` | `done` | `f11ab893`; responsibility-based crates, no aggregate core |
| `REP-003` | `done` | `f11ab893`; adjacent Windows/macOS platform modules and target checks |
| `REP-004` | `done` | `851e8e3c`, `77629465`; deterministic checks and isolated package registration |
| `REP-005` | `done` | `aed34d6`; typed IPC and responsibility-scoped gateways |
| `REP-006` | `done` | `a0b0b256`; exact debt allowlist and 11-case self-test |
| `REP-007` | `done` | `4f6d46fa`; Rust recognized as responsibility-based product source |
| `PRO-001` | `done` | `a92cdb71`; version/capability negotiation |
| `PRO-002` | `done` | `a92cdb71`; tagged envelopes and golden JSON |
| `PRO-003` | `done` | `a92cdb71`; 19 stable error codes |
| `PRO-004` | `done` | `a92cdb71`; validated metadata and idempotency rules |
| `PRO-005` | `done` | `a92cdb71`; progress/cancellation state contract |
| `PRO-006` | `done` | `a92cdb71`; versioned limits and adversarial tests |
| `PRO-007` | `done` | `71f2d340`; deterministic Draft 2020-12 schema catalog |
| `PRO-008` | `done` | `e2a418cd`; deterministic schema-to-TypeScript wire generation |
| `PRO-009` | `done` | `a128f368`; Rust/TS shared fixtures and safe-integer boundary |
| `PRO-010` | `done` | `d71a5870`; typecheck passes; 162/163 Vitest files pass; 4 excluded files re-enabled |

## Phase 2

| ID | Status | Evidence / note |
| --- | --- | --- |
| `IPC-001` | `superseded` | historical: control root resolver and endpoint naming; 20 tests passed |
| `IPC-002` | `superseded` | historical: framed JSON codec with partial read/write; 30 tests passed |
| `IPC-003` | `superseded` | historical: Windows named pipe and macOS UDS listener/client; 33 tests passed |
| `IPC-004` | `superseded` | historical: Windows ACL and macOS socket permission; 38 tests passed |
| `IPC-005` | `superseded` | historical: Windows/macOS single-instance lock; 42 tests passed |
| `IPC-006` | `superseded` | historical: stale lock / endpoint recovery; 46 tests passed |
| `IPC-007` | `superseded` | historical: handshake, version, capability, nonce; 59 tests passed |
| `IPC-008` | `superseded` | historical: connection registry and host session lifecycle; 68 tests passed |
| `IPC-009` | `superseded` | historical: CEP Node transport; 15 IPC tests passed |
| `IPC-010` | `superseded` | historical: panel / modeless dialog multiplex; 22 IPC tests passed |
| `IPC-011` | `superseded` | historical: deadline / cancel propagation; 32 IPC tests passed |
| `IPC-012` | `superseded` | historical: crash detection, restart, non-idempotent resend; 45 IPC tests passed |
| `IPC-013` | `superseded` | historical: structured log and correlation ID redaction; 56 IPC tests passed |
| `IPC-014` | `superseded` | historical: phase gate; 56 IPC tests passed |
| `IPC-003` | `superseded` | blocked replacement marker: both OS in one task is not restartable until one-shot plan approval |
| `IPC-004` | `superseded` | blocked replacement marker: both OS in one task is not restartable until one-shot plan approval |
| `IPC-005` | `superseded` | blocked replacement marker: single-instance is forbidden until one-shot plan approval |
| `IPC-006` | `superseded` | blocked replacement marker: endpoint recovery is forbidden until one-shot plan approval |
| `IPC-007` | `superseded` | blocked replacement marker: old session handshake is not restartable |
| `IPC-008` | `superseded` | blocked replacement marker: old connection registry is not restartable |
| `IPC-009` | `superseded` | blocked replacement marker: shared endpoint transport is not restartable |
| `IPC-010` | `superseded` | blocked replacement marker: shared runtime multiplex is not restartable |
| `IPC-011` | `superseded` | blocked replacement marker: old runtime task registry is not restartable |
| `IPC-012` | `superseded` | blocked replacement marker: daemon restart semantics are forbidden |
| `IPC-013` | `superseded` | blocked replacement marker: old runtime diagnostics are not restartable |
| `IPC-014` | `superseded` | blocked replacement marker: old phase gate is historical only |

## Phase 3

| ID | Status | Evidence / note |
| --- | --- | --- |
| `HFS-001` | `done` | Host context payload in protocol; 26 protocol tests passed |
| `HFS-002` | `done` | ExtendScript app.path command; 23 host-bundle tests passed |
| `HFS-003` | `done` | HostClient getHostContext; 38 AE tests passed |
| `HFS-004` | `done` | Runtime session context store; 8 host-filesystem tests passed |
| `HFS-005` | `done` | appRoot path construction; 16 host-filesystem tests passed |
| `HFS-006` | `done` | plugin/effect scan payload; 35 protocol tests passed |
| `HFS-007` | `done` | Windows/macOS scan; 20 host-filesystem tests passed |
| `HFS-008` | `done` | adversarial tests; 27 host-filesystem tests passed |
| `HFS-009` | `done` | sort/dedupe/warnings normalization; 27 host-filesystem tests passed |
| `HFS-010` | `done` | progress/cancel scan task; 33 host-filesystem tests passed |
| `HFS-011` | `done` | TS host-filesystem gateway; 4 TS tests passed |
| `HFS-012` | `done` | product scan callsite cutover; 3 TS tests passed |
| `HFS-013` | `done` | old appRoot discovery removed; boundary guard passes |
| `HFS-014` | `done` | phase gate; all verification passed |

## Phase 4 — managed storage

| `STO-001` | `done` | storage audit; data types, consumers, paths documented |
| `STO-002` | `done` | TypeScript storage port; 2 TS tests passed |
| `STO-003` | `done` | managed root resolution; 9 Rust tests passed |
| `STO-004` | `done` | application folder manifest; 13 Rust tests passed |
| `STO-005` | `done` | transaction engine; 18 Rust tests passed |
| `STO-006` | `done` | scoped read TS gateway; 7 TS tests passed |
| `STO-007` | `done` | atomic JSON commit; 23 Rust tests passed |
| `STO-008` | `done` | scoped binary/directory ops; 30 Rust tests passed |
| `STO-009` | `done` | shared JSON file store; 38 Rust tests passed |
| `STO-010` | `done` | persistent search/candidates cache; 45 Rust tests passed |
| `STO-011` | `done` | workspace snapshot; 59 Rust tests passed |
| `STO-012` | `done` | workspace records; 59 Rust tests passed |
| `STO-013` | `done` | widget state; 65 Rust tests passed |
| `STO-014` | `done` | workspace layout; 71 Rust tests passed |
| `STO-015` | `done` | settings files; 77 Rust tests passed |
| `STO-016` | `done` | i18n preference; 82 Rust tests passed |
| `STO-017` | `done` | clipboard persistence; 89 Rust tests passed |
| `STO-018` | `done` | panel persistence; 96 Rust tests passed |
| `STO-019` | `done` | tool handoff; 103 Rust tests passed |
| `STO-020` | `done` | support root relocate; 109 Rust tests passed |
| `STO-021` | `done` | operation history; 118 Rust tests passed |
| `STO-022` | `done` | storage cleanup; all modules cutovered to Rust persistence layer |
| `STO-023` | `done` | existing data migration; 125 Rust tests passed |
| `STO-024` | `done` | phase gate; CONDITIONAL PASS |

## Phase 4 Cutover Progress

| Component | Status | Evidence / note |
| --- | --- | --- |
| `persistence-io.rs` | `done` | Rust persistence handler with PersistenceIoHandler, read_json, read_text, write_json |
| `dispatcher.rs` | `done` | Rust-side IPC request router for persistence methods |
| `main.rs` | `done` | Rust runtime binary with stdin/stdout JSON dispatch |
| `runtime-gateway-port.ts` | `done` | PersistenceGateway interface + method definitions |
| `runtime-init.ts` | `done` | TS initialization layer for spawning Rust runtime |
| `persistence/io.ts` | `done` | Updated to use PersistenceGateway with legacy fallback |

## Phase 5

| ID | Status | Evidence / note |
| --- | --- | --- |
| `NET-001` | `done` | inventory complete; 20+ files, 2 fetch() calls, 13+ endpoints |
| `NET-002` | `done` | SupabaseConfig module; 6 tests passed |
| `NET-003` | `done` | connectivity + explicit offline state; 20 Rust + 5 TS tests passed |
| `NET-004` | `done` | catalog query HTTP client; 10 Rust tests passed; status/pagination/error mapping |
| `NET-005` | `done` | catalog DTO → domain mapper; 5 fixture tests passed; wire DTOs absent from UI |
| `NET-006` | `done` | signed URL validation + streamed download; 12 Rust tests passed; redirect/length/hash/cancel fail-safe |
| `NET-007` | `done` | download+verify+same-dir transaction+record commit orchestration in `apps/runtime`; 9 Rust tests passed; crash injection proves no partial success (asset and record roll back together) |
| `NET-008` | `done` | persistent search cache in `crates/online`; 12 Rust tests passed; restart / offline / explicit delete covered; no TTL auto-eviction (entries persist until explicit delete) |
| `NET-009` | `done` | offline policy applied per operation in `crates/online` + TS gateway; 14 Rust tests + 5 TS tests passed; offline matrix covers check/search-cache local, search cache-only, download explicit fail |
| `NET-010` | `done` | cutover complete; see `status.md` NET-010 evidence |
| `NET-011` | `pending` | — |
| `NET-012` | `pending` | network sub-gate |
| `LIC-001` | `pending` | blocked by FND-007 |
| `LIC-002` | `pending` | blocked by FND-007 |
| `LIC-003` | `pending` | blocked by FND-007 |
| `LIC-004` | `pending` | blocked by FND-007 |
| `LIC-005` | `pending` | blocked by FND-007 |
| `LIC-006` | `pending` | blocked by FND-007 |
| `LIC-007` | `pending` | blocked by FND-007 |
| `LIC-008` | `pending` | blocked by FND-007 |
| `LIC-009` | `pending` | blocked by FND-007 |
| `LIC-010` | `pending` | blocked by FND-007 |
| `LIC-011` | `pending` | blocked by FND-007 |
| `LIC-012` | `pending` | blocked by FND-007 |

## Phase 6

| ID | Status | Evidence / note |
| --- | --- | --- |
| `ELV-001` | `pending` | — |
| `ELV-002` | `pending` | — |
| `ELV-003` | `pending` | — |
| `ELV-004` | `pending` | both OS in one task |
| `ELV-005` | `pending` | — |
| `ELV-006` | `pending` | — |
| `ELV-007` | `pending` | — |
| `ELV-008` | `pending` | — |
| `ELV-009` | `pending` | — |
| `ELV-010` | `pending` | — |
| `ELV-011` | `pending` | cutover + old path deletion |
| `ELV-012` | `pending` | phase gate |

## Phase 7

| ID | Status | Evidence / note |
| --- | --- | --- |
| `PKG-001` | `pending` | — |
| `PKG-002` | `pending` | — |
| `PKG-003` | `pending` | — |
| `PKG-004` | `pending` | — |
| `PKG-005` | `pending` | both OS in one release gate |
| `PKG-006` | `pending` | — |
| `PKG-007` | `pending` | real binary in dev |
| `PKG-008` | `pending` | — |
| `PKG-009` | `pending` | — |
| `PKG-010` | `pending` | package sub-gate |
| `DEL-001` | `pending` | — |
| `DEL-002` | `pending` | — |
| `DEL-003` | `pending` | — |
| `DEL-004` | `pending` | — |
| `DEL-005` | `pending` | — |
| `DEL-006` | `pending` | — |
| `DEL-007` | `pending` | — |
| `DEL-008` | `pending` | — |
| `DEL-009` | `pending` | — |
| `DEL-010` | `pending` | — |
| `DEL-011` | `pending` | — |
| `DEL-012` | `pending` | — |
| `DEL-013` | `pending` | full verification |
| `DEL-014` | `pending` | final gate |

## Ledger invariants

- `in_progress` は通常0件または1件。並行 wave では ownership path が交差せず、`status.md` に lane が列挙された task だけ複数可。
- `ready` は依存 task がすべて `done` のものだけ。
- `done` は `status.md` に同じ ID の evidence があるものだけ。
- phase gate を `done` にする前に、その phase の他 task がすべて `done` または理由付き `superseded` である。
- `superseded` の note には置換先 task ID を書く。
