# UI 債務の棚卸し（Issue #327）

**状態:** Active

## なぜこの文書があるか

Issue #327 の DirectoryBrowser 調査から、UI の不整合は DirectoryBrowser
固有の問題ではなく、**app 全体に共通する構造**だった。原因是4つ:

1. 抽出した component が本番へ着地せず、Storybook だけが持つ
2. 汎用 component が特定の domain の folder に置かれ、別 domain から参照される
3. 共有 primitive の写しが component として独立している
4. 静的検査が存在せず、再発不会被検出できない

この文書は (1)〜(3) の棚卸しであり、判定規則を明記する。

## 判定規則

### R1 story しか到達できない component

`bun run check:story-only` が列挙する。

| 本番に同じ概念の inline 実装があるか | 対処 |
| --- | --- |
| ある | **抽出を本番へ着地する**（inline 実装を削除し、抽出した component を使う） |
| ない | **削除する**（story も вместеに削除） |

「着地)是、抽出先が本来その概念の owner である場合に限る。owner が別にあれば
移動する（例: preset の行/タイルは `management/preset/` へ）。

### R2 汎用 component が domain folder に置かれている

概念が domain に属さない（汎用の layout / icon / control）なのに、
特定の domain の folder に置かれ、別 domain から参照されている。

| 参照元 domain 数 | 対処 |
| --- | --- |
| 2 以上 | **app-global（`packages/ui`）へ移動**する |
| 1 | その domain に閉じ込め、参照をrefsisting 側へ寄せる |

### R3 共有 primitive の写し

共有 primitive（`@ty-plus/ui`）に props を写しただけの component。
呼び出し側へ inline する。

## 棚卸し

### R1: story しか到達できない component（35 件 / 8 領域）— 全件解消

| 領域 | 件数 | 対象 | 対処 |
| --- | --- | --- | --- |
| `function/widget/utility/font-viewer` | 3 | `FontViewerBanners` / `FontViewerSampleRow` / `FontViewerStatusLine` | 着地 |
| `function/widget/utility/quick-actions` | 3 | `palette-dropdown` / `palette-search` / `row-components` | 着地 |
| `management/online/catalog` | 9 | `PresetLibrary*` / `PresetMarket*` | 削除 |
| `management/preset/catalog-add` | 5 | `FolderTabs` / `path-dialog/*` | 着地 |
| `management/preset/catalog-browser` | 1 | `PresetsDialogHeader` | 着地 |
| `management/preset/group` | 4 | `BaseIconCard` / `ConditionRulesSection` / `GroupMembersSection` / `GroupNameField` | 着地 |
| `management/preset/markdown` | 2 | `EditorLines` / `renderSegments` | 着地 |
| `management/preset/tool-shell` | 5 | `dialog/*Section` / `dialog/Fields` / `dialog/Footer` / `dialog/Form` | 着地 |
| `management/workspace/background` | 3 | `BackgroundPreview` / `LayerEditor` / `LayerListPanel` | 着地 |

着地したものは、生産側の inline 実装を削除して抽出側を本番で使い、story も本番と同じ component を描くようにした。

`management/online/catalog` は削除した。理由は2つ:

- その surface は **dormant** である（`docs/architecture/cloud/index.md`:
  「remote preset catalog (dormant; no backend in R0）」）。
- 9 つの component は**一度も本番へ接続されておらず**、同じ概念が
  `Dialog.tsx` に inline で残っていた。

なお、この 9 つの file は別の line（#193 で同じ surface ごと撤去された）でも
削除済みで、本 line には再導入されていた。

### R2: 汎用 component が domain folder に置かれている

| 現在の置き場所 | 汎用性 | 参照元 | 対処 |
| --- | --- | --- | --- |
| `management/workspace/surface/widget-grid-icons.tsx` の `SearchIcon` / `LockIcon` / `UnlockIcon` / `MenuIcon` | 汎用 icon（lucide に同名がある） | 3 widget | **共有 `Icon` + lucide へ置換**。残る `AlignIcon` / `TargetIcon` は widget grid 固有なのでこの置き場が正しい |
| `management/preset/tool-shell/archive-layout.tsx`（`AuthoringGrid` / `AuthoringField` / `AuthoringSection` / `AuthoringSegment`） | 汎用 layout | 10 ファイル（preset/group・modeless・authoring・preset dialog 4 種） | **preset domain の level へ**（`management/preset/authoring-layout.tsx`）。tool-shell は domain の中の1 feature にすぎない |

`AuthoringSegment` は共有 `SegmentedControl` と**同一の設計**（container / button /
selected / unselected がすべて同じ）だったため、共有側へ寄せた。

## 現状

- R1: **35 件すべて解消**。`scripts/check/story-only-allowlist.json` は空。
- R2: 2 件とも解消。置き場所は manifest (`sharedComponents`) に宣言済み。
- R3: 共有 primitive の書き写しは、`check:app-ui-design` が
  外観の上書き・deep import・raw control を検出する。

## 検査

| ゲート | 対応する規則 |
| --- | --- |
| `check:story-only` | R1 |
| `check:app-ui-design` | R3（raw control / raw SVG / 共有 control の外観上書き / deep import） |
| `check:ui-ownership` | R2（機能 UI の単一所有者、および汎用 component の置き場所） |

R2 は「宣言」が必要なため manifest に書く。manifest には必ず理由を書くと
ともに、宣言そのものがレビュー対象になる。

## 関連

- Issue #327 / PR #330
- `docs/architecture/widget-boundary.md` — 機能 UI の所有
- `docs/architecture/quality/ui-consistency-gates.md` — 静的ゲート
- ADR `docs/decisions/2026-09-10-directory-browser-kit.md` — 単一 kit の決定
