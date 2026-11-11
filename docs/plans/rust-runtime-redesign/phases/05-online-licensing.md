# Phase 5 — online, download, offline, and aescripts licensing

## Goal

製品 HTTP/TLS、catalog、download、persistent search cache、aescripts license session を Rust の責務別 domain へ移す。online 障害が local feature を停止させない。

## Entry conditions

- `STO-024 done`
- persistent cache と atomic asset commit が利用可能。
- `FND-007` の license state / interval / grace が確定済み。

## Network tasks

| ID | Depends | Concrete change | Primary files | Verification | Evidence |
| --- | --- | --- | --- | --- | --- |
| `NET-001` | `STO-024` | endpoint、header、token、redirect、retry の現行 inventory | online files, migration map | secret scan | arbitrary URL callsite 一覧 |
| `NET-002` | `NET-001` | Rust runtime config。build input と secret を分離 | Rust online config, `cep-dev-env.ts` | config validation | React に secret なし |
| `NET-003` | `NET-002` | connectivity operation と explicit offline state | Rust online connectivity, TS gateway | offline / DNS / timeout tests | local service composition 非依存 |
| `NET-004` | `NET-003` | catalog query HTTP client | Rust online catalog | mock server contract | status / pagination / error mapping |
| `NET-005` | `NET-004` | catalog DTO → existing domain model mapper | `online/runtime-gateway.ts`, repository | fixture tests | UI に wire DTO なし |
| `NET-006` | `NET-003`, `STO-008` | signed URL validation と streamed download | Rust online download | redirect / length / hash / cancel | byte array IPC なし |
| `NET-007` | `NET-006`, `STO-005` | download + verify + same-dir transaction + record commit | Rust online/storage orchestration | crash injection | partial success なし |
| `NET-008` | `NET-004`, `STO-010` | persistent search cache update / query / explicit delete | Rust online cache | restart / offline / delete tests | TTL 自動削除なし |
| `NET-009` | `NET-003`, `NET-008` | offline policy を各 operation に適用 | Rust + TS gateway | offline matrix | local features 全利用可能 |
| `NET-010` | `NET-005`–`NET-009` | TS `fetch`、download helper、direct Supabase transport を削除 | current online callsites | guard + repo search | product fetch 0件 — done (see `status.md` NET-010 evidence) |
| `NET-011` | `NET-010` | catalog UI / progress / cancel E2E | catalog UI files | E2E real runtime | stage と error code evidence |
| `NET-012` | `NET-011` | network sub-gate | T2 relevant subset | both OS | `LIC-001 ready` |

## Licensing tasks

| ID | Depends | Concrete change | Primary files | Verification | Evidence |
| --- | --- | --- | --- | --- | --- |
| `LIC-001` | `NET-012`, `FND-007` | aescripts adapter boundary と API fixture | Rust licensing provider | contract test | provider-specific code isolated |
| `LIC-002` | `LIC-001` | license state machine と protocol payload | Rust licensing state, protocol | exhaustive transition test | undefined transition 0件 |
| `LIC-003` | `LIC-002` | Windows / macOS credential store implementation を隣接配置 | licensing credential modules | both OS integration | plaintext credential 0件 |
| `LIC-004` | `LIC-003` | activation / refresh / deactivation | provider + state store | mock provider tests | idempotency evidence |
| `LIC-005` | `LIC-004` | periodic online revalidation scheduler | runtime licensing task | clock-controlled tests | interval from fixed config |
| `LIC-006` | `LIC-005` | offline grace、service outage、revocation | state machine | offline matrix | local data deletion 0件 |
| `LIC-007` | `LIC-002`, `LIC-006` | React LicenseContext を Rust session projection に縮小 | `LicenseContext.tsx`, runtime gateway | component tests | timer / validation logic はRust側 |
| `LIC-008` | `LIC-007` | feature access policy を確定 state に接続 | `features.ts` | policy table test | online非依存機能の扱い明示 |
| `LIC-009` | `LIC-005` | device change / clock rollback / credential loss | Rust licensing | adversarial tests | user-safe recovery code |
| `LIC-010` | `LIC-007`–`LIC-009` | 旧 license storage / validator の責務を削除 | `licensing/storage.ts`, `validator.ts` | repo search | plaintext / duplicate validator 0件 |
| `LIC-011` | `LIC-010` | real runtime + fake aescripts server E2E | integration harness | full state journey | correlation log redacted |
| `LIC-012` | `LIC-011` | phase gate | T2 + offline matrix + both OS credential | evidence complete | `ELV-001 ready` |

## Stop checkpoints

- `NET-004`: mock server fixture が固定されるまで product gateway を切り替えない。
- `NET-006`: hash mismatch / redirect escape / cancel が全て失敗安全になるまで asset commit を呼ばない。
- `NET-010`: direct fetch 削除と architecture guard 更新を同じ commit にする。
- `LIC-003`: Windows / macOS の片方だけで credential を保存できる状態を product branch に入れない。
- `LIC-006`: grace expiry で local file を変更しないことを fixture tree で証明する。

## Exit gate

- product TS source に direct `fetch` / XHR / WebSocket がない。
- download は Rust 内で検証・commit まで完結する。
- 検索 cache は明示削除まで永続する。
- offline で local feature が利用できる。
- aescripts 再検証と grace が両 OS の credential store で動く。
