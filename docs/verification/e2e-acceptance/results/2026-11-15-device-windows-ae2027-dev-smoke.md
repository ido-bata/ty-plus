# 2026-11-15 device-windows smoke suite 実行記録

## 実行条件

- Host: device-windows（Windows 11 / After Effects 2027 `27.0x78`、project `pv.aep` オープン状態）
- Build: dev bundle（Extension Id `app.ty-plus.dev.*`、ExtensionBundleVersion `0.10.1`、#104 self-heal 含む 2026-11-15 インストール済みビルド）
- Extension dir: `C:/Users/rebui/AppData/Roaming/Adobe/CEP/extensions/app.ty-plus`
- Managed root: `D:/4_apps/adobe/Adobe After Effects 2026/Support Files/ty-plus`（`ty-plus-init.json` の supportRoot 通り。AE 2026/2027 間で共有のユーザー設定領域）
- Suite: `smoke`（6 cases）、runner: `scripts/verify/e2e/run.ts`
- Panel 起動方法: ae-mcp bridge（127.0.0.1:7777）経由の `run_jsx` で `app.findMenuCommandId("ty-plus")` → `app.executeCommand(5116)`。手動の Window メニュー操作は不要だった

## 結果

| UC | ケース | 結果 |
| --- | --- | --- |
| UC-A03 | live surfaces boot with CEP bridge and extension origin | PASS |
| UC-H01 | ExtendScript host responds and host bundle contract is callable | PASS（`app.version=27.0x78`、host contract callable） |
| UC-A02 | persisted settings/layout/theme files exist and parse | PASS |
| UC-B04 | grid settings persisted value reaches panel CSS variables | PASS（cellSize=48 → `--ty-ws-cell: 48px`） |
| UC-E02 | ui accent color persisted in app.json reaches theme.css tokens | PASS（accent は default のため override 非生成が正しい状態であることを確認） |
| UC-G01 | debug console surface aggregates logs and evaluates JS | PASS（StatusBar トグルで Modeless surface が live 化） |

合計: PASS=6 / FAIL=0 / BLOCKED=0 / SKIP=0

## 証跡

- `2026-11-15-device-windows-ae2027-dev-smoke-run.json` — runner の全チェック結果
- `2026-11-15-device-windows-ae2027-dev-smoke-panel-1.png` — panel-1 のスクリーンショット

## 備考

- この結果は「パネル起動・bridge・永続化ファイル・grid/theme 収束・debug console 起動」の smoke 範囲に限る。preset 実行など AE 側の最終効果を伴う UC は別 suite で実施する。
- AE 2027 での初回相当の動作は既存 managed root（AE 2026 Support Files 配下）をそのまま利用しており、onboarding 未実施経路（UC-A01）は未検証のまま。
