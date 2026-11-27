# web-product-capture 実機再検証 (Issue #322)

`scripts/verify/web-product-capture.ts` の実機キャプチャを AE2026 (26.5.3)
上の dev bundle (`app.ty-plus.dev`) で再実行し、#322 の未解決項目を検証した記録。

- 実行日: 2026-11-27
- 対象: After Effects 2026 / `app.ty-plus.dev` (cep-dev build)
- managed root: `/Applications/Adobe After Effects 2026/ty-plus`
- fixture: `web-product-capture.ts` の DEMO_LAYOUT (widget 8 + preset 10)

## 結果サマリ

| #322 項目 | 結果 |
| --- | --- |
| 1. hover → info widget | **製品は正常**。hover で info card が `mode="single"` / source `Hover` / preset title + basename を表示することを実機 DOM で確認。capture script の probe が生の `"hover"`/`"selection"` を case-sensitive に `includes` していたため常に false になっていたのが原因（実ラベルは i18n で `Hover`/`ホバー`、`Selection`/`選択`）。probe を locale 対応に修正（同 PR）。 |
| 2. Add Widget ダイアログ再撮影 | **成功**。`product-add-widget-dialog.png` は今回の実機実行で新規取得（#309 時点の流用ではない）。 |
| 3. Before/After .ffx 適用素材 | **適用自体は検証済み**（demo comp へ実 `.ffx` を適用し、ExtendScript の effect probe で `effects after run` の増加を確認、`preset application verified: true`）。ただし AE ビューポートの Before/After ペア画像は未取得のため、Issue の受入条件に従い `apps/web/public/images/` の素材としては**不使用**とする。 |

## 証跡

| ファイル | 内容 |
| --- | --- |
| `product-workspace-top.png` | fixture 適用後の workspace 上部（実機パネル全体） |
| `product-preset-tiles.png` | preset tile 10 面の描画（glyph は #700/#704 修正後の px-fit 描画） |
| `product-preset-hover.png` | **hover → info widget**: ポップイン tile への hover で info card が `Hover` source で preset 情報を表示した状態のスクリーンショット |
| `info-widget-verify.png` | hover / selection 検証中のパネル状態 |
| `product-preset-run.png` | 実 `.ffx` 適用後の状態（After 側のみ。Before ペアなし） |
| `product-preset-zone-2.png` | 下部 preset zone（info widget + font viewer） |
| `product-presets-dialog.png` | preset catalog ダイアログ |
| `product-add-widget-dialog.png` | **Add Widget ダイアログの実機再撮影** |

## 補足: 実機検証中に観測した harness 側の問題

- 高負荷時（load average ~30）に `Page.reload` 後のパネル boot が数分かかり、
  `reloadSurface` の 45–60s timeout を超過して CDP eval が連続 timeout した。
  ページ自体は生きており、負荷が下がると自然回復する（製品不具合ではない）。
- 上記のため本記録の hover/selection 検証は、capture script 全体の再実行ではなく
  fs.watch による live resync を利用した fixture 適用 + 個別 CDP 検証で実施した。
  script 側の timeout 余裕は別途検討の余地あり。
