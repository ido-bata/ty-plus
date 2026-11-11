# Storage

`storage/` は、support root、workspace tree、preset asset の所在と、
その永続化方法を定義する。

## 正規の定義元

- session root の型と managed root の選択は
  `rust/crates/storage/src/root.rs` で定義する。
- managed root 相対パスの検証は
  `rust/crates/storage/src/path.rs` で定義する。
- React 側の storage 要求は
  `src/management/storage/runtime-gateway.ts` を経由して runtime boundary を越える。
- 既存のデータ所有、path key、移行期の I/O は
  `src/management/storage/` 配下に残る。root contract と現行の I/O 利用の
  区別は [workspace-tree.md](workspace-tree.md) を読む。

## ツリー

```text
storage/
├─ index.md
├─ workspace-tree.md
├─ preset-assets.md
└─ ownership-map.md
```

## 読む順番

1. [workspace-tree.md](workspace-tree.md) — locator、managed root、data/assets tree
2. [preset-assets.md](preset-assets.md) — preset のメタデータと asset の保存
3. [ownership-map.md](ownership-map.md) — どのデータ群がどのファイルに属するか

## 境界

- `storage/` は永続化のみを扱う。panel / dialog / widget の UI 関心は、
  それを所有する operation system に属する。
- Cloud / Supabase は [`../cloud/index.md`](../cloud/index.md) にある。
- スキーマ定義は、それを所有するモジュール配下の data contract にある。
- Online / account / licensing は `src/management/online/` であり、`cloud/` という source root ではない。
