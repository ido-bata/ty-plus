# 2026-11-15 device-windows AE2027 dev 受入 suite 実行記録（拡張 suite）

## 実行条件

- Host: device-windows（Windows 11 Home / build 29708（DisplayVersion: Dev）/ x64、After Effects 2027 `27.0x78`、project `pv.aep` オープン状態）
- Build: dev bundle（`release-0-10-2` @ `96009f955a51f6c1743dd4022cdcdced51869b3c`、ExtensionBundleId `app.ty-plus.dev` / ExtensionBundleVersion `0.10.1`。#106 theme write serialization・#107 host self-heal を含む）
- Extension dir: `C:/Users/rebui/AppData/Roaming/Adobe/CEP/extensions/app.ty-plus.dev`（`bun run install:cep:dev` が作る junction → `D:\ty-plus\dist\cep-dev`）
- Managed root: `D:/4_apps/adobe/Adobe After Effects 2027/Support Files/ty-plus`（実行中 AE 2027 の `ty-plus-init.json` supportRoot 配下）
- Suites: `smoke` / `host` / `debug` / `catalog` / `widgets` / `settings` / `resilience`（Issue #108 の自動ケース群、PR #115 以降）
- ビルド手順: `bun install --frozen-lockfile --ignore-scripts` → `bunx panda codegen` / `bunx panda cssgen` → `bun run build:cep:dev`（ExtendScript host + Vite CEP bundle + Rust operation worker release build）→ `bun run install:cep:dev`。toolchain は bun 1.4.4 / rustc 1.100.0
- Panel 起動: dev bundle 導入後に AE 2027 を再起動し、ae-mcp bridge（127.0.0.1:7777）経由の `run_jsx` で `app.findMenuCommandId("ty-plus")` → `app.executeCommand(5116)`。panel-1 の dev port は 9170
- 実行日時: 2026-11-15T12:01Z–12:03Z（21:01–21:03 JST）
- 証跡: 本ディレクトリ配下の `<suite>/run.json`（runner の全チェック結果）

## 結果

| Suite | UC | ケース | 結果 |
| --- | --- | --- | --- |
| smoke | UC-A03 | live surfaces boot with CEP bridge and extension origin | PASS |
| smoke | UC-H01 | ExtendScript host responds and host bundle contract is callable | PASS |
| smoke | UC-A02 | persisted settings/layout/theme files exist and parse | PASS |
| smoke | UC-B04 | grid settings persisted value reaches panel CSS variables | PASS |
| smoke | UC-E02 | ui accent color persisted in app.json reaches theme.css tokens | PASS |
| smoke | UC-G01 | debug console surface aggregates logs and evaluates JS | PASS |
| host | UC-A04 | resident host contract answers getHostContext with app context | PASS |
| debug | UC-G02 | debug console reopen replays previously logged messages | FAIL |
| debug | UC-G03 | operation worker verify: spawn → accept → result → exit | PASS |
| catalog | UC-C15 | preset with missing asset: record survives boot, host verify reports missing | PASS |
| widgets | UC-D11 | easing widget state file restores mode/loopCount after reload | BLOCKED |
| settings | UC-E01 | ui.language in app.json drives panel locale across reload | BLOCKED |
| resilience | UC-I01 | corrupt workspaces/workspace-1.json: banner shown, bytes preserved | BLOCKED |
| resilience | UC-I02 | corrupt widgets/widgets.json: boots, bytes preserved（UC-D12 alias） | PASS |
| resilience | UC-I04 | corrupt styles/theme.css: defaults fallback, file preserved or repaired | BLOCKED |
| resilience | UC-I05 | corrupt settings/app.json: defaults fallback, bytes preserved | PASS |
| resilience | UC-C16 | corrupt presets/presets.json: boots, records preserved | PASS |

合計: **PASS=12 / FAIL=1 / BLOCKED=4 / SKIP=0**（17 cases）

内訳（suite 別）: smoke 6/0/0/0、host 1/0/0/0、debug 1/1/0/0、catalog 1/0/0/0、widgets 0/0/1/0、settings 0/0/1/0、resilience 3/0/2/0（PASS/FAIL/BLOCKED/SKIP）

## FAIL / BLOCKED の詳細

### UC-G02（debug）自動FAIL — debug console surface を閉じられない

- open と marker 表示までは PASS（`msgs=31` / `marker=true`）。失敗したチェックは `debug console closes: still live` のみ。
- ケースが実行する close（CDP `Page.close`）の後、debug-console surface（port 9185）の target が 10 秒以内に消えず、reopen へ進めない。
- 同一 harness での macOS 実機（2026-11-15 / AE2026）は 17/17 PASS。Windows 固有の挙動差であり、harness が使う close 手段と surface 側の close 処理のどちらに起因するかは未確定（Issue 化は未実施）。
- なお本実行の debug suite は UC-G02 を 3 回連続で FAIL、UC-G03（operation worker verify）は毎回 PASS。

