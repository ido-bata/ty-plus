# Issue #89 — widget.alignment キー画像カスタム (sprint scope)

> Closes #89
> Target release: `release-0-10-0`
> Target version: 0.10.0
> Status: Backlog → Ready → In Progress (本 branch で着手予定)

## 背景 (Issue #89 起票文より)
- `src/management/workspace/events/handler.ts:432-495` の alignment widget `alignGesture` / `renderAlignGestureOverlay` は実行時の overlay を SVG path で描画する。
- ユーザ独自のキー画像を alignment 関連 UI に乗せたいという要求が想定される。
- alignment widget の **widget 本体が存在するか** から確認が必要:
  - `src/function/widget/core/alignment/Component.tsx` 等の存在有無
  - ユーザが画像と思っているものが 1) ジェスチャー overlay の色変更、2) align widget 内のサブアイコン、3) preset の icon (`PresetIcon`) のどれか

## 要求確認事項 (実装着手前に必須)
1. ユーザが「キー画像」と呼ぶ対象が 1) ジェスチャー overlay の色変更、2) align widget 内のサブアイコン、3) preset の icon (`PresetIcon`) のどれに該当するか
2. alignment widget 本体 (`src/function/widget/core/alignment/Component.tsx` 等) が存在するか
3. anchor-point widget (Issue #88) と独立した機能か、共通基盤を持つ統合版が望ましいか

## 想定スコープ (要求確定後)
- alignment widget 本体の有無確認 → 存在しなければ「alignment overlay 描画差し替え」スコープに限定
- 画像供給元 (preset catalog / AE ローカル / SVG 文字列) は anchor-point (Issue #88) と整合させる

## 受け入れ条件
- Issue コメントでユーザーの真の要求が確定する
- 要求確定後、対応する実装スコープを本ファイルに追記する
- `bun run ci` が green

## クロージング方針
- 30 日以内にユーザ要求が確定しない場合、本 Issue は Close する
- 要求対象外 (anchor-point widget のキー画像機能と区別が付かない) と判断された場合、Issue #88 と統合する

## 依存 / Target
- 依存: Issue #88 と同期して確認 (要求確定が片方だけだとスコープが揺れる)。Target Version: 0.10.0 (要求次第)。Priority: P3
- Area / Component: function / widget.core.alignment (要確認)