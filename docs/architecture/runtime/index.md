# Runtime

`runtime/` は、ty-plus がどのように起動し、AE / CEP / ExtendScript の境界を越え、workspace surface を表示するかを定義する。

## ツリー

```text
runtime/
├─ index.md
├─ entrypoints.md
├─ host-boundary.md
├─ ui-composition.md
├─ workspace-surfaces.md
├─ type-driven-surfaces.md
├─ operation-worker.md
├─ thumbnails.md
├─ debug-console.md
└─ cep-ime.md
```

## 読む順番

1. [entrypoints.md](entrypoints.md) - build / panel / dialog / bootstrap の入口
2. [host-boundary.md](host-boundary.md) - AE / CEP / ExtendScript / file access の境界
3. [ui-composition.md](ui-composition.md) - panel / dialog / widget / shared component の全体図
4. [workspace-surfaces.md](workspace-surfaces.md) - panel / dialog / widget / settings / licensing / onboarding
5. [type-driven-surfaces.md](type-driven-surfaces.md) - `type` が storage / dialog / panel / execution をどうつなぐか
6. [operation-worker.md](operation-worker.md) - 1 operation ごとの Rust worker、CEP Node の起動・wire・cancel 境界
7. [debug-console.md](debug-console.md) - debug console の capture / broadcast / セッション境界
8. [cep-ime.md](cep-ime.md) - Adobe-CEP #349 IME composition への回避策と helper の配置

## 境界

- `runtime/` は実行経路と UI surface を扱う。
- Rust の product operation は [`operation-worker.md`](operation-worker.md) の一回限りの
  worker process として扱う。ここでいう `runtime` は CEP / UI の実行文脈を含む一般語で
  あり、常駐 Rust process を意味しない。
- 保存 tree は [`../storage/index.md`](../storage/index.md) に置く。
- online/offline と Supabase は [`../cloud/index.md`](../cloud/index.md) に置く。
- データ型の定義元は [`../data/index.md`](../data/index.md) に置く。
