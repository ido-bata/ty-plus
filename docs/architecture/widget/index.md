# Widget 設計ドキュメント 索引

**状態:** Active

本ディレクトリは widget 単位で正典仕様を保持する。各ページは「最終状態」を
記述する。実装日誌・撤回した案はここに書かず、ADR（[`docs/decisions/`](../decisions/)）
側に置く。

## 個別 widget

- [`anchor-point.md`](anchor-point.md) — `AnchorPointWidget`。
  3×3 anchor 選択と alignment と同等のドラッグジェスチャー。

## 共有レイヤー

ジェスチャー API など widget 横断の primitive は `src/shared/component/`
配下に置く。所有関係は [`docs/architecture/repository/source-ownership.md`](../repository/source-ownership.md)
に従う。

## ADR

ジェスチャー全体の on/off 設定、ジェスチャー系の閾値変更などを変更する際
は ADR を残す。閾値の増減には [`docs/architecture/quality/implementation-readiness.md`](../quality/implementation-readiness.md)
の運用に従う。

## Storybook / 検証

widget の検証経路は `bun run storybook`（widget 単位の UI 確認）と
`bun run test -- <widget>`（Vitest）。CI フルゲート `bun run ci` は
親 coordinator のタイミングで実行される。
