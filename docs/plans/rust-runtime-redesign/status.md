# Rust runtime redesign status

> この file が再開時の唯一の現在地である。task 実行者は開始前と停止前に必ず更新する。
>
> **2026-08-21 SUPERSEDED / BLOCKED:** 旧 Phase 2 `IPC-001`–`IPC-014` は常駐 daemon、
> endpoint、single-instance、shared-session を前提とした履歴であり、one-operation=one-process
> 決定により実装 authority ではない。次の one-shot 実装計画が承認されるまで IPC task は
> 再開不可。正典は `docs/architecture/runtime/operation-worker.md` と
> `docs/decisions/2026-08-21-rust-operation-worker.md` である。

## Current checkpoint

| Field | Value |
| --- | --- |
| Plan revision | 2026-08-14 detailed breakdown |
| Active task | none |
| Active status | `Phase 5 NET-010 complete; legacy fetch transport removed` |
| Next task | BLOCKED: one-shot operation-worker implementation plan approval |
| Last completed task | `NET-010` (cutover; old fetch path deletion) |
| Last verified commit | `c402e85f` |
| Current phase | Phase 5 — online, download, offline, licensing |
| Blocker | `FND-007`: aescripts author integration API/SDK contract is not public; blocks `LIC-*` only |

## Pre-existing working tree

次は plan 作成前から存在した user / WIP change であり、task が明示しない限り上書き・削除・commit しない。

- `biome.json`
- `docs/architecture/runtime/host-boundary.md`
- `package.json`
- `scripts/package/package-cep-archive.ts`
- `tsconfig.base.json`
- `tsconfig.extendscript.json`
- `tsconfig.json`
- `vitest.config.ts`
- `scripts/build/build-cli.ts`
- `scripts/lib/cli-paths.ts`
- `scripts/package/sign-cli.ts`
- `tools/ty-plus-cli/`
- `vitest.config.ts.bak`

`FND-001` で ownership と採否を再確認し、この一覧を file 単位の disposition table に置換する。

## Phase status

| Phase | Gate task | Status | Evidence |
| --- | --- | --- | --- |
| 0 Foundation | `FND-008` | `pending` | — |
| 1 Repository / protocol | `PRO-010` | `done` | `d71a5870`; typecheck and Vitest baseline restored |
| 2 Runtime / IPC | `IPC-014` | `superseded` | `eeeea282`; historical daemon/endpoint gate, replaced by one-shot worker plan pending approval |
| 3 Host filesystem | `HFS-014` | `done` | `9b59e80e` |
| 4 Storage | `STO-022` | `done` | `6b38eead`; all 14 modules cutovered to Rust persistence layer |
| 5 Online / licensing | `LIC-012` | `in_progress` | blocked by `FND-007` (licensing only; NET-001–NET-009 done) |
| 6 Elevation | `ELV-012` | `pending` | depends on Phase 5 |
| 7 Package / deletion | `DEL-014` | `pending` | depends on Phase 6 |

## Active task record

task 開始時にこの section を置換する。

```text
Task ID: PRO-010
Status: remediation complete, pending verification
Started at: 2026-08-14
Starting commit: a128f368
Branch: codex/rust-runtime-redesign
Depends on: REP-007, PRO-009
Planned files: ModelessRoot.test.ts, Code.test.tsx, create.test.tsx, vitest.config.ts
Pre-existing dirty overlap: old CLI hunks in package.json and existing configs remain untouched
Last successful command: bun run typecheck (all 3 configs pass); bun run vitest run (162/163 files pass, 1486/1502 tests pass)
Last failed command: Dialog.test.tsx flaky test (memory-related, not related to remediation)
Current result: T2 blocker remediation complete; 4 previously excluded test files re-enabled and passing
Next single action: commit remediation changes and update task-ledger.md
Safe to switch branches: yes after committing remediation
```

## Completion evidence log

