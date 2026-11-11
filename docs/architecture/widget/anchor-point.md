# Anchor Point Widget

**状態:** Active

## 役割

`AnchorPointWidget` は選択中レイヤーの anchor point を After Effects
comp 上で再配置する。9-position (3×3) グリッドを `data-ws-action="anchor-point"`
と `data-anchor="<position>"` を持つ `<button>` セルとして描画し、クリック
で ExtendScript を CEP 経由で After Effects に評価させる。

## 公開エントリポイント

| 役割 | パス |
|------|------|
| 公開 API（WidgetType descriptor） | `src/function/widget/core/anchor-point/index.ts` |
| 位置 enum / バリデータ | `src/function/widget/core/anchor-point/script.ts` |
| ExtendScript テンプレート | `src/function/widget/core/anchor-point/script.ext.ts` |
| Component / React 実装 | `src/function/widget/core/anchor-point/Component.tsx` |
| Storybook | `src/function/widget/core/anchor-point/Component.stories.tsx` |
| 直接クリック回帰テスト | `src/function/widget/core/anchor-point/index.test.tsx` |

レジストリ追加は `src/function/widget/index.ts` を経由する。`kinds.ts` や
`registry.ts` から直接 import しないこと（[`docs/architecture/repository/source-ownership.md`](../repository/source-ownership.md) の境界規則に従う）。

## ドラッグジェスチャー

3×3 グリッドは素のクリックに加えて、alignment widget と同じ generic な
ドラッグジェスチャー (`useAnchorGesture`) を受け入れる。ジェスチャー API
の挙動（segment 計算、recognize threshold、modifier gate、pointer capture、
action / edge / drag-handle guard）は
`src/shared/component/interaction/use-anchor-gesture.ts` の冒頭コメントが正典
である。本ドキュメントでは widget 固有のマップと UX だけを扱う。

ジェスチャーは default で次の legacy alignment guard を有効にしている:

- `[data-ws-action]` 子孫（セル button）は `closest` で除外される。
  `Component.tsx` の `<button data-ws-action="anchor-point">` が該当し、
  cell click 経路はジェスチャーと独立して温存される。

align widget 側 (`function/widget/core/align/Component.tsx`) は同じ hook を
`resizeMargin: RESIZE_MARGIN` / `dragHandleMargin: DRAG_HANDLE_MARGIN` と
組合せ、外側 tile の resize / drag-handle 領域とジェスチャー候補領域を
排他する。anchor-point widget は固定サイズなので margin guard は渡さない。

### Stroke → Anchor マップ

`Component.tsx` 内 `ANCHOR_GESTURE_MAP` は hyphen-joined シーケンス（最長
3 セグメント）と単独方向の両方をサポートする。widget 内部のフォールバック
規則:

| Stroke shape | Anchor |
|--------------|--------|
| `left`, `left-left` | `center-left` |
| `right`, `right-right` | `center-right` |
| `top`, `top-top` | `top-center` |
| `bottom`, `bottom-bottom` | `bottom-center` |
| `left-right`, `right-left`, `top-bottom`, `bottom-top` | `center` |
| `left-top`, `top-left` | `top-left` |
| `right-top`, `top-right` | `top-right` |
| `left-bottom`, `bottom-left` | `bottom-left` |
| `right-bottom`, `bottom-right` | `bottom-right` |

シーケンスの最初のセグメントが stack overflow を起こした場合（4 方向目を追加
した瞬間）、`detectedSegments.shift()` で最も古いセグメントを追い出す。
これは alignment 側と同じ挙動。

### ジェスチャー overlay

`AnchorPointGestureOverlay` は hook の state を購読し、ドラッグ中に SVG
overlay を描画する。識別された anchor がラベルとして左上に表示される。
release で `setCurrentAnchor(pos)` と `runCep(buildAnchorScript(pos))` を
発行し、CEP evalScript 経由で After Effects にスクリプトが届く。

### 直接クリックとジェスチャーの排他

ジェスチャーが active な間は button の `onClick` をスキップする
（`gesture.isActive` ガード）。直接クリック経路は温存され、Vitest の
直接クリック回帰 (S159 / S955 fix) はそのまま通過する。

### 修飾キー

ジェスチャーは Ctrl / Meta / Shift を押した状態で開始されない。
**Alt は除外していない。** これは元の alignment 規約
（`isAlignGestureStart` in `management/workspace/events/handler.ts`）に
合わせるためで、Alt 併用時のジェスチャー挙動は元の alignment と同一
（Alt を押しながらでもジェスチャーが開始する）になる。

Issue #77 の背景として「Alt オーバーによる微調整ができない」が挙げられて
いるが、Alt 併用時の微調整挙動（例: 閾値を半分にする等）は**未実装**である。
具体的な UX 要件が Issue 本文から読み取れないため、本 PR では元の alignment
規約への追従のみを行い、Alt 専用挙動は別 Issue で扱う。

## スクリプト生成

`buildAnchorScript(position)` は `ANCHOR_SCRIPT_TEMPLATE` の `__POSITION__`
を埋めて ExtendScript を返す。テンプレート内で
`prop.dimensionsSeparated` を一時的に解除し、Position と Anchor Point の
両方を `valueAtTime` / `setValueAtKey` 系列でアニメーション安全な delta
修正として適用する。詳細は `script.ext.ts` のコメント参照。

## 検証

- `bun run test -- function/widget/core/anchor-point` — 直接クリック
  回帰（4 ケース）
- `bun run test -- shared/component/interaction` — ジェスチャー hook
  単独テスト（21 ケース）
- Storybook: `WidgetCore/AnchorPoint` に `Default`, `Large`,
  `GesturePreview` の 3 variant

CI フルゲート (`bun run ci`) は **親 coordinator が統合時に実行**。
本ドキュメントの read は commit pre-receive を経由する。
