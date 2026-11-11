# Phase 1 — repository, boundaries, and protocol

## Goal

`rust/` product source、責務別 crate、TypeScript の責務別 gateway、versioned protocol を、まだ製品機能を切り替えずに成立させる。

## Entry conditions

- `FND-005 done`
- WIP disposition が file 単位で記録済み。
- `FND-006` / `FND-007` の未完了は、root または licensing payload を扱う task だけを止める。repository skeleton と汎用 protocol を止めない。

## Repository tasks

| ID | Depends | Concrete change | Primary files | Verification | Evidence |
| --- | --- | --- | --- | --- | --- |
| `REP-001` | `FND-005` | `rust/` Cargo workspace と toolchain を作成 | `rust/Cargo.toml`, `rust/rust-toolchain.toml` | `cargo metadata --manifest-path rust/Cargo.toml` | workspace members が空でない |
| `REP-002` | `REP-001` | `protocol`, `storage`, `online`, `licensing`, `host-filesystem`, runtime app の crate skeleton | `rust/crates/**`, `rust/apps/runtime/**` | `cargo check --workspace` | 総合 `core` crate なし |
| `REP-003` | `REP-002` | platform module rule を各 OS domain に適用 | `windows.rs`, `macos.rs`, `mod.rs` | 両 target compile | 同じ operation の実装が隣接 |
| `REP-004` | `REP-001` | Rust format / clippy / test scripts を追加 | `package.json`, `scripts/check/**` | 各 script exit 0 | CI から呼べる |
| `REP-005` | `FND-005` | TypeScript IPC transport と責務別 gateway の空 contract を配置 | `src/management/ipc/**`, domain `runtime-gateway.ts` | typecheck | `function/` から transport import なし |
| `REP-006` | `FND-005` | 直接 fs / network / shell を検出する architecture guard を追加。最初は現行 allowlist を明示 | `scripts/check/check-rust-runtime-boundaries.ts`, `package.json` | fixture self-test | allowlist に owner task ID がある |
| `REP-007` | `REP-001` | repository source ownership の正規 docs を更新 | `docs/architecture/repository/**` | docs link check | `rust/` が product source |

## Protocol tasks

| ID | Depends | Concrete change | Primary files | Verification | Evidence |
| --- | --- | --- | --- | --- | --- |
| `PRO-001` | `REP-002` | protocol version と capability naming | `rust/crates/protocol/src/version.rs` | Rust unit test | major / minor compatibility table |
| `PRO-002` | `PRO-001` | request / response / event envelope | protocol `message.rs` | serde round-trip | golden JSON fixtures |
| `PRO-003` | `PRO-002` | stable error code、retryable、diagnostic ID | protocol `error.rs` | all variants fixture | OS message 非依存 |
| `PRO-004` | `PRO-002` | request ID、session ID、deadline、idempotency key | protocol request types | validation tests | invalid combinations rejected |
| `PRO-005` | `PRO-002` | progress stage と cancellation messages | protocol task types | state transition test | commit 中 cancel policy 明示 |
| `PRO-006` | `PRO-002` | frame size、queue、string length、unknown method limits | protocol validation | adversarial tests | limit 値が定数化 |
| `PRO-007` | `PRO-002` | schema generation の deterministic command | Rust schema module, script | two runs produce no diff | generated schema path |
| `PRO-008` | `PRO-007`, `REP-005` | TypeScript wire types generation | `src/management/ipc/generated/**` | typecheck; no diff regeneration | generator version recorded |
| `PRO-009` | `PRO-008` | Rust / TS cross-language fixture test | `rust/crates/protocol/tests/**`, TS test | fixture suite | optional / unknown / integer cases |
| `PRO-010` | `REP-007`, `PRO-009` | phase gate | `status.md`, `verification.md` evidence | T2 | `IPC-001 ready` |

## Stop checkpoints

- `REP-002`: workspace compiles before WIP code is moved.
- `REP-006`: allowlist must never contain an untracked wildcard; each entry has removal task ID.
- `PRO-002`: envelope fixture is committed before domain payloads are added.
- `PRO-008`: generator command and generated output are committed together.
- `PRO-009`: a schema mismatch must fail CI before phase completion.

## Exit gate

- clean checkout から Rust workspace と generated TS types を再生成できる。
- Windows / macOS target module が両方 compile する。
- protocol fixture が Rust / TypeScript で同じ意味になる。
- current legacy callsite は allowlist に file + removal task ID 付きでのみ残る。
