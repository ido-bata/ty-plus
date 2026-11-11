# Phase 2 — runtime process and IPC

> **SUPERSEDED / 実装禁止 (2026-08-21):** この phase の daemon、複数 surface が共有する
> endpoint、named pipe / UDS、single-instance lifecycle は one-operation=one-process 決定に
> より採用しない。以下の task 定義は削除せず履歴調査用に保持するが、authority ではない。
> 次の one-shot 実装計画が承認されるまで、この phase と `IPC-001`–`IPC-014` は再開不可
> (`blocked`)。正典は [`docs/architecture/runtime/operation-worker.md`](../../../architecture/runtime/operation-worker.md)、
> [`docs/decisions/2026-08-21-rust-operation-worker.md`](../../../decisions/2026-08-21-rust-operation-worker.md)。

## Goal

dev mode を含む実 Rust runtime を起動し、Windows named pipe / macOS Unix domain socket へ複数 CEP surface が安全に接続できるようにする。

## Entry conditions

- `PRO-010 done`
- protocol envelope と generated TS types が固定済み。

## Tasks

| ID | Depends | Concrete change | Primary files | Verification | Evidence |
| --- | --- | --- | --- | --- | --- |
| `IPC-001` | `PRO-010` | application control root と endpoint naming | runtime config, protocol | path unit tests | AE version 非依存 endpoint |
| `IPC-002` | `IPC-001` | framed JSON codec と partial read/write | protocol/runtime codec | fragmented frame tests | malformed frame closes connection |
| `IPC-003` | `IPC-002` | Windows named pipe と macOS UDS の listener / client を同時実装 | adjacent `windows.rs`, `macos.rs` | both OS integration | 片OS stub なし |
| `IPC-004` | `IPC-003` | Windows ACL と macOS socket permission / cleanup | adjacent platform modules | permission integration | same-user only evidence |
| `IPC-005` | `IPC-004` | Windows / macOS single-instance lock を同時実装 | adjacent platform modules | both OS two-process test | second process connects, does not replace |
| `IPC-006` | `IPC-005` | 両 OS の stale lock / endpoint recovery | adjacent platform modules | crash recovery test | stale state cleanup evidence |
| `IPC-007` | `IPC-005`, `IPC-006` | handshake、version、capability、nonce | runtime session module | mismatch tests | fail-closed evidence |
| `IPC-008` | `IPC-007` | connection registry と host session lifecycle | runtime session module | reconnect tests | multiple host sessions isolated |
| `IPC-009` | `IPC-007` | CEP Node transport。spawn / connect / request routing | `src/management/ipc/**` | Vitest with process harness | stdout を protocol に使わない |
| `IPC-010` | `IPC-009` | panel / modeless dialog / workspace surface multiplex | IPC TS tests, runtime test | 3-client integration | response routed by request ID |
| `IPC-011` | `IPC-009` | deadline / cancel propagation | runtime task registry | timeout/cancel tests | commit boundary policy evidence |
| `IPC-012` | `IPC-009` | crash detection、一回再起動、非idempotent再送禁止 | lifecycle modules | crash injection | duplicate write 0件 |
| `IPC-013` | `IPC-007` | structured log と correlation ID redaction | runtime diagnostics | redaction tests | token/path fixture absent in log |
| `IPC-014` | `IPC-010`–`IPC-013` | phase gate | status evidence | T2 + both OS integration | `HFS-001 ready` |

## Implementation order

1. codec を in-memory stream で完成させる。
2. Windows / macOS transport を同じ public trait に接続する。
3. single-instance を加える。
4. handshake 後だけ request dispatcher を開く。
5. CEP transport を実 runtime へ接続する。
6. multi-surface、cancel、crash を順に追加する。

## Stop checkpoints

- `IPC-002`: process 起動前に codec test が全件通る。
- `IPC-003`–`IPC-006`: Windows / macOS の変更と test を同じ task commit に含め、片方だけでは完了にしない。
- `IPC-009`: dev server は実 runtime binary がない場合に hard failure する。
- `IPC-012`: crash test 前に非idempotent request fixture を保存する。

## Exit gate

- Windows / macOS の両方で一つの runtime へ3 surface が接続できる。
- wrong version、wrong nonce、malformed frame は request dispatch 前に拒否される。
- runtime crash 後にread-only requestは再接続でき、writeは暗黙再送されない。
- OS temp に endpoint / lock / discovery file がない。
