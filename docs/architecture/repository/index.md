# Repository

`repository/` は、この repo の物理構造と所有境界を定義する。

## ツリー

```text
repository/
├─ index.md
├─ layout.md          # repo physical structure: src/, rust/, scripts/
├─ source-ownership.md # TypeScript and Rust responsibility boundaries
└─ materials.md       # archive/, reference/, docs/no-use/, docs/plans/ handling
```

## 境界

- `repository/` は repo の地図だけを扱う。
- 現行物理配置は [layout.md](layout.md) を正とする。
- TypeScript と Rust の所有境界は [source-ownership.md](source-ownership.md) を正とする。
- 実行経路は [`../runtime/index.md`](../runtime/index.md) に置く。
- 保存構造は [`../storage/index.md`](../storage/index.md) に置く。
- データ型の正は [`../data/index.md`](../data/index.md) に置く。
