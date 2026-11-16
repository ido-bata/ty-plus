# 2026-11-15 device-macos AE2026 dev 受入 suite 実行記録（journey suite）

## 実行条件

- Host: ローカル Mac（macOS arm64 / After Effects 2026 = app.version `26.5.3x9`）
- Build: dev bundle（Extension Id `app.ty-plus.dev.*`、`~/Library/Application Support/Adobe/CEP/extensions/app.ty-plus.dev`）
- Managed root: `/Applications/Adobe After Effects 2026/ty-plus`
- Suite: `journey`（Issue #108 追補。preset の作成→配置→実行→保存→reload→再実行というユーザー作業単位を対象）
- 実行日時: 2026-11-15T13:3xZ（UTC）
- 証跡: 本ディレクトリの `run.json` / `uc-h02-after-rerun.png`

## 結果

| Suite | UC | ケース | 結果 |
| --- | --- | --- | --- |
| journey | UC-C11 | script preset (.jsx) run from catalog executes in AE | PASS |
| journey | UC-C10 | .ffx preset run applies effect to selected AE layer | PASS |
| journey | UC-H02 / UC-J02 | preset journey: create via dialog → tile placed → run → reload → re-run | PASS |

合計: **PASS=3 / FAIL=0 / BLOCKED=0 / SKIP=0**（3 cases）

## AE 上で確認した最終効果

- UC-C11: catalog browser の Run で `dg-script-marker`（.jsx）を実行 → ExtendScript が `~/Library/Application Support/ty-plus/dg-presets/marker.txt` を書込（`script preset executed`）。
- UC-C10: catalog browser の Run で `dg-ffx-fadein`（.ffx）を実行 → 選択中 solid レイヤーの `Effects.numProperties` が 0→3。適用されたエフェクト: `ADBE Slider Control`（デュレーション）、`Pseudo/@@nkoVEkLBTQyeYNXsPyxv4g`（パーソナリティ）、`ADBE Geometry2`（(Transform)）。
- UC-H02: toolbar の Local Preset → `dialog-preset-add` で path/name 入力 → Create で `presets.json` に record 永続化（id `e7cd0a7c-…`）→ panel-1 に tile 自動配置（`workspace-1.json` gridCells 11→12）→ tile クリックで ExtendScript 実行（marker `…|26.5.3x9`）→ panel reload 後も tile 残存 → 再クリックで再実行（marker timestamp 更新）。managed root は snapshot→finally 復元で実行前状態に戻した（presets 2件 / cells 11 に復帰確認済み）。

## 製品不具合

なし（今回の範囲では新規の製品欠陥は検出されなかった）。

## ハーネス側の修正（製品不具合ではない）

- `run.ts`: `--managed-root` 未指定時の検出を「最新 AE install 優先」から「live panel の `app.version`（major→リリース年）に一致する install 優先」へ変更。AE 2026/2027 併存環境で誤った managed root（2027）を選び、永続化検査が別 root を読んでいた問題を修正。明示 `--managed-root` は従来通り優先。
- `cases/journey.ts`: 新規 suite。catalog browser の Run、toolbar→PathDialog の preset 作成、tile クリック実行、panel reload を CDP 経由で駆動。

## 環境メモ

- preset の削除は host `confirm()` モーダル（ExtendScript）を伴い CDP から完遂できないため、本ケースの後始末は managed root snapshot 復元で行った（最終状態は UI 削除と同等）。
- `app.project.activeItem = comp` の代入は evalScript 経由で結果を返さず失敗するため、comp の活性化は `comp.openInViewer()` で行う（`applyPresetFile` が要求する activeItem + selectedLayers の前提を満たす）。
- fixture script/preset は `Folder.userData`（`~/Library/Application Support`）配下 `ty-plus-e2e/` に配置。allowed roots（user-data）内のため `runScriptFile`/`applyPreset` が受理する。
