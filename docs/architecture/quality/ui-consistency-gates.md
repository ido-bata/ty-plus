# UI 一貫性の静的ゲート（Issue #327）

**状態:** Active

## 目的

DirectoryBrowser を調査した結果、UI の不整合は次の4つの構造に起因することが
分かった。

1. app-global な共有コンポーネント（`packages/ui`）を使う検査が存在しない
2. 抽出したコンポーネントが本番へ接続されず、Storybook だけが持つ
3. 機能 UI の所有者が散文でしか規定されていない
4. 共有 package の barrel が不完全で、deep import が常態化していた

本書は、その再発を**静的解析で固定する**仕組みの正本である。4つのゲートが
それぞれ上記の根本原因に対応する。

## 根本原因と対応ゲート

| # | 根本原因 | ゲート |
| --- | --- | --- |
| R1 | app-global primitive を使う検査が存在しない（`check-web-design.ts` は `apps/web/src` のみ対象） | `check:app-ui-design` |
| R2 | 抽出（extract）したコンポーネントが本番へ接続されず、Storybook だけが持つ | `check:story-only` |
| R3 | 機能 UI の所有者が散文でしか規定されておらず、機械的に検証できない | `check:ui-ownership` |
| R4 | 共有 package の barrel が不完全で、deep import が常態化していた | `check:app-ui-design` の `deep-import` / `barrel-gap` 規則 |

## ゲート詳細

### 1. `check:app-ui-design`

`scripts/check/check-app-ui-design.ts`。CEP アプリ（`src/**`）を
`packages/ui`（`@ty-plus/ui`）の契約へ拘束する。

| 規則 | 内容 |
| --- | --- |
| `raw-control` | raw `<button>` / `<input>` / `<select>` / `<textarea>` を禁止 |
| `raw-svg` | 手書き `<svg>` を禁止（`Icon` + lucide を使う） |
| `ui-override` | 共有コンポーネントの `className` / `css` に**外観**プロパティを渡すことを禁止 |
| `deep-import` | `@ty-plus/ui/<subpath>` の deep import を禁止（barrel を使う） |
| `inline-style` | `style={{...}}` による**外観**指定を禁止（runtime の位置指定と CSS custom property は許可） |
| `barrel-gap` | `packages/ui` の public component が barrel から export されていない状態を禁止 |

`packages/ui` 自身は契約の実装なので対象外。

既存違反は `scripts/check/app-ui-design-allowlist.json` に 1 違反 1 エントリで
退避する。エントリが違反しなくなった場合は stale として失敗し、allowlist は
shrink でしかできない。新規違反は常に失敗する。

allowlist を再生成する:

```sh
bun run check:app-ui-design -- --write-baseline
```

### 2. `check:story-only`

`scripts/check/check-story-only-code.ts`。Storybook の story からのみ到達できる
`.tsx` コンポーネントを検出する。

knip は storybook plugin によって `*.stories.tsx` を **entry point** として扱うため、
story しか使わないコードは knip から見ると「使用済み」であり、dead code の信号が
構造的に消える。このゲートはその穴を埋める。

判定は import graph の到達可能性で行う。**何も import されていないファイルは
entry point とみなす**（app は manifest / config 経由で結線するため）。その entry
point から到達できないファイルが story-only である。この定義は
`BrowserHeader` ⇄ `BrowserToolbar` のような相互参照も正しく扱う（どちらも
entry point を持たないため story-only）。

allowlist は `scripts/check/story-only-allowlist.json`。理由の記載が必須である
（「後で考える」は理由ではなく、可視化すべき負債である）。

```sh
bun run check:story-only -- --write-baseline
```

### 3. `check:ui-ownership`

`scripts/check/check-ui-ownership.ts`。機能 UI の所有者を強制する。

正本は `docs/architecture/widget-boundary.owners.json`
（`docs/architecture/widget-boundary.md` の所有表の機械可読化）。
規則:

- `owner-missing` — 所有者モジュールが存在しない、または feature 名を export しない
- `duplicate-owner` — owner とは別の layer が `<Feature>*` 名を export する

widget 記述子 `DirectoryBrowserWidget` は widget 自身の type 名なので許可する。

さらに manifest の `sharedComponents` は、**複数 feature が使うが単一 domain に
属する component** の置き場所を宣言する（例: authoring の layout kit は preset
domain のもの）。規則:

- `shared-owner-missing` — 宣言された owner module が存在しない、または
  component を export しない
- `shared-duplicate` — 別の module が同名 component を**定義**している
  （barrel が re-export しているだけのは別）
- `shared-bypass-import` — owner にも owner の public barrel でもない module から
  import している（owner の内側へ手を伸ばしている）

宣言は人が判断する部分なので、manifest に書くこと自体がレビュー対象になる。

## なぜ検査を「ディレクトリ単位」にしないのか

`scripts/check/check-settings-ui-primitives.ts` は
`src/management/setting/dialog/sections/` だけを対象にしている。検査の対象は
「契約違反そのもの」であって「契約の守られた directory」ではない。検査範囲を
ディレクトリで区切ると、その外側に出た時点で無検査になる。`check-web-design.ts`
が `apps/web/src` だけを対象にしていたため、CEP アプリ（`src/**`）は共有 UI 契約
から外れていた。

## 既存違反の消化

各ゲートは baseline（allowlist）を持ち、既存違反を退避する。新規違反だけを
fail するため、ゲート導入と違反解消を同じ PR で完了させる必要がない。
allowlist の各エントリには理由が必要で、減らせないまま残すことはできない。

## 関連

- ADR `docs/decisions/2026-09-10-directory-browser-kit.md` — 単一 kit の決定
- `docs/architecture/widget-boundary.md` — 機能 UI の所有
- `docs/architecture/ui-reconstruction/04-component-system.md` — primitive 一覧


## focus 表示の統一

focus の表示は、共有 token `--color-focus-ring`（accent 2px の ring）が唯一の
定義です。すべての focus 可能 control はこの ring を描画します。text 系は
さらに border を `interactive.focus` に塗り替えます（field 自身にも focus が出る）。

`check:app-ui-design` がこれを強制します:

- `focus-ring-missing` — focus 規則が ring を描画していない
- `focus-ring-divergent` — canonical 以外の ring を描画している
- `unknown-css-var` — 解決できない CSS 変数を参照している（fallback 付き、
  あるいは同じ file が inline で設定する custom property は可）
- `duplicate-style-recipe` — 同じ待遇（色・border・タイポグラフィ）を 2 箇所以上で
  書き写していないこと。layout だけの組み合わせは対象外
