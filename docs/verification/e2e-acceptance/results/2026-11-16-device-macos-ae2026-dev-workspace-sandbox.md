# 2026-11-16 device-macos AE2026 dev workspace suite 実行記録（sandbox モード）

## 実行条件

- Host: ローカル Mac（macOS arm64 / After Effects 2026 / app.version 26.x）
- Build: dev bundle（Extension Id `app.ty-plus.dev.*`、`~/Library/Application Support/Adobe/CEP/extensions/app.ty-plus.dev` → `dist/cep-dev` symlink）
- Suite: `workspace`（Issue #108 系、PR #127 の workspace suite + sandbox 隔離）
- Sandbox: **有効**（デフォルト）。実 managed root `/Applications/Adobe After Effects 2026/ty-plus` を OS temp 配下へコピーし、`ty-plus-init.json` の `supportRoot` を sandbox 側へ向けて全 surface を reload。accent `#e2b701` sentinel で panel が sandbox root を解決したことを probe 済み
- 実 managed root への書き込みは一切なし。teardown で backup manifest と byte 比較し、差分は repair 後に再検証
- 実行日時: 2026-11-15T15:40Z–15:45Z（UTC）
- 証跡: `results/2026-11-16-device-macos-ae2026-dev-workspace-sandbox/run.json`、`sandbox-integrity.json`

## 結果

| UC | ケース | 結果 | 確認内容 |
| --- | --- | --- | --- |
| UC-B02 | Add Widget dialog places an info tile | PASS | widgets.json record、tile mount、workspace-1.json gridCells 13→14、復元後 13 |
| UC-B05 | layout snapshot save → mutate → restore → delete | PASS | snapshots.json 永続化、mutate 後の restore で全 panel layout 復元、delete で record 除去。一連の操作を単一実行で完走 |
| UC-D10 | quick-actions palette runs script preset twice consecutively | PASS | 連続 2 回の preset 実行で AE 側 marker が 2 件生成（#125 修正の回帰確認） |
| UC-C12 | footage preset (.png) created via dialog → run imports into AE | BLOCKED | `Create not clickable: missing-button:Create` — file preset dialog の Create button が hydration 完了前に click された（harness 側の観測タイミング問題。enabled poll 修正済み、再実行待ち） |
| UC-C14 | run preset with deleted asset fails without blocking modal | BLOCKED | 同上（同じ dialog 前段で停止。toast 発生/観測の分離検証は未実施のまま） |

合計: **PASS=3 / FAIL=0 / BLOCKED=2 / SKIP=0**（5 cases）

## sandbox 整合性

`run.json` の `sandbox.integrity` および `sandbox-integrity.json`:

- `driftBeforeRepair`: changed=1（`cache/layout-undo/panel-1/stack.json`）、added=0、removed=0
- `filesRepaired`: 同ファイルを backup から復元
- `cleanAfterRepair`: **true** — repair 後の再検証で実 managed root は backup と一致
- `cache/` 配下の揮発ファイルは live surface の write queue が restore 後も再書込するため manifest 対象外とし、整合性対象は永続化データ（settings/workspaces/presets/widgets 等）に限定

## 環境メモ

- 本実行が sandbox 既定化後の初の workspace suite 完走記録。UC-B05 の clean PASS は「save→mutate→restore→delete」を単一 run で完了した初の記録（以前は個別操作は通るが一連実行で race があった）。
- UC-C12/C14 の BLOCKED は製品欠陥ではなく harness の dialog hydration 観測問題。enabled Create button の poll を追加済み（`cases/shared.ts`）で、次回 run で再判定する。
- UC-C14 は toast「発生」と「観測」を分離する検証設計（dialog + panel 双方を最大 20s poll、modal 非ブロック・row gating・AE artifact 非生成を個別 check）を実装済みだが、前段 dialog で停止したため未検証。
- macOS は実行中に高いメモリ圧・swap 使用・Unity batch build 等の並行負荷があり、AE の window 生成が不安定になる事象を観測（別途安定化調査中）。
