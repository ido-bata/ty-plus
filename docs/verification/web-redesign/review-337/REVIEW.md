# #337 実画像ビジュアルレビュー記録

レビュー実施: `opencode/nemotron-3.5-super-vl-free`（OpenCode free tier の画像対応モデル）。codex は利用上限、claude は課金停止のため opencode 経路を採用。モデルの指摘は実装・DOM と照合して採否を判断した。

## ラウンド1（`final/`、SHA `855747c0` 時点のビルド）

### desktop LP（index + features 全ページ）

| 重要度 | 指摘 | 判定 |
|---|---|---|
| 高 | PresetStage が装飾に見える（タイルに名前がない） | **一部妥当**。タイルがグリフのみなのは製品の実UIどおりであり、ラベル追加は製品外観の改変になるため非採用。代わりに言語不整合・説明不足を修正 |
| 高 | 「文章＋横長画像」の反復 | **一部妥当**。案Bでモザイク・ステートメント帯を導入済みだが、Features の split 反復は残存。構造的許容範囲と判断し現状維持 |
| 中 | グリッド整合・CTA階層・タイポ階層 | 概ね許容（Button variant は一貫） |
| 低 | タイル色に意味がない | 製品グリフの実データ色。非採用 |

### mobile（index + features + menu-open）

| 重要度 | 指摘 | 判定 |
|---|---|---|
| 高 | メニュー展開時に背景が透ける | **実害確認・修正**。`surface.overlay`（白4%）を popover 背景に誤用 → `surface.dialog`（不透明）へ修正 |
| 高 | メニューに閉じるボタンがない | **非採用**。ハンバーガーボタンが `popoverTargetAction="toggle"` で開閉を兼ね、外側クリック/Esc の light dismiss も標準動作 |
| 中 | プリセットタイルのタップ領域が小さい | **誤検出**。実測タイルは約160px角で十分 |
| 中 | デモ画像がモバイルで読めない | 既知の制約として記録（実機キャプチャの縮小表示。拡大導線は将来検討） |
| 低 | 「スライドイン」等の日本語ラベル | **実害確認・修正**。デモプリセットタイトルを英語化 |

### tablet（index + features）

- 3列グリッドで10タイルの最終行が1枚余る（orphan）— 軽微、記録のみ
- スクリーンショットの縮小率 — 既知の制約

### 情報参照4ページ（desktop）

| 重要度 | 指摘 | 判定 |
|---|---|---|
| 中 | Download の3ステップに番号がない | **実害確認・修正**。preflight で `list-style:none` になっていた `s.steps` に `listStyleType:"decimal"` + マーカー温存のため block 表示へ |
| 中 | Changelog の箇条書きが1段落に連結され行が長い | **修正**。bullet 行を `<ul>` で個別レンダリング（`s.bulletList` 新設） |

### セクション単位（index sec-0〜3）

- ヒーロー情報密度・セクション間シルエット — 現状維持（案Bの意図的構成）
- 「Web demo」免責テキストのコントラスト — `text.muted` は免責表示として適切、維持

## 修正内容（`final2/` で再撮影・再レビュー）

1. `SiteHeader` menuPopover: `surface.overlay` → `surface.dialog`
2. `demo-presets.ts`: 全10タイトルを英語化（Fade In / Pop In / Slide In / Jump In / Spin In / Fade Out / Pop Out / Breathe Loop / Yo-yo Loop / Pop & Wobble）
3. `site.ts` `steps`: 番号復活（decimal + block + sibling margin）
4. `changelog.tsx`: bullet を `s.bulletList` でレンダリング
5. `index.tsx` ヒーロー: PresetStage 直下に操作説明キャプション追加

## ラウンド2（`final2/`）再評価結果

- メニュー背景: **解消**（不透明パネル。背後ページがカード外に見えるのは正常）
- デモ名英語化: **解消**
- ヒーローキャプション: **解消**
- 残存指摘: プロダクト実キャプチャ内の日本語UI（**正しい実機証拠であり非問題**）、選択枠の視認性（製品の実 selection 表現、維持）

## 残存リスク

- レビューモデルは free tier で精度に限界あり。最終的な人間の目視受入は依然として必要
- モバイルでの実機スクリーンショット可読性（別素材 or 拡大導線は将来検討）
- tablet でのタイル orphan 行（軽微）
