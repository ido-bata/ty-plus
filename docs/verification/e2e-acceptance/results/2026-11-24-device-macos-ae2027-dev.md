# 2026-11-24 device-macos AE2027 dev 受入 suite 実行記録

## 実行条件

- Host: device-macos（macOS、After Effects 2027 `27.0x78`）
- Build: dev bundle（`release-0-13-0` @ `8f8ab650`（Merge pull request #579）、ExtensionBundleId `app.ty-plus.dev` / ExtensionBundleVersion `0.13.0`。#395 button migration・#397-#400 token/barrel 整理を含む）
- Extension dir: `~/Library/Application Support/Adobe/CEP/extensions/app.ty-plus.dev`（`bun run install:cep:dev` が作る dev bundle）
- Managed root: sandbox root（`/var/folders/.../ty-plus-e2e-sandbox/2026-11-24T*-35505/ty-plus`）。real managed root は `/Applications/Adobe After Effects 2027/ty-plus` で、`sandbox-integrity.json` が実行前 drift 1 件（`cache/layout-undo/panel-1/stack.json`）を修復し `cleanAfterRepair: true` を記録
- Suites: `smoke` / `host` / `debug` / `catalog` / `widgets` / `settings` / `resilience` / `journey` / `journeys` / `workspace`（Issue #108 の自動ケース群）
- 実行日時: 2026-11-24T11:41Z–12:09Z（20:41–21:09 JST）
- 証跡: 本ディレクトリ配下の `<suite>/run.json`（runner の全チェック結果）と `sandbox-integrity.json`

## 結果

| Suite | ケース | 結果 |
| --- | --- | --- |
| smoke | UC-A03 live surfaces boot / UC-H01 host contract / UC-A02 persisted files / UC-B04 grid CSS vars / UC-E02 accent → theme.css / UC-G01 debug console | PASS×5 / FAIL×1（UC-B04） |
| host | UC-A04 resident host contract getHostContext | PASS |
| debug | UC-G02 console reopen replay / UC-G03 operation worker verify | PASS×2 |
| catalog | UC-C15 missing preset asset detection | PASS |
| widgets | UC-D11 widget state restore after reload | PASS |
| settings | UC-E01 ui.language locale round-trip | PASS |
| resilience | UC-I01/I02/I04/I05/C16 corrupt file boot safety | PASS×5 |
| journey | UC-C11 .jsx preset run / UC-C10 .ffx preset run / UC-H02 preset journey | FAIL×3 |
| journeys | UC-J02-J07 preset/layout/appearance/recovery/handoff/daily-work | PASS×1（J07）/ FAIL×1（J04）/ BLOCKED×4（J02,J03,J05,J06） |
| workspace | UC-B02 add widget / UC-B05 snapshot round-trip / UC-D10 quick-actions / UC-C12 footage preset / UC-C14 failure notice | FAIL×3 / BLOCKED×2 |

合計: **PASS=16 / FAIL=8 / BLOCKED=6 / SKIP=0**（30 cases）

## FAIL / BLOCKED の詳細

### journey suite（UC-C10 / UC-C11 / UC-H02）— preset 実行が AE 側へ届かない

- UC-C11（.jsx script preset）: `marker=none` — preset 実行後に AE 側 marker が生成されない
- UC-C10（.ffx preset）: `effects 0→0: []` — 選択レイヤーへの effect 適用を確認できない
- UC-H02（preset journey 全体）: `presetId=none` — create → place → run → reload の流れで preset が作成・実行に至らない
- 対照的に journeys suite の UC-J07（quick-actions で script → ffx preset を連続実行）は PASS（`script marker + ffx effects=2`）で、preset 実行経路そのものは少なくとも一部で機能している。journey suite の失敗が製品不具合か harness/手順差かは未確定。

### journeys suite — dialog / settings 系で BLOCKED・FAIL

- UC-J02 / UC-J03 / UC-C12 / UC-C14: preset 作成 dialog の Create ボタンが `missing-or-disabled`、Add Widget ボタンが `missing:[data-ws-action="ty.ctx.add-widget"]` で BLOCKED
- UC-J05 / UC-J06: `settings dialog did not open` で BLOCKED
- UC-J04（appearance round-trip）: FAIL — accent/grid/locale の settings ファイル経由 round-trip が不成立
- settings dialog が開かない件は Issue #71（dialog-settings 起動時の Uncaught）および #243（settings dialog からの update.install relay）と関連する可能性があるが、本実行時点では両修正は未 landing（PR #540 / #544）。

### workspace suite — widget 追加・snapshot・quick-actions

- UC-B02: `widget=none cells 7→7` — Add Widget dialog からの tile 追加を確認できず
- UC-B05: `snapshot=1795521974189 cells 7` — snapshot save → mutate → restore の round-trip が不成立
- UC-D10: `quick-actions runs=2 marker=1795522065890|27.0x78` — 連続実行の marker 判定が不一致（UC-J07 は PASS で、suite 間で結果が分かれている）

### smoke UC-B04 — grid token convergence

- persisted された grid 設定が panel CSS variables へ収束しない FAIL。直前の 2026-11-15 Windows AE2027 / macOS AE2026 実機では PASS だった項目で、regression か AE2027/環境差かは未確定。

## 備考

- sandbox accent marker の判定を一度きりの sampling から poll（最大 20 秒）へ変更した `scripts/verify/e2e/sandbox.ts` の修正を含む（theme reconcile が Page.reload 後に非同期で accent を適用するため）。
- 本記録は dev build の探索的実行結果であり、FAIL/BLOCKED の切り分け（製品不具合 / harness / 環境差）は未完了。release 判定への影響は Issue #108 および release review で扱う。
