# UI render quality contract（Storybook 実DOM検査）

- Status: Active（Issue #194、v0.11.0 system-quality 再構成）
- 上位契約: [`docs/architecture/product-model.md`](../product-model.md) §4.3「描画品質の検査」
- 関連: #166 残件（操作状態 story 展開）、#192（component DOM 再構築、本契約の検査対象）

## 原則

**Storybook の screenshot capture 成功は視覚品質の合格を意味しない。**
合格は「実 DOM の寸法・overflow・重なり・操作状態を assertion が確認した」
ことに限る。pixel 差分（reg-suit 等）の導入は計画 §8 の別評価であり、
本契約は構造・操作状態の機械検査を優先する。

## 検査層の構成

`src/storybook/quality/` が共有 vocabulary を提供する。

| 層 | 実装 | 実行 project |
| --- | --- | --- |
| 純粋幾何 | `layout.ts` の `LayoutBox` / `boxesOverlap` / `boxWithin` / `overlapArea` / `boxHasArea` | `unit`（`layout.test.ts`） |
| DOM adapter | `measureBox` / `isRendered` / `assertWithinViewport` / `assertWithinAncestor` / `assertNotClipped` / `assertNoOverlap` / `assertRendered` | `storybook` browser project のみ |
| 複合監査 | `auditCanvas` / `expectCanvasLayout` | 同上 |
| 操作 settle | `hoverAndAssert` / `focusAndAssert` / `nextPaint` | 同上 |
| 描画 fit（#726） | `fit.ts` の `expectContainerWidthTracking` / `assertMatchesWidth` / `assertSingleRow` / `assertIconAspect` / `assertScrollbarThumbVisible` | 同上 |
| 状態別 border（#726） | `border.ts` の `assertBorderToken`（`resolveBorderToken` probe 経由） | 同上 |
| negative 証明 | `captureLayoutError` + `contract.stories.tsx` | 同上 |

### `expectCanvasLayout(root, options)` が検査するもの

`root`（通常は story の `canvasElement`）配下の全 interactive 要素
（`INTERACTIVE_SELECTOR`: button / input / select / textarea / 各種 ARIA role）
について:

1. **viewport 逸脱**: 描画済み要素の border box が viewport（capture pin の
   1280×720）をはみ出さない。ただし scroll 可能な祖先（`overflow:auto|scroll`）
   配下の要素は、その祖先が overflow を所有するため除外する。
2. **hidden-overflow clip**: `overflow:hidden|clip` の祖先に切り取られない。
   これが product-model §4.3 の「popover は `overflow:hidden` 祖先と競合しない」
   の機械検査に相当する。`text-overflow:ellipsis` による意図的打ち切りと
   scroll 祖先は除外する。
3. **ページ横 overflow**: `documentElement.scrollWidth > clientWidth` を
   検出（既定 `"x"`。`"y"`/`"both"`/`false` で変更可）。

`requireRenderedSelector` で「存在すべき」要素を追加指定できる
（例: group header の toggle button）。

失敗は `LayoutAssertionError` を投げ、story test が fail する。
**capture metadata の `status: ok` はこの検査を代替しない。**

## 適用状況（本 PR 時点）

操作単位（product-model §2）に対応する代表 story へ適用済み。
網羅ではなく契約の幅を優先し、#192 の component 再構築後も同じ helper で
再検証する。

| 操作単位 | story（抜粋） | 検査内容 |
| --- | --- | --- |
| preset 配置（workspace tile） | `Preset/Workspace/Tile` | 初期/missing/long-label の layout 契約 |
| preset 一覧/カタログ | `CatalogPresetIconTile`, `catalog-browser/view-mode-toggle` | hover、long title、`aria-pressed` selected |
| アイコン編集 | `Preset/Components/IconEditor` | 全 variant の control 配置 |
| ディレクトリブラウズ | `DirectoryBrowserIconCard`, `BrowserSearchField`, `FilterToggleButton`, `CollapsibleGroupHeader`, `DirectoryBrowserViewModeToggle` | hover/selected/focus、empty (ZeroCount)、long label |
| preset 登録 dialog | `Shared/Shell/DialogBody`, `dialog/shell/Layout` | dialog bounds、footer、overflow scroll |
| preset tool dialog（実構成） | `Preset/Dialog/{Footage,LayerComp,Animation}` | `ToolDialog` shell + `renderForm` 複数 section の組み合わせ、shell が frame 内、Create/Cancel footer |
| preset icon editor | `Preset/Icon/Editor` `NarrowContainer`/`WideContainer` | preview tile が container 幅に依らず 6rem 正方形（#587 型） |
| preset list row / tile | `Preset/Components/PresetListRow`, `PresetIconTile` | glyph が title より左・非ゼロ box、tile 内に icon 収まり（#582 型） |
| widget | `WidgetCore/Easing`, `anchor-point`, `layout-lock`, `menu` | 初期状態、drag 前後の契約、mode strip が curve/bounce/elastic のみ（#581 型） |
| 共通 controls | `Button`, `SegmentedControl`, `Input`, `SearchField`, `PathField`, `Textarea`, `ListSelect` | hover/focus/click-selected + 開いた listbox の clip 検査 |
| error 状態 | `Shared/Feedback/ErrorBoundary` | fallback render の layout 契約 |

