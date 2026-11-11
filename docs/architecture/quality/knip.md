# Knip（未使用コード検出）

## 目的

[Knip](https://knip.dev) で未使用ファイル・未使用 export・依存関係の食い違いを定期的に可視化し、リファクタの優先度付けに使う。

## 実行

```bash
bun run knip
```

設定はリポジトリ直下の `knip.json`。

## 設定の意図（現状）

- **2026-08-20 に narrow 化済み** — 次の 3 段階を区別する。
  1. **vendor / generated / build-output** — `src/management/ae/cep/vendor/**`、
     `src/management/ae/jsx/**`、
     `src/management/preset/jsx-presets.ts`。
     これらは owner を持たない（または build 中間生成物）ので検出対象外。
  2. **scripts/ 外の補助エントリ** — `scripts/cep/cep-uninstall.ts`、
     `scripts/demo/markdown-editor/vite.config.ts`、
     `scripts/lib/cep-bundle.ts`。
     デモ・運用補助スクリプトで product graph に組込まない。
  3. **toolchain-internal dependencies** — `@babel/plugin-transform-class-properties` 等 5 件と
     `@rollup/pluginutils`。いずれもビルドツール設定の文字列としてのみ参照され、
     TypeScript の import グラフには乗らないため knip には誤って unused と見える。
     個別 named export ignore ではなく dependencies として handling。
- **依存解決用のエントリ補強** — `package.json` のスクリプトに加え、CEP の実起動点
  （`src/management/ae/cep/entry/*.tsx`）と rust protocol のコード生成器 2 件、
  IPC transport 2 件を `entry` に明示し、`src/function/**` への到達を補強している。
- **Vitest / Vite** — `vitest.config.ts` とルート `vite.config.ts` は Knip が自動検出するため、`entry` には重複登録しない。
- **`ignoreUnresolved` を撤廃** — 境界違反（`management -> function` 等）の
  unresolved import signal は `bun run check:boundaries` に委ねる。knip 側で黙殺
  しない。
- **`ignoreIssues` を撤廃** — `src/**`、`scripts/**`、`tools/**`、`*.ts` に対する
  `exports` / `types` / `duplicates` の全集約 ignore を解消。検出能力を回復。

## レポートの読み方

- **Unused files** — 動的 import やビルド専用エントリで偽陽性があり得る。削除前に import 経路を確認する。
- **Unused exports** — public API surface に意図的に公開している型・定数も多い。機械的な一括削除はしない。
- **Unused dependencies** — UI ライブラリや Zod 等は Vite / バンドル経由で検出漏れしうる。`ignoreDependencies` に列挙した toolchain 文字列は実利用されている。
- **Exit code 0** — `--no-exit-code` フラグ付きで CI に組み込まれている。レポートの目視確認を優先する。

## 既知の追跡事項（2026-08-20 narrow 化で露出）

このセクションは narrow 化で knip が報告しはじめた残件一覧。`07dfd785 config(quality): narrow knip ignore surface and declare @volar/typescript` で broad ignore を解いた結果として可視化された。

| 種別 | 件数 | 対応方針 |
|---|---:|---|
| Unused files | 0 | **2026-08-23 解消**: rust runtime cutover と widget/state/storage retire (`d29d7ca5` 等) で残骸が既に消滅。knip 出力にこのカテゴリ自体が現れない。 |
| Unused exports | 166 | public API surface を含む。caller 確認の上で `internal` / `private` 化または削除。 |
| Unused exported types | 68 | 多くが contract types で意図的露出。ADR 2026-08-20 で段階解消計画を記載。 |
| Duplicate exports | 0 | **2026-08-23 解消**: `src/management/catalog/json-files.ts` の deprecated alias 4 件 (`readGroupCatalogJson` / `writeGroupCatalogJson` / `readWidgetCatalogJson` / `writeWidgetCatalogJson`) を、最後の caller `workspace/persistence/store.ts` 側の canonical name 化と alias 削除で 0 に。|

## 次のクリーンアップ（フェーズ）

1. ~~残った unused files をルーティング経路で突き合わせ、死蔵なら削除、遅延読み込みなら Knip の `entry` または動的 import 注釈で整理。~~ **2026-08-23 解消**: rust runtime cutover (`d29d7ca5` 等) で残骸は既に除去済み。knip 出力にこのカテゴリ自体が現れない。
2. ~~**Duplicate exports** — `src/management/catalog/json-files.ts` の deprecated alias を caller 置換後に削除。~~ **2026-08-23 完了**。
3. ~~**Deprecated alias sweep** — `src/management/preset/{edit/Dialog.tsx, catalog-browser/ListDialog.tsx, group-catalog.ts}` 及び `src/management/workspace/persistence/store.ts` を `readGroupJson` 系の canonical name に揃える。~~ **2026-08-23 完了**（うち 3 ファイルは過去の commit で完了済み、`store.ts` 残 1 ファイルを本セッションで完了）。
4. **契約型の絞り込み** — public API として保持する型を ADR で確定し、残りは export を取り下げる。166 unused exports + 68 unused exported types の優先順位は contract-types セクションに集約。
5. **未使用 devDependencies** — `@babel/*` 5 件と `@rollup/pluginutils` を toolchain の依存として残すか、plugin 内部に取り込んで外すかを `@babel` 経由の build script 群で決定する。
6. 依存関係はカテゴリ単位の PR で削減し、都度ビルド・手動 smoke を確認する。
