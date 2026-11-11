# Preset Types

`Preset` record `type` フィールドと `data.*` サブフラグ、`param`/`data` 配下の意味を定義する。

## Canonical `PresetType` enum

`PresetType` は `src/management/preset/contract.ts:227` で以下のように固定される 4 値 union である:

```typescript
type PresetType = "preset" | "script" | "plugin" | "footage";
```

これは **永続化される正本** であり、`presets/presets.json` の各レコードの `type` フィールドはこの 4 値のいずれかである。値の変更は破壊的データ移行を伴うため、追加・削減は **別タスク** として扱う。

## Type の意味

| type | 用途 | `data.*` サブフラグ |
| --- | --- | --- |
| `"preset"` | AE 標準プリセット (`.ffx`)、イージングプリセット、アニメーションプリセットなど、AE ネイティブのプリセット表現 | `data.easing?: BezierControlPoints` (easing の場合) |
| `"script"` | ExtendScript (`.jsx` / `.js`) として保存・実行されるプリセット (Code preset, Layer/Comp preset) | `data.layerCompKind?: "layer" \| "comp"` (Layer/Comp の場合) |
| `"plugin"` | AE プラグイン / 効果識別子として host 経由で適用されるプリペット (将来用。現行コードの layer-comp/operation.ts は誤って `definePresetOperation("plugin", ...)` を登録しているが、保存は `type: "script"` で行われており、本ドキュメントは保存形式を正とする。`docs/plans/2026-06-07-terminology-audit-followup.md` 参照) | (予約のみ) |
| `"footage"` | フッテージ / インポートプリセット (実ファイルまたはインポート戦略) | `data.footageImportMode?: "import" \| "replace" \| "proxy"`<br/>`data.importStrategy?: "select" \| "auto"` |

## カタログ名 → 保存 `type` のマッピング

UI 上で露出するカタログ名 (feature 名) と永続化される `type` 値、`data.*` サブフラグ、実装フォルダの対応表。
カタログ名と `type` は **別軸** であり、カタログ名は UI feature 名として翻訳可能、`type` は on-disk 互換性のため英語固定。

| カタログ名 (UI) | `type` 値 | `data.*` サブフラグ | 実装フォルダ | 備考 |
| --- | --- | --- | --- | --- |
| Animation preset | `"preset"` | (なし) | `src/function/preset/animation/` | `.ffx` を AE 機能として保存 |
| Code preset | `"script"` | (なし) | `src/function/preset/code/` | ExtendScript を保存し `host.runScriptFile` で実行 |
| Layer / Comp preset | `"script"` | `data.layerCompKind: "layer" \| "comp"` | `src/function/preset/layer-comp/` | `layerCompKind` で layer/comp を区別 |
| Footage preset | `"footage"` | `data.footageImportMode` | `src/function/preset/footage/` | 実ファイルを AE に footage として取り込み |
| Import preset | `"footage"` | `data.importStrategy` | `src/management/preset/import/` (shell 経由) | footage プリセットと同じ実行経路を共有 |
| Easing preset | `"preset"` | `data.easing: [n1, n2, n3, n4]` (cubic-bezier 4 値) | `src/function/widget/core/easing/` (shell 経由) | animation preset と同じ `type: "preset"` を共有 |
| Group preset | (group 専用) | (なし) | `src/management/preset/group/` | グループ実体は `presets/groups.json` 側に保存。プリセットではない |

> **削除済みカタログ**: Text style preset は deprecated となり、`src/function/widget/utility/font-viewer/text-style-preset-dialog.tsx` を削除済み。

## 命名ルール

- カタログ名 (UI feature 名) は **sentence case** で表記する: `Animation preset`, `Code preset`
  - 例外: ユーザー可視のダイアログタイトル (`presetTool.<catalog>.title`) は compound noun として Title Case を許容する: `Animation Preset`, `Code Preset`
- 固有名詞 (`Easing`, `Comp`, `Footage` 等) の扱いは [`docs/architecture/i18n/policy.md`](../../../i18n/policy.md) §1.1 / §1.2 を参照

## データ移行の方針

- カタログ名を追加・削減する場合、本ドキュメントのマッピング表を先に更新する
- `type` enum の値を追加・削減する場合、`src/management/preset/contract.ts:227` の修正 + on-disk マイグレーション + `presets.json` レコード全件再分類 + `getPresetOperation` ディスパッチ表の更新を **同時に** 行う
- 既存レコードの `type` 値は変えない (プロジェクトメモリ `feedback-no-backward-compat` により、shim なしの破壊的変更のみ許可)

## 関連ファイル

- `src/management/preset/contract.ts:227` — `PresetType` 型定義
- `src/function/preset/operation-contract.ts:42` — `getPresetOperation` ディスパッチ
- `src/function/preset/layer-comp/Dialog.tsx:147-170` — Layer/Comp プリセットの保存ロジック (`persistOverride`)
- `src/function/preset/layer-comp/operation.ts` — Layer/Comp の `definePresetOperation("plugin", ...)` 登録 (潜在バグ、R-1 参照)
- `docs/plans/2026-06-07-terminology-audit-followup.md` — R-1 を含む関連 follow-up タスク
