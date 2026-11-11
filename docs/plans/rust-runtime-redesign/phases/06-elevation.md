# Phase 6 — protected operations and elevation

## Goal

保護 path への必要最小限の操作だけを、通常権限 runtime から分離した one-shot elevated worker で実行する。PowerShell / AppleScript command 組み立てを TypeScript から削除する。

## Entry conditions

- `LIC-012 done`
- normal-user storage / download / hash / host path が完成済み。
- `FND-006` の root table と `FND-008` の allowlist decision が確定済み。

## Tasks

| ID | Depends | Concrete change | Primary files | Verification | Evidence |
| --- | --- | --- | --- | --- | --- |
| `ELV-001` | `LIC-012` | 現行 elevated operation と destination root を全列挙 | `elevation-service.ts`, settings persistence | repo search | operation / root / reason table |
| `ELV-002` | `ELV-001` | preflight result と allowlisted request protocol | protocol, storage / host-filesystem | invalid scope tests | arbitrary path / command なし |
| `ELV-003` | `ELV-002` | nonce、expiry、source hash、binary hash、replay prevention | protocol + runtime signer | tamper/replay tests | one-shot request evidence |
| `ELV-004` | `ELV-003` | Windows と macOS の worker 起動・consent・operation を同時実装 | adjacent worker platform modules | both OS integration | 片OS stub なし |
| `ELV-005` | `ELV-004` | install / replace operation | elevated worker domain | success / occupied / cancel | postcondition verified by normal runtime |
| `ELV-006` | `ELV-004` | remove operation | elevated worker domain | missing / partial / cancel | scope escape rejected |
| `ELV-007` | `ELV-005`, `ELV-006` | UI preflight と consent explanation | storage / settings UI gateway | component + E2E | UAC前に対象表示 |
| `ELV-008` | `ELV-005`, `ELV-006` | partial install journal / recovery | worker + normal runtime | crash injection | committed state preserved |
| `ELV-009` | `ELV-004` | worker logging / redaction / exit code mapping | diagnostics | redaction tests | request secret 非出力 |
| `ELV-010` | `ELV-008`, `ELV-009` | worker signature / version verification | runtime launch + package metadata | tampered binary test | mismatch fail closed |
| `ELV-011` | `ELV-007`, `ELV-010` | TS elevation、PowerShell、AppleScript path を削除 | `elevation-service.ts`, copy/delete helpers | guard + repo search | shell construction 0件 |
| `ELV-012` | `ELV-011` | phase gate | T2 + both OS UAC matrix | evidence complete | `PKG-001 ready` |

## Required rejection tests

- destination outside allowlisted root
- symlink / junction escape
- expired request
- reused nonce
- source content hash mismatch
- worker binary hash / version mismatch
- operation not in allowlist
- user declines consent
- destination becomes occupied after preflight
- runtime dies while worker is active

## Stop checkpoints

- `ELV-002`: allowlist review前に worker process を実装しない。
- `ELV-004`: Windows / macOS の両方が integration test を通るまで task を完了しない。
- `ELV-005` / `ELV-006`: postcondition check なしにUIへsuccessを返さない。
- `ELV-011`:旧 shell path の削除と guard を同じ commit にする。

## Exit gate

- normal runtime は一度も管理者権限で動かない。
- elevated worker は任意 command / path を受け取らない。
- Windows / macOS の consent、拒否、改ざん、recovery が同じ error semantics を持つ。
- TypeScript に PowerShell / AppleScript command 組み立てがない。
