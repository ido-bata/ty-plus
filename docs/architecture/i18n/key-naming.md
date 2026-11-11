# キー / UI / 識別子の命名ルール

ty-plus の i18n には **3 つのレイヤー** があり、それぞれで大文字小文字ルールが異なる。
混在するとユーザー可視の表記揺れ・レビュー時の混乱・lint 警告の温床になるため、固定する。

## 1. レイヤー別のルール

### 1.1 i18n キー (`src/management/i18n/locales/<locale>/*.json` のキー)

- **camelCase** を採用する
- 例: `presetTool.animation.title`, `edit.fields.presetNamePlaceholder`, `layerCompLabel`
- 区切り文字はピリオドのみ (`.`)
- 数字から始まってはならない
- 1 つのリーフ (末端) キーは **文字列値** か **プリミティブ値**。オブジェクトを入れ子にしすぎない
- 既存キーのリネームは **破壊的変更** — 旧キーは新キー追加と同時に削除せず 1 リリース残す判断はプロジェクトメモリ `feedback-no-backward-compat` に反するため、**リネームと同時に旧キーを削除** する

### 1.2 UI 表示文字列 (i18n の **値**)

- **sentence case** を採用する (Title Case は使わない)
- 例: `Save preset` (Title Case の `Save Preset` ではない), `Add folder / group preset`
- 固有名詞 (1.3) のみ Title Case / PascalCase を許可する
- 文末のピリオドは **付けない** (UI のラベルに `Save.` のような表記はしない)
- 省略記号は U+2026 (`…`) を使う (ASCII `...` ではない)
- プレースホルダは i18next の `{{name}}` 形式を使う

### 1.3 固有名詞 (UI 文字列の中で)

- `policy.md` §1.1 / §1.2 に列挙された語は、その大文字小文字を **そのまま維持** する
  - 例: `Edit Anchor point` (sentence case だが `Anchor point` は Title の固有名詞として維持)
  - 例: `Apply Easing` (`Easing` は §1.2 の固有名詞)
- 固有名詞と一般語の境界は **半角スペース 1 つ** で区切る

### 1.4 コード識別子 (TypeScript / React)

- **kebab-case** を採用する
  - ファイル名: `anchor-point/index.ts`, `layout-lock/index.ts`, `layer-comp/Dialog.tsx`
  - フォルダ名: `function/widget/core/easing/`, `management/preset/catalog-add/`
- 識別子 (変数名 / 関数名 / 型名) は **camelCase** (TypeScript 慣習)
- クラス名 / React コンポーネント名は **PascalCase**
- 定数 (const enum 値、文字列リテラル enum) は **camelCase** ではなく **lowercase 文字列リテラル union** を採用する
  - 例: `type PresetType = "preset" | "script" | "plugin" | "footage"`
  - 例: `WIDGET_TYPES = ["quick-actions", "menu", "info", "easing", "align", "anchor-point", "directory-browser", "layout-lock", "font-viewer"]` の **要素** は kebab-case
- 文字列リテラル enum の **値** は保存形式 (on-disk JSON) と一致させる必要があるため、データモデル変更時に **破壊的変更** となる

## 2. 命名マップ早見表

| 概念 | コード識別子 (kebab/camel/Pascal) | i18n キー (camelCase) | UI 文字列 (sentence case) | 固有名詞 |
| --- | --- | --- | --- | --- |
| アンカーポイント widget | `anchor-point` (folder) / `anchorPoint` (key) | `widgets.anchorPoint.name` | `Anchor point` | §1.2 参照 |
| イージング widget | `easing` | `widgets.easing.name` | `Easing` | §1.2 参照 |
| レイアウトロック widget | `layout-lock` (folder) / `layoutLock` (key) | `widgets.layoutLock.name` | `Layout lock` | §1.2 参照 |
| プリセットタイプ (catalog) | `animation` / `code` / `layer-comp` / `footage` / `import` / `easing` | `presetTool.<type>.title` | `Animation Preset` / `Code Preset` / `Layer / Comp Preset` / `Footage Preset` / `Import Preset` / `Easing Preset` | — |
| PresetType enum 値 | `"preset"` / `"script"` / `"plugin"` / `"footage"` | — | — | — |
| プリセット編集ダイアログ | `edit` (folder) / `edit` (key prefix) | `presets:edit.*` | `Edit Preset` | — |
| グループ作成ダイアログ | `group` (folder) / `group` (key prefix) | `presets:group.*` | `Create preset group` | — |
| インポートプリセットダイアログ | `import` (folder) / `import` (key prefix) | `presets:presetTool.import.*` | `Import Preset` | — |

## 3. 命名ルールの機械的 enforce

| ルール | 検査 |
| --- | --- |
| i18n キーが camelCase | `bun run scripts/check/check-i18n-locale-coverage.ts` のキー列挙 (要追加) |
| UI 文字列が sentence case (Title Case 検出) | `bun run scripts/check/check-i18n-locked-terms.ts` (要追加) |
| 固有名詞 canonical 一致 | `bun run scripts/check/check-i18n-locked-terms.ts` |
| コードパス/ファイル名が kebab-case (重複チェック) | `bun run check:naming` (既存 — path/file redundancy) |

## 4. 例外

歴史的事情で英語が混在している箇所:

- `easing.presets.linear: "Linear"` — easing curve の名前は技術名として英語ロック (policy §1.1 相当)
- `directoryBrowser.anchors.userData: "User Data"` — AE 由来の英語名

これらは policy §1.1 に追加するか、本ファイル §1.3 の例外として明示的に扱う。
