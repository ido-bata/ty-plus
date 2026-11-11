# Phase 4 — managed storage

## Goal

managed root の path 解決、read、atomic write、永続 cache、履歴、reset を Rust storage domain へ移す。データ shape は変えず、一種類ずつ切り替えて旧 writer を同じ task で削除する。

## Entry conditions

- `HFS-014 done`
- host session ごとの supportRoot と明示 shared root が runtime に登録できる。

## Foundation tasks

| ID | Depends | Concrete change | Primary files | Verification | Evidence |
| --- | --- | --- | --- | --- | --- |
| `STO-001` | `HFS-014` | 保存 data type の定義元、consumer、現行 file path を再棚卸し | data docs, migration map | source link check | shape を plan に複製していない |
| `STO-002` | `STO-001` | TypeScript storage port を operation 単位に閉じる | `src/management/storage/contract.ts` | typecheck + contract tests | arbitrary read/write path なし |
| `STO-003` | `STO-001` | session supportRoot / explicit shared root から managed root を解決 | Rust storage paths | path matrix tests | AE version 分岐なし |
| `STO-004` | `STO-003` | application folder manifest と reset inventory | Rust storage manifest | round-trip + reset dry-run | persistent item 全列挙 |
| `STO-005` | `STO-003` | same-directory transaction、flush、replace、recovery engine | Rust storage commit | crash injection | 常設 temp directory なし |
| `STO-006` | `STO-002`, `STO-003` | scoped text / JSON read と TS gateway | Rust read, `storage/runtime-gateway.ts` | malformed/missing tests | ExtendScript read を同 task で削除 |
| `STO-007` | `STO-005`, `STO-006` | atomic JSON commit、expected revision、後書き順序 | Rust write | concurrent/crash tests | old JSON writer を同 task で削除 |
| `STO-008` | `STO-005` | scoped binary / directory operation | Rust storage asset | path escape + short write tests | old binary writer を同 task で削除 |

## Vertical storage slices

各 task は「protocol payload → Rust implementation → TS mapper → product cutover → old path deletion → guard allowlist removal」を一つの commit 単位にする。

| ID | Depends | Slice | Primary current files | Required tests |
| --- | --- | --- | --- | --- |
| `STO-009` | `STO-007` | shared JSON file store | `storage/json-file-store.ts`, `persistence/io.ts` | missing / corrupt / revision |
| `STO-010` | `STO-009` | persistent search / candidates cache | `cache-store.ts`, `read/cache-store.ts`, `write/cache-store.ts`, `candidates-cache/**` | delete-until-user-action、restart persistence |
| `STO-011` | `STO-009` | workspace snapshot | `snapshot-store.ts` | crash recovery / last-write |
| `STO-012` | `STO-009` | workspace records | `storage/workspace/store.ts`, `workspace/persistence/store.ts`, `workspace-store.ext.ts` | two sessions / shared root ordering |
| `STO-013` | `STO-012` | widget state | `widget-state-store.ts` | type-specific round-trip |
| `STO-014` | `STO-012` | workspace layout | `workspace/layout-store.ts`, `workspace-layout-store.ext.ts` | missing fallback / concurrent update |
| `STO-015` | `STO-009` | settings files / workspace UI settings | `settings-files-store.ts`, `workspace-ui-settings-file.ts` | default / version migration |
| `STO-016` | `STO-009` | i18n preference | `i18n/preference/storage.ts` | locale round-trip / missing file |
| `STO-017` | `STO-009` | clipboard persistence | `clipboard-store.ts` | size limit / corrupt payload |
| `STO-018` | `STO-009` | panel persistence | `panel/persistence/chrome-store.ts` | multi-panel isolation |
| `STO-019` | `IPC-010`, `STO-009` | tool handoff file を runtime mediation へ置換 | `preset/tool-handoff-file.ts` | opener surface / runtime restart |
| `STO-020` | `STO-004`, `STO-008`, `STO-015` | support root relocate / copy / reset | setting persistence files | dry-run / cancel / rollback / shared root |
| `STO-021` | `STO-009` | operation history と configurable count / hard maximum | new Rust history module, settings mapper | 0 / default / hard max / trimming |

## Cleanup and gate

| ID | Depends | Concrete change | Verification | Evidence |
| --- | --- | --- | --- | --- |
| `STO-022` | `STO-010`–`STO-021` | storage配下に残る Node fs、CEP fs、ExtendScript File/Folder、fire-and-forget を全削除 | architecture guard + repository search | allowlist 0件または elevation task だけ |
| `STO-023` | `STO-022` | existing data migration、transaction recovery、reset の実データ fixture | both OS integration | pre/post tree と hash |
| `STO-024` | `STO-023` | phase gate | T2 + filesystem matrix | `NET-001 ready` |

## Slice procedure

各 `STO-009`–`STO-021` で次を順番に行う。

1. `docs/architecture/data/` から型定義元と consumer を記録する。
2. 現行 JSON / binary fixture を旧 reader で採取する。
3. Rust reader が同じ domain value を返す test を追加する。
4. Rust writer で round-trip fixture を作る。
5. TypeScript mapper を追加する。
6. product callsite を切り替える。
7. 旧 reader / writer と fallback を削除する。
8. architecture guard allowlist から対象 file を削除する。
9. UI が保存 result を待つことを確認する。
10. `status.md` に旧 path 0件の search 結果を残す。

## Stop checkpoints

- contract と fixture だけ追加した状態で止められる。
- product cutover 後は、旧 writer 削除と targeted test が終わるまで止めない。
- transaction failure test が失敗中なら product cutover しない。
- reset / relocate は dry-run tree を evidence に残すまで実行 mutation を有効にしない。

## Exit gate

- persistent data / cache / history の所在が application folder の manifest から追跡できる。
- OS temp 削除後も product state と検索 cache が残る。
- 同じ shared root の update は runtime 受理順で後書きされる。
- legacy storage fs 経路が elevation 対象以外で0件。
- Windows / macOS の crash / Unicode / path escape matrix が通る。
