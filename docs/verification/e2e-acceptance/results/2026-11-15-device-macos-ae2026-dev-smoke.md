# 2026-11-15 device-mac AE2026 dev smoke suite 実行記録

## 実行条件

- Host: ローカル Mac（macOS arm64 / After Effects 2026、`名称未設定プロジェクト` オープン状態）
- Build: dev bundle（Extension Id `app.ty-plus.dev.*`、`~/Library/Application Support/Adobe/CEP/extensions/app.ty-plus.dev`、2026-11-15 11:25 インストール済みビルド）
- Managed root: `/Applications/Adobe After Effects 2026/ty-plus`（`ty-plus-init.json` の supportRoot 通り）
- Suite: `smoke`（6 cases）、runner: `scripts/verify/e2e/run.ts`
- Panel 起動方法: System Events 経由で Window > エクステンション > ty-plus をクリック。CDP は `PlayerDebugMode=1`（`com.adobe.CSXS.9/11/12`）で 9170 番が listen
- 証跡 JSON: `macos-ae2026-dev/run.json`（capturedAt `2026-11-15T05:17:05Z`）

## 結果

| UC | ケース | 結果 |
| --- | --- | --- |
| UC-A03 | live surfaces boot with CEP bridge and extension origin | PASS |
| UC-H01 | ExtendScript host responds and host bundle contract is callable | PASS（`app.version` 応答、`jsx/ty-plus-host.jsx` evalFile 後に `getHostContext` contract 確認） |
| UC-A02 | persisted settings/layout/theme files exist and parse | PASS |
| UC-B04 | grid settings persisted value reaches panel CSS variables | **FAIL** — app.json `workspace.grid.cellSize=80` に対し theme.css は `--ty-ws-cell: 81px`、computed も 81px |
| UC-E02 | ui accent color persisted in app.json reaches theme.css tokens | **FAIL** — app.json `ui.accentColor="#12ab34"`（非デフォルト）だが theme.css に accent token なし、computed `--color-ty-accent` はデフォルト `#58a6ff` |
| UC-G01 | debug console surface aggregates logs and evaluates JS | PASS（StatusBar トグルで debug-console surface が live 化） |

合計: PASS=4 / FAIL=2 / BLOCKED=0 / SKIP=0

## FAIL の評価

UC-B04 / UC-E02 はテスト側の誤検出ではなく、**永続化ストア間の実乖離**であることをコードと live computed style の両面で確認した（Issue #112）。

- `applyUiSettingsTheme`（`src/management/setting/ui-theme-sync.ts`）は StyleSection の `commitUi` からのみ呼ばれ、ブート時の reconcile 経路がない。`ui.accentColor` が theme.css へ投影されない限り実行時に消費されない。
- grid は app.json `workspace.grid` が `state.grid` の権威（`hook.ts`）だが CSS 変数は theme.css 由来で、80 と 81px が併存している。

Windows AE2027 の smoke（6/6 PASS）は managed root が共有かつ accent がデフォルト値だったため、この乖離を踏まなかった。macOS 側の非デフォルト永続化データが不具合を顕在化させた形。

## 環境メモ

- AE は環境設定（disk cache 空き容量不足）の警告ダイアログと起動時モーダルを挟んだ。Escape / Return で解除後に通常起動。prefs リセット（`26.0`/`26.5` バックアップ取得済み）と `PlayerDebugMode=1` 設定を実施。
- disk cache 警告は空き容量不足が原因。検証継続にはディスクキャッシュサイズの引き下げか容量確保が望ましい。

## 備考

- この結果は smoke 範囲に限る。preset 実行など AE 側の最終効果を伴う UC は別 suite で実施する。
- UC-B04/UC-E02 の FAIL は Issue #112 として起票済み。修正後に本 suite を再実行して PASS 化を確認する。
