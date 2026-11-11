# Migration map

> 調査時点の production callsite を移行 task と削除 gate に結び付ける。新しい callsite を見つけたら、実装前にこの表へ追加する。

## Rust WIP disposition

| Current path | Decision task | Expected disposition |
| --- | --- | --- |
| `tools/ty-plus-cli/Cargo.toml` | `FND-002` | `rust/Cargo.toml` の材料として監査後に置換 |
| `tools/ty-plus-cli/rust-toolchain.toml` | `FND-002` | toolchain 値を確認して `rust/` へ移す |
| `tools/ty-plus-cli/crates/core/src/error.rs` | `FND-003` | protocol error code へ必要部分だけ移す |
| `tools/ty-plus-cli/crates/core/src/json.rs` | `FND-003` | request / response framing と混ぜず schema を再設計 |
| `tools/ty-plus-cli/crates/core/src/hash.rs` | `FND-003` | storage または online domain へ責務別に移す |
| `tools/ty-plus-cli/crates/core/src/paths.rs` | `FND-003` | host-filesystem / storage に分割し、総合 core を残さない |
| `tools/ty-plus-cli/crates/host/src/app_root.rs` | `FND-004` | registry / `/Applications` discovery を廃棄 |
| `tools/ty-plus-cli/crates/cli/src/commands/app_root.rs` | `FND-004` | 廃棄。`app.path` を host context で受ける |
| `tools/ty-plus-cli/crates/cli/src/commands/plugin_scan_stub.rs` | `HFS-006` | 新 protocol の scan operation として作り直す |
| `tools/ty-plus-cli/crates/cli/src/main.rs` | `FND-005` | one-shot CLI から runtime entrypoint へ置換 |
| `tools/ty-plus-cli/crates/cli/src/output.rs` | `FND-005` | 使える error convention だけ protocol へ移す |
| `tools/ty-plus-cli/README.md` | `DEL-012` | 実装中は履歴資料にせず、最終削除 |

## Host context / AE related filesystem

| Current path | First replacement task | Old path deletion task |
| --- | --- | --- |
| `src/management/setting/onboarding/initialization.ts` | `HFS-003` | `HFS-013` |
| `src/management/ae/jsx/host-bundle.ext.ts` の `app.path` 以外の汎用 file 部分 | `HFS-002` | `HFS-013` |
| `src/management/ae/cep/host-executor.ts` | `HFS-003` | AE DOM command 用として保持し責務を縮小 |
| `src/management/storage/extendscript/file-operations.ext.ts` | `STO-006` | `STO-006` / `STO-008` の該当 slice |
| `src/management/storage/extendscript/workspace-store.ext.ts` | `STO-012` | `STO-012` |
| `src/management/storage/extendscript/workspace-layout-store.ext.ts` | `STO-014` | `STO-014` |
| `src/management/storage/read/text-file.ts` の ExtendScript read | `STO-006` | `STO-006` |
| plugin / effect scan callsite | `HFS-006` | `HFS-012` |

## Storage and settings

| Current path | Slice | Replacement task | Old path deletion task |
| --- | --- | --- | --- |
| `src/management/storage/contract.ts` | gateway contract | `STO-002` | retained as domain port after cleanup |
| `src/management/storage/read/json-file.ts` | JSON read | `STO-006` | `STO-006` |
| `src/management/storage/write/json-file.ts` | atomic JSON write | `STO-007` | `STO-007` |
| `src/management/storage/write/file-operations.ts` | binary / directory write | `STO-008` | `STO-008` |
| `src/management/storage/write/elevation-service.ts` | protected write | `ELV-001` | `ELV-011` |
| `src/management/storage/json-file-store.ts` | shared JSON store | `STO-009` | `STO-009` |
| `src/management/storage/cache-store.ts` | persistent cache | `STO-010` | `STO-010` |
| `src/management/storage/read/cache-store.ts` | persistent cache read | `STO-010` | `STO-010` |
| `src/management/storage/write/cache-store.ts` | persistent cache write | `STO-010` | `STO-010` |
| `src/management/storage/snapshot-store.ts` | workspace snapshot | `STO-011` | `STO-011` |
| `src/management/storage/workspace/store.ts` | workspace records | `STO-012` | `STO-012` |
| `src/management/workspace/persistence/store.ts` | workspace orchestration | `STO-012` | retained as use-case adapter |
| `src/management/storage/widget-state-store.ts` | widget state | `STO-013` | `STO-013` |
| `src/management/storage/workspace/layout-store.ts` | layout | `STO-014` | `STO-014` |
| `src/management/storage/settings-files-store.ts` | settings | `STO-015` | `STO-015` |
| `src/management/setting/persistence/workspace-ui-settings-file.ts` | UI settings | `STO-015` | `STO-015` |
| `src/management/i18n/preference/storage.ts` | locale preference | `STO-016` | `STO-016` |
| `src/management/storage/clipboard-store.ts` | clipboard persistence | `STO-017` | `STO-017` |
| `src/management/panel/persistence/chrome-store.ts` | panel state | `STO-018` | `STO-018` |
| `src/management/preset/tool-handoff-file.ts` | surface handoff | `STO-019` | `STO-019` |
| `src/management/setting/persistence/node-fs.ts` | settings fs | `STO-020` | `STO-020` |
| `src/management/setting/persistence/copy-directory-recursive.ts` | root relocation | `STO-020` | `STO-020` |
| `src/management/setting/persistence/delete-support-root-source.ts` | reset / relocation | `STO-020` | `STO-020` |

