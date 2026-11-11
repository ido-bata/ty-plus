# Issue #91 — editor.icon スタイル不安定・要素重なり (sprint scope)

> Closes #91
> Target release: `release-0-10-0`
> Target version: 0.10.0
> Status: Backlog → Ready → In Progress (本 branch で着手予定)

## 背景 (Issue #91 起票文より)
- `src/management/preset/editor/View.tsx` / `Code.tsx` 配下のアイコンエディタで、スタイルが不安定 / 要素が重なるとの報告が上がっている (未再現)。
- 具体的な状況の報告が無く、起票時点では以下を仮定。

## 想定スコープ (Issue 起票時点の仮)
- 想定箇所: `preset/editor/View.tsx` のツールバー、`Code.tsx` の monaco editor wrapping、もしくは `assets/preset/*.svg` 描画コンポーネント
- 仮説:
  - monaco editor のリサイズロジック (`Code-resize.test.ts`) と外部 preview の layout 競合
  - z-index 重複
  - PandaCSS 移行 (Issue #119) 後の class 漏れ

## 再現手順 (要記入)
1. preset icon エディタを開く (Code preset の icon 編集時など)
2. ブラウザ DevTools で layout / z-index を観測
3. 1) 画面のスクリーンショット、2) DevTools の Elements tree / Computed styles snapshot、3) 期待する出力との差分 を Issue コメントに共有

## 受け入れ条件 (要再現 → 修正後)
- 修正後、当該条件下でスタイル崩れ / 要素重なりが発生しない
- `bun run test -- management/preset/editor` が green
- `bun run ci` が green

## 完了条件 / クロージング方針
- 再現手順が 30 日以内に共有されない場合、本 Issue は Close する
- 修正は差分を最小化し、再現条件と回帰条件 (スクリーンショット / DevTools snapshot) を PR 本文に添付する

## 依存 / Target
- 依存なし。Target Version: 0.10.0。Priority: P3
- Area / Component: management / preset.editor

## 着手前の TODO
- [ ] Issue #91 コメントに再現手順が共有されるまで実装に着手しない
- [ ] 再現手順共有後、`bun run test -- management/preset/editor` を baseline として記録
- [ ] PandaCSS 移行 (Issue #119) 後に導入された class 漏れが無いか確認 (参考: PR #120)