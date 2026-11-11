# Quality

`quality/` は、「今の状態で本当に実装できるか」と、販売前提の品質ゲートを定義する。

## ツリー

```text
quality/
├─ index.md
├─ implementation-readiness.md
├─ knip.md
├─ biome-overrides.md
├─ storage-violations-check.md
├─ verification.md
├─ workspace-class-hooks-check.md
└─ workspace-load-order.md
```

## 読む順番

1. [implementation-readiness.md](implementation-readiness.md) - 現在の repo が実装可能か、そのままでは危ない差分は何か
2. [verification.md](verification.md) - build / test / review の品質ゲート
3. [knip.md](knip.md) - 未使用コード検出（Knip）とクリーンアップ方針
4. [biome-overrides.md](biome-overrides.md) - `biome.json` の per-file relaxed zone 一覧と理由

## 境界

- `quality/` は readiness と verification を扱う。
- 実行経路は [`../runtime/index.md`](../runtime/index.md) に置く。
- 保存・クラウド・データの詳細はそれぞれの topic に置く。
