# Architecture

`architecture/` は、ty-plus を実装するための正規の設計導線である。
「何のために読むか」で分類し、上から下へ降りたときに実装判断まで辿ける構造だけを残す。

## 構造

```text
architecture/
├─ index.md
├─ AGENTS.md
├─ project.md
├─ repository/
│  ├─ index.md
│  ├─ layout.md      (legacy — historical physical layout)
│  ├─ source-ownership.md
│  └─ materials.md
├─ agent-operations.md
├─ runtime/
│  ├─ index.md
│  ├─ entrypoints.md
│  ├─ host-boundary.md
│  ├─ ui-composition.md
│  ├─ workspace-surfaces.md
│  ├─ type-driven-surfaces.md
│  ├─ operation-worker.md
│  ├─ thumbnails.md
│  └─ cep-ime.md
├─ ui-reconstruction/
│  ├─ README.md
│  ├─ 01-inventory.md
│  ├─ 02-target-architecture.md
│  ├─ 03-surface-design.md
│  ├─ 04-component-system.md
│  ├─ 05-state-and-host-contracts.md
│  ├─ 06-migration-execution-plan.md
│  └─ 07-feature-catalog.md
├─ storage/
│  ├─ index.md
│  ├─ workspace-tree.md
│  └─ preset-assets.md
├─ cloud/
│  ├─ index.md
│  ├─ connectivity.md
│  ├─ supabase.md
│  └─ media-surface.md
├─ data/
│  ├─ index.md
│  ├─ contracts.md
│  ├─ contracts-module-layout.md
│  ├─ local-storage-contracts.md
│  ├─ runtime-state.md
│  ├─ workspace-path-contracts.md
│  └─ workspace-records/
│     ├─ index.md
│     ├─ common/
│     │  └─ index.md
│     ├─ workspace/
│     │  ├─ layout.md
│     │  └─ appearance.md
│     ├─ preset/
│     │  ├─ index.md
│     │  └─ types.md
│     ├─ widget/
│     │  ├─ index.md
│     │  └─ types.md
│     ├─ group/
│     │  ├─ index.md
│     │  ├─ types.md
│     │  ├─ folder-sync.md
│     │  └─ matchers.md
│     └─ icon/
│        ├─ index.md
│        └─ rules.md
└─ quality/
   ├─ index.md
   ├─ implementation-readiness.md
   └─ verification.md
└─ i18n/
   ├─ index.md
   ├─ policy.md
   └─ key-naming.md
```

## 読む順番

1. [`project.md`](project.md) - プロジェクト定義と固定スコープ
2. [`repository/index.md`](repository/index.md) - repo 全体の地図
3. [`repository/source-ownership.md`](repository/source-ownership.md) - TypeScript `src/` と Rust `rust/` の所有境界
4. [`runtime/index.md`](runtime/index.md) - 実行経路、ホスト境界、workspace surface
5. [`ui-reconstruction/README.md`](ui-reconstruction/README.md) - React/Tailwind UI 再構築の設計と移行順
6. [`storage/index.md`](storage/index.md) - 保存 tree と preset asset
7. [`cloud/index.md`](cloud/index.md) - online/offline、Supabase、media surface
8. [`data/index.md`](data/index.md) - 型定義の所在と使用元
9. [`quality/index.md`](quality/index.md) - 実装可能性判断と品質ゲート
10. [`i18n/index.md`](i18n/index.md) - i18n ポリシーと命名規約
11. [`AGENTS.md`](AGENTS.md) - AI エージェント向けの読み方
12. [`agent-operations.md`](agent-operations.md) - 並行実行、復旧、release workflow

## 固定スコープ

- 対象ホストは After Effects のみ。
- Premiere Pro は現在の対象外であり、新規設計の根拠にしない。
- `appRoot` は ExtendScript 側で After Effects から取得する。
- Documents 配下の scripts folder を正規保存先にしない。
- localStorage を正規保存手段にしない。
- `archive/`, `reference/`, `docs/no-use/`, `docs/plans/` は現在のアーキテクチャの根拠にしない。
- TypeScript product source は `.js` ではなく `.ts` で書く。Rust product source は `rust/` に置く。
- `src/` の source ownership は `shared/`, `management/`, `function/` を最上位とする。
- `ui/`, `dialogs/`, `surfaces/`, `features/`, `cloud/`, `legacy/` を所有境界として新設しない。

 legacy path の例: `packages/`, `host-scripts`, `command-dispatch`, `src js`, `apps/`, `cep-shell` (as a layer)。これらは旧系统中途の残留であり、docs で layer として参照しない。

## INV-1: 三層構造

`src/` は次の 3 系統だけを最上位とする。

```text
src/
├─ shared/      # 共通primitive、utility、型 — domain knowledge を持たない
├─ management/  # 基盤システム — storage, persistence, workspace, ae, i18n, style, online, debug
└─ function/    # 実機能 — widget, preset, onboarding の各 leaf 実装
```

`apps/`, `packages/`, `cep-shell` (as a layer), `functions/`, `src js` は legacy である。

## 文書ルール

- 文書は読む目で分類する。
- data shape は docs に再定義せず、`data/` から定義元と使用元へ誘導する。
- `index.md` は案内のみとし、その topic の本体は別文書に置く。

## Execution Path

How a CEP panel or dialog boots to a rendered workspace.

```text
cep.config.ts
  └─ panel/dialog surface definition + entry point path
src/management/ae/cep/entry/id.ts
  └─ CEP bootstrap (surface id resolution, transport creation)
src/management/storage/
  └─ workspace state, file I/O, settings persistence
src/management/online/
  └─ connectivity, catalog (dormant), notification, static update feed
src/function/widget/registry.ts
  └─ widget grid with active-now / implemented-not-exposed entries
src/function/widget/renderWidget.ts
  └─ widget body composition per type
src/function/preset/operations/
  └─ preset execution per `PresetType` (preset, script, plugin, footage)
     See docs/architecture/data/workspace-records/preset/types.md for the
     catalog-name to storage-type mapping.
src/function/onboarding/
  └─ onboarding flow and step management
```

**CEP entries** are thin bootstraps under `src/management/ae/cep/entry/`. They do not own product behavior — they wire transport and delegate to management/function modules.

**UI surfaces** (panel, dialog, widget body, settings, onboarding) live under the operation system that owns them, not under a shared `ui/` or `dialogs/` bucket.

## Widget Registry

The canonical registry for widget exposure is:

| File | Role |
|------|------|
| `src/function/widget/contract.ts` | `WIDGET_TYPES` union and `WidgetType` type |
| `src/function/widget/kinds.ts` | Widget grid metadata (`CATALOG`, sizes, availability) |
| `src/function/widget/registry.ts` | Runtime descriptor registry (auto-aggregates via `import.meta.glob`) |
| `src/function/widget/registry-load.ts` | Re-exports from `registry.ts` for backwards compatibility |
| `src/function/widget/index.ts` | **Public API** — import from here, not from `./kinds` or `./grid-registry` directly |
| `src/function/widget/renderWidget.ts` | Widget body composition via descriptor |

**Active (6):** `easing`, `menu`, `align`, `anchor-point`, `layout-lock`, `directory-browser`

**Implemented but not exposed (2):** `info`, `font-viewer`

**Notes:**
- `grid-registry.ts` was deleted in Wave 3 — the registry is now driven by `registry.ts` / `registry-load.ts` / `index.ts`.
- `kinds.ts` still exists with `CATALOG` (Wave 3 deferred metadata migration; clean-up is a follow-up task).
