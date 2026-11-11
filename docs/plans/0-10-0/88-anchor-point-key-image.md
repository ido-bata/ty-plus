# Issue #88 — widget.anchor-point キー画像カスタム (sprint scope)

> Closes #88
> Target release: `release-0-10-0`
> Target version: 0.10.0
> Status: Backlog → Ready → In Progress (本 branch で着手予定)

## 背景 (Issue #88 起票文より)
- `src/function/widget/core/anchor-point/Component.tsx:79-110` は 3x3 grid を CSS で `top` / `left` を計算描画しているのみで、ユーザーがキー画像をカスタマイズする経路が無い。
- 「整列 widget (alignment) 風」 という表現は `alignGesture` / `ALIGN_GESTURE_MAP` のような SVG overlay 描画とは別物。本 Issue は **anchor point ごとのキー画像 (SVG / PNG)** をユーザが差し替え可能にする機能要望。

## 要求確認事項 (実装着手前に必須)
1. anchor-position ごとに独立した画像か、全 9 ポジション共通 1 枚で十分か
2. 画像供給元 (preset と同様の catalog / AE のローカルファイル / SVG 文字列 / 標準プリセット群) のどれを期待しているか
3. alignment widget の `renderAlignGestureOverlay` (= 実行時の overlay) と混同していないか

## 想定スコープ (要求確定後)
- 9 ポジション共通の 1 画像を編集 / 9 ポジションそれぞれ独立編集 / preset と同様の catalog ベース の 3 つに分岐
- `function/widget/core/anchor-point/descriptor.ts` (現状 23 行) に画像メタデータ型を足すかは確認結果次第

## 受け入れ条件
- Issue コメントでユーザーの真の要求が確定する
- 要求確定後、対応する実装スコープを本ファイルに追記する
- `bun run ci` が green

## クロージング方針
- 30 日以内にユーザ要求が確定しない場合、本 Issue は Close する
- alignment widget のキー画像機能と区別が付かない場合、`alignment` 系の Issue (#89) と統合する

## 依存 / Target
- 依存なし。Target Version: 0.10.0 (要求次第)。Priority: P3
- Area / Component: function / widget.core.anchor-point