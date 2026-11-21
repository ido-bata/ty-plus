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

### R1: story しか到達できない component（35 件 / 8 領域）

| 領域 | 件数 | 対象 |
| --- | --- | --- |
| `function/widget/utility/font-viewer` | 3 | `FontViewerBanners` / `FontViewerSampleRow` / `FontViewerStatusLine` |
| `function/widget/utility/quick-actions` | 3 | `palette-dropdown` / `palette-search` / `row-components` |
| `management/online/catalog` | 9 | `PresetLibrary*` / `PresetMarket*` |
| `management/preset/catalog-add` | 5 | `FolderTabs` / `PathDialog*` |
| `management/preset/catalog-browser` | 1 | `PresetsDialogHeader` |
| `management/preset/group` | 4 | `BaseIconCard` / `ConditionRulesSection` / `GroupMembersSection` / `GroupNameField` |
| `management/preset/markdown` | 2 | `EditorLines` / `renderSegments` |
| `management/preset/tool-shell` | 5 | `Dialog*Section` / `DialogFields` / `DialogFooter` / `DialogForm` |
| `management/workspace/background` | 3 | `BackgroundPreview` / `LayerEditor` / `LayerListPanel` |

`management/online/catalog` は Issue #193 で.online 機能を撤去する計画が
あるため、**着地させず削除**が基本方針。

### R2: 汎用 component が domain folder に置かれている

| 現在の置き場所 | 汎用性 | 参照元 | 対処 |
| --- | --- | --- | --- |
| `management/workspace/surface/widget-grid-icons.tsx`（`SearchIcon` / `LockIcon` / `UnlockIcon` / `MenuIcon` / `AlignIcon` / `TargetIcon`） | 汎用 icon | 5 widget | app-global へ |
| `management/preset/tool-shell/archive-layout.tsx`（`AuthoringGrid` / `AuthoringField` / `AuthoringSection` / `AuthoringSegment`） | 汎用 layout | 3 preset dialog | app-global へ |

## 検査

| ゲート | 対応する規則 |
| --- | --- |
| `check:story-only` | R1 |
| `check:app-ui-design` | R3（raw control / raw SVG / 共有 control の外観上書き / deep import） |
| `check:ui-ownership` | R2 の一部（機能 UI の単一所有者） |

R2 の「汎用 component の置き場所」は、所有者の宣言（manifest）が必要です。
宣言された owner 之外的 module がその名前の component を定義 ,
または別 domain から参照している状態を検出する形になります。

## 関連

- Issue #327 / PR #330
- `docs/architecture/widget-boundary.md` — 機能 UI の所有
- `docs/architecture/quality/ui-consistency-gates.md` — 静的ゲート
- ADR `docs/decisions/2026-09-10-directory-browser-kit.md` — 単一 kit の決定
