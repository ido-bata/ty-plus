# #343 Features「操作→状態→結果」説明 — 検証記録

対象: `apps/web/src/routes/features.tsx`（Features ページ再構成）。`PresetStage.tsx` は #342 の成果物として挙動を凍結し、利用側の最小変更のみ。
撮影: `apps/web/scripts/capture-screens.ts`（ページ全体）と `capture-preset-stage.ts`（PresetStage 状態遷移のリグレッション確認）。commit `05d465f1`、clean tree。

## 変更概要

### 構成（初見の読者が「何を・どう操作し・何が起きるか」を追える順）

1. **Hero / 導入**: ty-plus が After Effects 内ワークスペースにプリセット・ウィジェットを並べる製品であることを1段落で説明。
2. **Flagship（live demo）**: `PresetStage` を主役に据え、「登録プリセットやコード・映像素材が名前つきタイルになる」ことと「タイルと info surface は製品パネルと同じ部品で描かれる」ことを説明。操作の詳細はここでは繰り返さず次節へ譲る（コピー重複の解消）。
3. **INTERACTION「Inspect, select, apply」**: 操作→状態→結果の契約を copy rail で明示し、右に実製品キャプチャの **before/after ペア** を並置。
   - before: `preset-info-empty.png` — info widget が「No preset selected」を表示する空状態。
   - after: `preset-info-selected.png` — タイル選択後、同じ widget がプリセット名・種別・source「selection」を列挙する状態。
   - 2枚とも #322 の検証済み実製品キャプチャ（`docs/verification/web-redesign/review-322/product/`）からの領域 crop。新規の状態を捏造していない。
   - copy は hover/tap による inspect、⌘/Ctrl+click トグル、Shift+click 追加、プレーンクリック=実パネルでの適用、Web デモは適用 intent の注記のみ表示（AE 実行を偽装しない）を明記。
4. **Workspace モザイク**: `workspace-widgets.png` / `presets-dialog.png` / `add-widget.png` に figcaption を付与し、各画像の caption は「画像に実際に写っている内容」に限定。本文は結果先行のコピーに改め、「Widgets on demand」「Customizable appearance」を独立した span4 セルに分割して 12 カラム grammar とモザイクリズムを維持。
5. **Offline / CTA**: 従来どおり。

### 画像アセットの provenance

| 画像 | 出典 | 役割 |
|---|---|---|
| `preset-info-empty.png` (685×625) | review-322 `product-preset-tiles.png` の info widget 領域 crop | 選択前の空状態 |
| `preset-info-selected.png` (685×660) | review-322 `product-preset-selected.png` の info widget 領域 crop | 選択後の状態 |
| `workspace-widgets.png` / `presets-dialog.png` / `add-widget.png` | 既存の検証済み製品キャプチャ（#319/#309 系） | workspace・dialog の実物証拠 |
| `preset-grid.png` / `preset-selected.png` | 既存アセット | 本ページでは未使用に（og:image 等の他用途は維持） |

`FeatureShot` に optional `caption` prop を追加し `<figcaption>` を描画。alt は画像内容の記述に修正し、推測・未検証の状態を主張しない。

## 検証結果（commit `05d465f1`）

- `bun run typecheck:web` — pass
- `bunx biome check apps/web` — pass（`--write` で format 差分のみ自動修正済み）
- `bun run scripts/check/check-web-design.ts` — `ok (0 allowlisted, 0 new)`
- `bunx vitest run apps/web` — 4 files / 23 tests pass
- `cd apps/web && bun run build` — pass（prerender 6 pages、sitemap 生成まで完走）

## 証跡

### `pages/` — ページ全体（`page-*`）

- `/features` `/` を desktop 1440×900 / tablet 834×1112 / mobile 390×844 で全ページ + セクション分割 + mobile menu-open を撮影。`capture-meta.json` 同梱。

### `stage/` — PresetStage 状態遷移（`final-*`）

- `/` と `/features` × 3 viewport。desktop は initial/hover/multi/cleared/applied、coarse pointer は initial/tap-selected/tap-multi/tap-cleared。`data-mode`・`aria-pressed` 数・apply 注記有無を `capture-meta.json` に記録。#342 からの挙動凍結に対するリグレッションなし。

## VL モデルレビュー（`openrouter/nvidia/nemotron-3.5-super-vl:free`）と採否

| 指摘 | 判定 |
|---|---|
| before/after ペアが desktop/tablet で明確、caption 可読、重なり・欠けなし | **確認済み**。採用構造を支持 |
| mobile で2枚が縦積みになり「比較として弱い」 | **許容**。390px 幅での横並びは本文が判読不能になる。caption が状態を明示し、DOM 順も before→after で意味は保たれる |
| mobile sec-2 で2枚目が下端でクリップされているように見える | **誤検出（画素検証済み）**。sec-2 下端 200px に widget コンテンツは存在せず、非背景ピクセルは 4 カラムのみ（スクロールバー等の UI 残滓）。一様な暗色はページ背景であり、画像自体は完全描画されている |
| sec-2 上部で前セクションのイージングカーブが見切れている | **viewport 分割の artifact**。ページ自体のレイアウト不具合ではない |
| 実製品スクリーンショット内の小さな文字（widget 名・preset 名）は表示サイズで判読しにくい | **残存リスクとして #345 へ申し送り**。実製品の忠実な crop であり、拡大は画像加工になるため現状維持。caption と copy が状態を補完する設計で緩和 |
| ライブタイルが初見では抽象的に見える（タイル自体に名前が出ない） | **製品忠実性を優先**。タイルの glyph は実製品 `PresetTileButton` の描画であり、名称は hover/選択時の info surface が担う契約。製品外のラベル追加は fork になるため不採用 |

## 実製品キャプチャの再取得可否

- `scripts/verify/web-product-capture.ts` は稼働中の After Effects + dev extension の CEP/CDP ポートを必要とする。AE 2027 は起動しており `.debug` のポート一覧は確認できたが、panel1 (42573) 等の HTTP probe は応答せず（42593 のみ 404）、本タスクでは自律実行に至らなかった。
- 捏造・画像加工による代替は行わず、#322/#328/#337 の検証済みキャプチャを provenance 付きで再利用した。
- **残リスク（#345 最終ゲートへ）**: After Effects 実行結果（preset 適用後のコンポジション変化）を Features ページで直接示す画像は未掲載。実行経路はコピーと検証済み証跡で担保しているが、視覚的な「結果」提示は今後の課題。

## 既知の制約・申し送り

- `PresetStage.tsx` は無変更。`features.tsx` 側の利用も既存 props の範囲内。
- `preset-grid.png` / `preset-selected.png` は Features ページから外したが、ファイル自体と他参照（og:image 等）は残置。
- 新規画像2点は review-322 検証済みキャプチャの領域 crop であり、加工は crop のみ（リサイズ・合成なし）。
- stacked 関係: 本ブランチは `origin/342` 起点。PR #347（#342）が `release-0-12-0` へ merge 済みのため、PR #348 の base は `release-0-12-0` が正しい状態。
