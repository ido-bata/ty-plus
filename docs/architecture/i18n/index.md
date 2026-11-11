# i18n

`architecture/i18n/` は、ty-plus の i18n ポリシーと命名規約の正規導線である。
ロケールファイルの **内容** はここには書かない — コンテンツは `src/management/i18n/locales/<locale>/*.json` が本体であり、このディレクトリはその翻訳ルールと翻訳の単一情報源を定義する。

## 構造

```text
i18n/
├─ index.md       # このファイル — 目次と読み順のみ
├─ policy.md      # 固有名詞ポリシー (英語ロックする語と言語別 canonical フォーム)
└─ key-naming.md  # キー / UI / 識別子の大文字小文字ルール
```

## 読む順番

1. [`policy.md`](policy.md) — 翻訳作業の出発点。固有名詞の英語ロックと per-locale canonical フォームを最初に確認する
2. [`key-naming.md`](key-naming.md) — i18n キー / UI 表示文字列 / コード識別子の各レイヤーで採用する大文字小文字ルール

## 固定スコープ

- サポート言語は `SUPPORTED_LOCALES` (`src/management/i18n/config.ts:6`) の 10 言語 (en / ja / de / fr / es / it / ko / pt / ru / zh) に固定する。新規言語の追加は別タスク。
- ロケールファイル以外のコードベースに英語以外を書いてはならない (ty-plus 実装ルール)。
- 翻訳内容の正本は **英語 (`en/`)** とする。`bun run scripts/check/check-i18n-locale-coverage.ts` が `en` を起点に各 locale のキー存在を機械的に検査する。
- 翻訳内容の品質 (canonical フォーム、TODO 残置、ハイブリッド表記) は `bun run scripts/check/check-i18n-locked-terms.ts` が `policy.md` のテーブルを enforce する。

## 翻訳作業のチェック順序

翻訳を追加・修正した locale ファイルは、以下の順で確認する:

1. `bun run scripts/check/check-i18n-locale-coverage.ts` — キーの存在
2. `bun run scripts/check/check-i18n-locked-terms.ts` — 固有名詞の canonical 一致
3. `bun run lint` — biome + design tokens + static guardrail + storage split + i18n coverage + locked terms が一括で走る

## 関連文書

- [`docs/architecture/runtime/ui-composition.md`](../runtime/ui-composition.md) — UI 表面 (panel / dialog / widget body) の構造
- [`docs/architecture/data/workspace-records/preset/types.md`](../data/workspace-records/preset/types.md) — プリセットのデータモデル。カタログ名と保存 `type` のマッピング