### UC-D11 / UC-E01 / UC-I01 / UC-I04（widgets / settings / resilience）BLOCKED — managed root の snapshot/restore が Windows で EPERM

- 4 ケースとも destructive case の復元（`ctx.restoreManagedRoot` = `rm(managedRoot)` + `cp(snapshot, managedRoot)`）で例外になり BLOCKED。
  - UC-D11 / UC-E01 / UC-I01: `EPERM: operation not permitted, rm 'D:/4_apps/adobe/Adobe After Effects 2027/Support Files/ty-plus'`
  - UC-I04: `EPERM: operation not permitted, copyfile '...\cache\layout-undo\panel-1\stack.json' -> '...ty-plus\cache\layout-undo\panel-1\stack.json'`
- 原因: live panel が managed root を監視・書き戻ししている最中に復元が走るため、Windows のファイルロックで `rm` / `copyfile` が EPERM になる。macOS 実機では同じ harness で全ケース PASS。
- 影響: 復元失敗時はケース判定が無効になるうえ、実行環境（ユーザーデータ）が壊れる。初回実行では UC-C15 の復元失敗に連鎖して managed root 全体が失われたため、runner 自身が出力した snapshot（`%TEMP%\ty-plus-e2e-snapshots`）から復旧した。以降の実行は destructive suite ごとに外部バックアップから managed root を復元した上で実施し、最終状態は実行前と同一（43 files）に戻してある。
- 判定: harness の Windows 互換性の不具合であり製品不具合ではない（Issue 化は未実施）。

## 環境準備（managed root）

- AE 2027 の managed root は onboarding 直後の最小状態（`settings/app.json` は `core.paths` と `workspace.onboardingPaths` のみ）で、UC-B04 / UC-E02 が前提とする永続値（`workspace.grid.cellSize`、`ui.accentColor`）が存在せず、この状態では両ケースが評価できない。
- 受入前に、製品と同じ永続化形式（`settings/app.json`）で既定値を明示した `workspace.grid`（cellSize 48 / gap 4 / radius 2）と `ui`（language ja / theme system / accentColor #5886ff / textColor #f0f0f0 / widget / panel）を書き込んだ。見た目は既定値のまま（パネルの既定 accent token は #58a6ff）。
- 既定 accent では theme.css に override が出ないため、theme 書き込み経路（#106 / #112）は別途確認した。`ui.accentColor` を一時的に `#3d7eff` にして panel-1 を再起動すると `styles/theme.css` に `--color-ty-accent: #3d7eff`（と `--accent-r` / `--accent-g`）が書き出され、computed style も同値になる。確認後に既定値へ戻し、override が theme.css から消えることまで確認済み。

## 備考

- `bun run build:cep:dev` は Windows で問題なく完了した（Rust operation worker の release build を含む）。`bun install --ignore-scripts` のみでは PandaCSS の `styled-system/` が生成されず `build:cep` が `styled-system/styles.css` 解決で失敗するため、`bunx panda codegen` / `bunx panda cssgen` の実行が必要。
- 旧 dev bundle（`app.ty-plus` フォルダ。dev Extension Id を持つ旧ビルド）は新 dev bundle と ExtensionBundleId が重複するため、CEP extensions ディレクトリ外（`C:\Users\rebui\typlus-verify\bundle-backup\app.ty-plus-pre-0.10.2-dev`）へ退避した。CEP extensions 配下には `app.ty-plus.dev` のみ残している。
- harness の `--managed-root` は存在確認がなく、誤ったパスを渡すとそのディレクトリを `rm -rf` する。引用符漏れで `D:/4_apps/adobe/Adobe`（Adobe 共通設定）を対象にした実行が 1 回あり、runner 自身の snapshot から復元したうえでファイル数 5,381・合計 1,368,726,468 byte が snapshot と一致することを確認済み。managed root パスの事前検証の追加を推奨。
- 証跡ファイル: `smoke/smoke-panel-1.png`（panel-1 スクリーンショット）、`debug/uc-g03-operation-worker.json`（operation worker verify の生データ）。
- この記録は「パネル起動・host bridge・永続化ファイル・grid/theme 収束・debug console・operation worker・locale・破損耐性・preset stale 検出」の範囲。preset/`.ffx` 実行など AE 側の最終効果を伴う UC は引き続き未実施。
