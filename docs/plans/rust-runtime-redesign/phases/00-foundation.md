# Phase 0 — foundation and WIP disposition

## Goal

実装開始前に、既存 dirty change、Rust WIP、保存場所、license の具体値を決め、途中で設計判断へ戻らなくてよい状態にする。

## Entry conditions

- [`../architecture.md`](../architecture.md) の第21節が了承済み。
- [`../status.md`](../status.md) の pre-existing working tree が現状と一致する。

## Tasks

| ID | Depends | Concrete change | Primary files | Verification | Completion evidence |
| --- | --- | --- | --- | --- | --- |
| `FND-001` | — | dirty file ごとに owner、目的、keep / rewrite / delete を記録 | `status.md`, `migration-map.md` | `git status --short`; `git diff --stat` | disposition に未分類 file がない |
| `FND-002` | `FND-001` | `tools/ty-plus-cli` の file inventory と dependency / toolchain を固定 | `migration-map.md`, `tools/ty-plus-cli/**` は read-only | `cargo metadata`; `cargo test` on WIP | file ごとの disposition |
| `FND-003` | `FND-002` | WIP の error / json / hash / paths を責務別に採用判定 | `migration-map.md` | 該当 unit test の一覧 | copy ではなく移動先 crate が決定 |
| `FND-004` | `FND-002` | registry、`AE_INSTALL_PATH`、`/Applications` appRoot discovery を廃棄対象として固定 | WIP `app_root.rs`, command | repository search | product path に discovery 0件の削除 task が紐付く |
| `FND-005` | `FND-003` | one-shot CLI から companion runtime への entrypoint 差分を決定 | architecture, phase 1/2 task cards | plan link check | 起動、終了、version、error の移行先が明確 |
| `FND-006` | `FND-001` | application control root、per-AE managed root、明示 shared root、OS temp 例外を path table に固定 | `architecture.md`, official storage draft | Windows / macOS path review | 全 persistent item の唯一の root が決定 |
| `FND-007` | `FND-001` | aescripts 認証方式、再検証間隔、grace、端末移行、失効時動作を決定 | architecture license section | product review | 数値と状態遷移に TBD がない |
| `FND-008` | `FND-004`–`FND-007` | phase gate。決定を正規 architecture docs へ移し次 task を ready 化 | official docs, `status.md` | docs link check; `git diff --check` | Phase 0 evidence + `REP-001 ready` |

## Task details

### FND-001 — working tree ownership

Preflight:

1. `git status --short` を保存する。
2. 各 modified / untracked file の diff または内容を確認する。
3. この redesign より前の変更か、redesign で置換する WIP かを分類する。

禁止事項:

- user change を整理目的で format しない。
- `vitest.config.ts.bak` を理由なく削除しない。
- WIP file を `rust/` へ移す前に内容を変更しない。

Safe stop: disposition table に確認済みの最終 file と、次に確認する一 file を書く。

### FND-006 — storage location table

最低限、次の item の owner と path source を固定する。

- runtime binary
- runtime lock / socket / discovery metadata
- managed root initializer
- workspace / settings / records / layout / asset
- persistent search cache
- operation history と hard maximum
- log / diagnostic bundle
- OS credential store key
- disposable OS temp cache
- transaction file

Safe stop: 未決 item を空欄にせず `blocked: <needed decision>` と記録する。

### FND-007 — license state machine

状態を `unactivated`、`valid-online`、`valid-offline-grace`、`verification-due`、`revoked`、`service-unavailable` に閉じる。各状態で local feature、online catalog、cache、UI action を表にする。

Safe stop: 調査中の aescripts API 名と確認元、次に確認する質問を記録する。

## Exit gate

- WIP の file ごとの採否が決まっている。
- appRoot discovery を再利用しないことが明示されている。
- path / cache / history / license に TBD がない。
- 正規 docs と plan の判断が矛盾しない。
- `status.md` の next task が `REP-001` である。