## Online and licensing

| Current path | Slice | Replacement task | Old path deletion task |
| --- | --- | --- | --- |
| `src/management/online/connectivity/env.ts` | runtime config | `NET-002` | `NET-010` |
| `src/management/cep-dev-env.ts` | dev config input | `NET-002` | retained only as non-secret build input |
| `src/management/workspace/services.ts` | gateway composition | `NET-003` | `NET-010` |
| `src/management/online/catalog/gateway.ts` | catalog HTTP | `NET-004` | `NET-010` |
| `src/management/online/catalog/repository.ts` | domain mapping | `NET-005` | retained near online domain |
| `src/management/online/catalog/download-progress.ts` | byte stream / progress | `NET-006` | `NET-010` |
| `src/management/online/catalog/use-cases.ts` の `fetch` / file save | `NET-007` | `NET-010` |
| `src/management/online/catalog/download-detection.ts` | local presence | `NET-007` | storage / online mapper として整理 |
| `src/management/online/licensing/storage.ts` | credential persistence | `LIC-003` | `LIC-010` |
| `src/management/online/licensing/validator.ts` | license validation | `LIC-005` | `LIC-010` |
| `src/management/online/licensing/LicenseContext.tsx` | UI session state | `LIC-007` | UI provider として縮小 |
| `src/management/online/licensing/features.ts` | feature decision | `LIC-008` | domain policy として保持 |

## Packaging and scripts

| Current path | Replacement task | Required final state |
| --- | --- | --- |
| `scripts/build/build-cli.ts` | `PKG-002` | `rust/` runtime build。両 platform artifact を明示 |
| `scripts/lib/cli-paths.ts` | `PKG-003` | runtime path resolver へ改名・更新 |
| `scripts/package/sign-cli.ts` | `PKG-005` | macOS runtime signing / notarization |
| `scripts/package/package-cep-archive.ts` | `PKG-004` | binary 欠落を warning でなく hard failure |
| `package.json` の `*:cli` scripts | `PKG-002` | `*:runtime` へ置換 |
| `tools/ty-plus-cli/` | `DEL-012` | `rust/` への移行後に完全削除 |

## Verification harness (production tree に置かれている検証ツール)

| Current path | Slice | Replacement task | Required final state |
| --- | --- | --- | --- |
| `src/shared/scenario/loader.ts` | Gherkin fixture read | `VER-001` | harness を `scripts/` へ移し、production ツリーから外す |

`src/shared/scenario/` は scenario 構造ルールを走らせる検証ハーネスであり、製品コードでは
ない（このディレクトリの外から import するモジュールは存在しない）。`node:fs` を使うのは
`.feature` / `.json` fixture を読み込むという目的そのものなので、`VER-001` が
production ツリーから外すまでの一時例外として扱う。

## Inventory guard

`REP-006` で、少なくとも次を production TS / ExtendScript の禁止検索へ追加する。

- Node `fs` / `child_process` の domain 外利用
- `window.cep.fs`
- 製品 `fetch` / XHR / WebSocket
- ExtendScript の汎用 `File` / `Folder` read-write
- PowerShell / AppleScript command 組み立て
- Rust binary 欠落時の fallback 文言と分岐
