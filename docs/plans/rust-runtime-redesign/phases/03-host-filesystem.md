# Phase 3 — host context and read-only filesystem

## Goal

ExtendScript の `app.path` と app-specific support root を session context として Rust へ渡し、最初の vertical slice である plugin / effect scan を両 OS で完成させる。

## Entry conditions

- `IPC-014 done`
- 実 runtime と TS transport が利用可能。

## Tasks

| ID | Depends | Concrete change | Primary files | Verification | Evidence |
| --- | --- | --- | --- | --- | --- |
| `HFS-001` | `IPC-014` | host context payload を protocol に追加 | protocol types / generated TS | round-trip | appRoot, supportRoot, session only |
| `HFS-002` | `HFS-001` | ExtendScript が `app.path` と support root を返す command | `src/management/ae/jsx/host-bundle.ext.ts` | host-bundle unit test | registry discovery なし |
| `HFS-003` | `HFS-002` | HostClient で取得し runtime 登録 | AE CEP executor, onboarding | Vitest | version は診断値のみ |
| `HFS-004` | `HFS-003` | runtime session ごとの immutable context store | host-filesystem session | Rust tests | 2 AE session isolated |
| `HFS-005` | `HFS-004` | appRoot から preset / script / plugin path を構築 | host-filesystem paths | Windows/macOS table tests | absolute path hardcode なし |
| `HFS-006` | `HFS-005` | plugin / effect scan request と result payload | protocol, host-filesystem | contract test | arbitrary root API なし |
| `HFS-007` | `HFS-006` | Windows / macOS scan を隣接 file で同時実装 | scan `windows.rs`, `macos.rs` | both OS fixtures | 片OS stub なし |
| `HFS-008` | `HFS-007` | junction / reparse point / symlink の platform adversarial test | adjacent platform tests | both OS fixtures | root escape 0件 |
| `HFS-009` | `HFS-008` | sort、dedupe、unreadable warning の共通化 | scan `mod.rs` | shared fixtures | platform result semantics 一致 |
| `HFS-010` | `HFS-009` | progress / cancel | scan task | large tree integration | cancel leaves no persistent artifact |
| `HFS-011` | `HFS-010` | TS host-filesystem gateway と domain mapper | `src/management/ae/files/runtime-gateway.ts` | Vitest | UI は wire DTO を見ない |
| `HFS-012` | `HFS-011` | product scan callsite を切替 | current scan consumer | targeted E2E | Rust result only used |
| `HFS-013` | `HFS-012` | appRoot discovery と旧 scan path を削除 | WIP app_root files, TS/ExtendScript old path | repository search | fallback 0件 |
| `HFS-014` | `HFS-013` | phase gate | status / migration map | T2 + both OS + 2 AE versions | `STO-001 ready` |

## Required fixtures

- empty plugin directory
- nested effect directories
- duplicate logical plugin names
- unreadable child directory
- Japanese / emoji filename
- Windows junction outside root
- macOS symlink outside root
- cancellation during large scan
- two AE sessions with different appRoot / supportRoot
- explicit shared managed root while appRoot remains separate

## Stop checkpoints

- `HFS-002`: host-bundle test と生成 JSX syntax check が通った状態で止める。
- `HFS-005`: path table を fixture 化してから filesystem access を実装する。
- `HFS-007` / `HFS-008`: 両 platform の実装と adversarial fixture を同じ task commit に含める。`HFS-009` まで切替禁止。
- `HFS-012`:切替 commit に旧 callsite 削除と guard allowlist 縮小を含める。

## Exit gate

- `appRoot` は ExtendScript `app.path` 由来だけ。
- AE version による Rust / TS 分岐がない。
- 複数 AE version の session が同時に scan できる。
- Windows / macOS で同じ result semantics を満たす。
- WIP の appRoot discovery と旧 scan fallback が削除済み。