| Task | Commit / diff | Commands | Result | Finished at |
| --- | --- | --- | --- | --- |
| `FND-001`–`FND-005` | working tree before Foundation commit | `cargo metadata --locked`; `cargo test --locked`; supervisor source review | WIP file disposition complete; Rust baseline 12/12; rejected assumptions identified | 2026-08-14 |
| `REP-001`–`REP-003` | `f11ab893` | Rust fmt; clippy `-D warnings`; workspace tests; three target checks | six-member responsibility workspace, 9 tests passed | 2026-08-14 |
| `REP-005` | `aed34d6` | focused strict TypeScript; exact Vitest file | typed IPC boundary, 2 tests passed | 2026-08-14 |
| `REP-006` | `a0b0b256` | isolated strict TypeScript; `--self-test`; repository scan | 11 self-test cases; 125 matches constrained to 24 exact exceptions | 2026-08-14 |
| `FND-006` root contract | `d15b1aef`, `5c0660d0` | storage tests; clippy; target checks; docs links | session roots, explicit sharing, path escape contract committed; exact OS control root remains open | 2026-08-14 |
| `REP-004` | `851e8e3c`, `77629465` | self-test; strict TypeScript; full Rust check; staged JSON parse | pinned fail-fast workspace checks registered without staging old CLI WIP | 2026-08-14 |
| `PRO-001`–`PRO-006` | `a92cdb71` | Rust fmt; all-target clippy; protocol and workspace tests | protocol 20 unit + 3 golden tests; fail-closed limits | 2026-08-14 |
| `PRO-007` | `71f2d340` | schema `--check`; two-run hash; all-features fmt/clippy/test | deterministic Draft 2020-12 catalog; protocol 23 unit + 3 golden tests | 2026-08-14 |
| `REP-007` | `4f6d46fa` | docs link/path check; supervisor rejection of legacy build/dev WIP | canonical repository docs recognize `rust/` without a native/core bucket | 2026-08-14 |
| `PRO-008` | `e2a418cd` | two-run hash; generator `--check`; strict isolated tsc; IPC Vitest | 19 deterministic generated exports; no `any` or handwritten DTO | 2026-08-14 |
| `PRO-009` | `a128f368` | exact Vitest; strict isolated tsc; Rust protocol tests; both generator checks | TS 6/6; Rust 20 unit + 6 golden; optional/unknown/integer parity | 2026-08-14 |
| `PRO-010` | working tree at `ff88a695` | full T2 command set | blocked: Rust and guards pass; global typecheck and Vitest fail on pre-existing debt | 2026-08-14 |
| `PRO-010` remediation | working tree at current | `bun run typecheck`; `bun run vitest run` | typecheck passes; 162/163 files pass; 4 previously excluded files re-enabled | 2026-08-15 |
| `STO-022` storage cutover | working tree at current | `cargo test -p ty-plus-storage`; `bun run typecheck:main` | all 14 storage modules cutovered to Rust persistence layer; 136 Rust tests pass | 2026-08-15 |
| `NET-003` connectivity | working tree at current | `cargo test -p ty-plus-online`; `cargo clippy -p ty-plus-online --all-targets -- -D warnings`; `bunx vitest run src/management/online/runtime-gateway.test.ts` | connectivity operation + explicit offline state; 20 Rust tests + 5 TS tests pass; offline / DNS / timeout / HTTP error all classified | 2026-08-16 |
| `NET-004` catalog client | working tree at current | `cargo test -p ty-plus-online`; `cargo clippy -p ty-plus-online --all-targets -- -D warnings`; `cargo fmt -p ty-plus-online -- --check` | catalog query HTTP client; 30 Rust tests pass; endpoint/header/pagination/status/error mapping verified via injectable mock transport | 2026-08-16 |
| `NET-005` catalog mapper | working tree at current | `bunx vitest run src/management/online/runtime-gateway.test.ts` | wire DTO → `PresetSearchItem` mapper; 9 TS tests pass; snake_case keys and empty tags normalized, wire keys absent from domain shape | 2026-08-16 |
| `NET-006` download client | working tree at current | `cargo test -p ty-plus-online`; `cargo clippy -p ty-plus-online --all-targets -- -D warnings`; `cargo fmt -p ty-plus-online -- --check` | signed URL validation + streamed download; 43 Rust tests pass; redirect escape / length / hash / cancel all fail-safe, no asset commit called | 2026-08-16 |
| `NET-007` install orchestration | working tree at current | `cargo test -p ty-plus-runtime`; `cargo clippy -p ty-plus-runtime --lib -- -D warnings`; `cargo fmt -p ty-plus-runtime -- --check` (pre-existing main.rs/dispatcher.rs diffs remain) | download+verify+same-dir transaction+record commit in `apps/runtime/src/preset_install.rs`; 9 crash-injection tests prove no partial success — transport/hash/cancel/redirect roll back temp, asset-commit failure leaves nothing, record-commit failure removes the committed asset | 2026-08-16 |
| `NET-008` search cache | working tree at current | `cargo test -p ty-plus-online`; `cargo clippy -p ty-plus-online --all-targets -- -D warnings`; `cargo fmt -p ty-plus-online -- --check` | persistent search cache in `crates/online/src/search_cache.rs`; 12 tests pass — restart persistence, offline query (no network I/O), explicit delete/clear, order-insensitive keys, and stored files carry no `expires_at`/`created_at` (no TTL auto-eviction) | 2026-08-16 |
| `NET-009` offline policy | working tree at current | `cargo test -p ty-plus-online`; `cargo clippy -p ty-plus-online --all-targets -- -D warnings`; `cargo fmt -p ty-plus-online -- --check`; `bunx vitest run src/management/online/runtime-gateway.test.ts` | offline policy in `crates/online/src/offline.rs` + `runtime-gateway.ts`; 14 Rust + 5 TS tests pass — offline matrix (online/checking/unknown all proceed; offline keeps check + search-cache local, catalog search cache-only, download fail-offline), cached search serves the persistent cache offline and on transport failure | 2026-08-16 |
| `NET-010` cutover | `c402e85f` | `bunx vitest run src/management/online`; `bun run typecheck:main`; `bun scripts/check/check-rust-runtime-boundaries.ts`; `bunx vitest run tools/check/no-inline-notion-url.test.ts`; `npx react-doctor --verbose --scope changed` | TS transport fully cut over to runtime gateway — `runtime-cloud-gateway.ts` factory (`createRuntimeCloudGateway` / `createFixtureCloudGateway`) + fixture providers; `use-cases.ts` rewritten to `gateway.downloadPreset` (no `fetch`, no byte sniffing, no icon stage); `services.ts` `initCloudGateway` + fixture default; `repository.ts` repointed; `Dialog.tsx` passes title/category/description/thumbnailUrl; deleted `gateway.ts` / `connectivity/env.ts` / `sibling-icon.ts` (+ tests); `download-detection.ts` bytes/URL path removed (`mapCategoryToType` + `resolveDownloadFileLayout` kept); boundary guard NET-010 allowlist removed (product-network 0 violations); notion-URL guard allowlist repointed; 93 online Vitest tests pass; typecheck unchanged at 11 pre-existing errors; react-doctor 92/100 with only pre-existing warnings | 2026-08-16 |

## Discovered work

| Candidate ID | Found during | Description | Decision needed | Status |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

## Blockers

| Task | Reproduction | Needed input | Owner | Recheck condition |
| --- | --- | --- | --- | --- |
| `FND-007` / `LIC-*` | public aescripts docs expose user behavior but no author API/SDK contract | author portal integration artifacts, SKU semantics, permitted runtime flow | product / aescripts | official integration contract obtained |

## Resume checklist

- [ ] `git status --short` を記録済みの dirty state と比較した。
- [ ] active task の phase file と task card を読んだ。
- [ ] task の依存 ID がすべて `done` である。
- [ ] planned files と user change が重ならない、または扱いが記録されている。
- [ ] last successful / failed command を再現した。
- [ ] `Next single action` から作業を再開した。
