# UI 不整合の分類（Issue #327）

**状態:** Active

## なぜこの文書があるか

DirectoryBrowser の調査から見つかった不整合は widget 固有ではなかった。アプリ全体
に共通する構造で、しかも**どれも静的に検出できるもの**だった。この文書はその分類と、
現時点の到達点、未了のものを記録する。

判定の原則は同じ:

- **他で使うなら** → 意味の分かる名前と債務を持ち、どこに置いても通用する
- **他で使わないなら** → パスで説明するコンテンツとして置く（component 化しない）

## 分類と到達点

| # | 種類 | 検出 | 到達点 |
| --- | --- | --- | --- |
| 1 | **focus 表示の分裂** — 4 形態（2px 外側 ring / 1px 内側 ring / border のみ / 壊れている） | `focus-ring-missing` / `focus-ring-divergent` | **済**。`--color-focus-ring` に一元化 |
| 2 | **未定義 CSS 変数** — 存在しない token を参照（描画されない focus ring を含む） | `unknown-css-var` | **済**（37 箇所を修正） |
| 3 | **raw なフォーム control** — 手書きの select / checkbox / input / range | `raw-control` | **済**（8 箇所を共有 primitive へ） |
| 4 | **同じ待遇の重複** — 同じ見た目が複数の file に書き写されている | `duplicate-style-recipe` | **一部**（共有語彙へ移行中） |
| 5 | **同じ component の再実装** — 汎用 control が feature の folder に置きっぱなし | `check:ui-ownership` の `sharedComponents` | **済**（view toggle / authoring layout） |
| 6 | **raw な `<button>`** — 共有 Button/IconButton ではなく手書き | `raw-control` | **未了**（production に 62 件、baseline 退避） |
| 7 | **px リテラル** — 260(px) ではなく `1px` のような直接値 | — | **未了**（225 件、1px が 216） |
| 8 | **raw な色リテラル** — token ではなく hex / rgba | `check-design-tokens` は cep-shell のみ | **未了**（73 件） |
| 9 | **z-index リテラル** — 層順序の語彙が無い | — | **未了**（39 件、150 / 100000 / 2147483647 が混在） |
| 10 | **preset dialog 4 種のクローン** — 同じダイアログが 4 つ | `duplicate-style-recipe` | **未了**（最大の未了項目） |
| 11 | **i18n を通さない UI テキスト** — JSX に直書きの英語 | — | **未了**（31 箇所。加えて共有 kit の選択数サマリが英語のまま-owner が文言を渡せない） |

## 4 について: 同じ待遇の重複

「同じ見た目を 2 箇所以上で書き写す」のは、共有 design system にその語彙が無い
か、共有語彙が有明显でない状態のどちらかである。検出は「`css()` の
(property, value) 集合が 2 箇所以上で一致すること」で行う。

layout だけの組み合わせ（display / flexDirection / gap …）は外見の identity を
定めていないので対象外とする。外観を持つもの（色・border・タイポグラフィ・
boxShadow）だけが対象。

共有語彙は `packages/ui/src/styles/` に置く。型処理（section label / row label） は
`packages/ui/src/styles/typography.ts` にある。

## 10 について: preset dialog のクローン

`function/preset/{animation,code,layer-comp}/Dialog.tsx` は、同じダイアログを
3 つ書いている。14 個の待遇が dialog をまたいで重複しており、うち section label は
2 つのサイズ（10px と 12px）で書かれている。

正しい姿は「preset dialog の共通 chrome を 1 箇所に持ち、各 dialog は自分の
内容だけを持つ」こと。これは本 Issue の次の段になる。

## 静的解析での担保

| ゲート | 規則 | 対象 |
| --- | --- | --- |
| `check:app-ui-design` | `raw-control` / `raw-svg` | raw な control と手書き icon |
| | `ui-override` | 共有 component の外観上書き |
| | `deep-import` | barrel を経由しない import |
| | `inline-style` | 外観の inline style |
| | `focus-ring-missing` / `focus-ring-divergent` | focus 表示の分裂 |
| | `unknown-css-var` | 解決できない CSS 変数 |
| | `duplicate-style-recipe` | 同じ待遇の重複 |
| | `barrel-gap` | barrel から漏れている public component |
| `check:story-only` | — | story しか到達できない component |
| `check:ui-ownership` | `owner-missing` / `duplicate-owner` | 機能 UI の所有者 |
| | `shared-owner-missing` / `shared-duplicate` / `shared-bypass-import` | 汎用 component の置き場所 |

既存違反は baseline（allowlist）に退避する。エントリには「何をすれば消えるか」を
理由として必ず書く。エントリが違反しなくなった場合は stale として失敗するので、
baseline は shrink しかできない。新規違反は常に失敗する。

## 関連

- Issue #327 / PR #330
- `docs/architecture/quality/ui-consistency-gates.md` — ゲートの一覧
- `docs/architecture/quality/ui-debt-inventory.md` — 抽出が着地しなかった component の棚卸し
- `docs/architecture/widget-boundary.md` — 機能 UI の所有