既存の #146/#166 interaction play（hover/focus/drag）は変更せず、
前後に `expectCanvasLayout` を追加する形で操作状態でも契約が成立する
ことを保証した。

## 機械判定可能な条件 vs 人間受入

機械判定（自動・fail する）:

- 実 DOM の寸法・bounds（viewport / 祖先 / page overflow）
- `overflow:hidden|clip` 祖先による不可視 clip
- 要素間の正の重なり面積
- hover（`:hover` + computed style 変化）/ focus（`:focus`/`:focus-visible` +
  `document.activeElement`）/ selected（`aria-pressed`/`aria-selected` または
  computed style 差）/ drag（gesture 前後の canvas/状態差分）
- long string・empty state・error state の render 成立

人間受入（機械化しない・別途目視）:

- 配色・余白・タイポグラフィの美的品質
- capture PNG の最終目視レビュー（gallery）
- pixel 差分による回帰（導入は別途評価、計画 §8）

## negative 検証（独立した強制の証拠）

`src/storybook/quality/contract.stories.tsx` は検査自身の拒否能力を示す:

- `HealthyCard`: 正常 layout を全 assertion が受理する（受理側の証拠）
- `ClippedOverflow` / `ViewportEscape` / `OverlappingControls`:
  意図的に壊した fixture に対し `captureLayoutError` が
  `LayoutAssertionError` を返すことを assert する。検査が盲目化
  （例: bounds 計算の常時 true 化）すればこれらの story が fail する。
- `InteractiveStates`: hover/focus/ARIA selected の参照実装。

geometry 層は `layout.test.ts`（unit project）で境界値を固定する。

## 描画結果契約（Issue #726）

#721–#724 / #730–#736 / #741 の退行は全て「共有スタイル/トークンを使って
いる」ことを品質とみなした結果、最終描画結果の契約違反を検出できな
かった。`fit.ts` はその層の共有 vocabulary で、computed style ではなく
**実測値**（`getBoundingClientRect` / `clientWidth` / `scrollHeight`）を
assert する。CEF99 は container query 非対応（#700）のため、全て px 実測。

| 契約 | helper | consumer 例 |
| --- | --- | --- |
| コンテナ幅追従 | `expectContainerWidthTracking` + `assertMatchesWidth` | `SearchField/TracksContainerWidth`, `QuickActions/ActionList/SearchFieldTracksWidgetWidth` |
| strip 単一行 | `assertSingleRow` | `SegmentedControl/AdaptiveLabels`, `OverflowScrollsHorizontally` |
| 状態別 border token | `assertBorderToken` | `Button/AllVariants`, `SegmentedControl/HoveredSegment`, `Input/Focused`（focus→`interactive.focus`） |
| アイコン比率 | `assertIconAspect` | `Icon/KeepsAspectRatio` |
| scroll affordance | `assertScrollbarThumbVisible` | `ScrollArea/Default` |

機械判定できない境界（helper の doc comment にも明記）: アイコンの
グリフ品質・ストロークの見た目、`scrollbar-color` を解釈しない環境での
thumb 描画、ラベル内容の「読みやすさ」（幾何と文字列差し替えは検査するが
可読性は人間受入）。

## 既知の限界

- audit は interactive 要素とページ overflow が対象。非 interactive な
  重なり（テキスト同士）は拾わない — 必要なら story 側で granular
  `assertNoOverlap`/`assertWithinAncestor` を使う。
- `overflow:scroll|auto` 祖先配下の要素は viewport 検査を skip する
  （scroll が意図的 clipping のため）。scroll 内 clip の異常は個別 assert で補う。
- viewport は capture pin（1280×720）前提。複数 viewport の検査は
  `parameters.viewport` を変えた story で個別に行う（今回は未整備、
  #166 残件の判断事項）。
- `retina（deviceScaleFactor>1）` の見た目確認は #166 残件として未判断。
- #192 の component DOM 再構築で selector/ARIA が変わった場合、
  helper は変更不要だが story の querySelector は追従が必要。
