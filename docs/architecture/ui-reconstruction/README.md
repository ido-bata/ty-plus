# UI Reconstruction

この directory は UI 再構築の記録と、現在も有効な UI 契約文書を置く。

## 位置づけ

- `01-inventory.md` 〜 `07-feature-catalog.md` は **完了済みの移行計画の記録** である。`src/js` レガシー UI から `src/management` の React shell への再構築は完了しており、これらの文書は当時の設計判断と移行順を保存する historical record として扱う。実装の現状は各正本（`product-model.md`、`runtime/`、`data/`）を参照すること。本文は英語で書かれているが、翻訳は行わずこの位置づけで保持する。
- `storybook.md` と `error-boundary.md` は **現在有効な運用文書** である。Storybook の構成・品質検査層（`src/storybook/quality/`、`docs/architecture/quality/ui-render-contract.md`）と ErrorBoundary 縮退マトリクスの正本として更新を続ける。

## 読む順番

1. 現行の操作モデルは [`../product-model.md`](../product-model.md) を正とする
2. UI 描画の品質契約は [`../quality/ui-render-contract.md`](../quality/ui-render-contract.md) を正とする
3. Storybook 基盤は [storybook.md](storybook.md) を参照する
4. 移行当時の設計判断を辿る場合のみ `01` 〜 `07` を参照する

## Boundary

- `01` 〜 `07` を現在の実装指示として使わない。`src/js` は存在せず、legacy path への新規参照を追加しない。
- 新規の UI 設計判断は `product-model.md` と `quality/` 配下へ記録する。

