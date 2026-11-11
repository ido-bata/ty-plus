# Source Ownership

この文書は、TypeScript の `src/` と Rust の `rust/` を別々の product
source root として扱い、それぞれの所有境界を定める。

## TypeScript source ownership

`src/` は `shared/` `management/` `function/` の 3 系統を最上位とする。

## 構造

| 系統 | 役割 | 依存 |
| --- | --- | --- |
| `shared/` | 管理系と機能系の両方へ提供する仕様、共通部品、style、debug、utility | どちらにも依存しない |
| `management/` | 実機能が成立するための基盤、管理、連携、保存、状態 | `shared/` のみに依存する |
| `function/` | ユーザーが直接使う実機能 | `management/` と `shared/` に依存する |

依存方向は次の通り。

```text
function -> management -> shared
function -> shared
```

逆方向の依存は、原則として構造違反である。

## 非所有境界

次の語は、source ownership の最上位分類として使わない。

| 語 | 使わない理由 |
| --- | --- |
| `ui` | UI は各操作体系の末端に付属する表示手段であり、所有境界ではない |
| `dialogs` | dialog は UI 形態であり、preset / workspace / online / function など所有者の下に置く |
| `surfaces` | CEP surface は presentation mechanism であり、機能所有者ではない |
| `features` | 抽象的すぎて管理系と実機能の境界を壊す |
| `cloud` | 技術名であり、製品上の所有境界は `management/online` |
| `legacy` | 残す場所にすると債務が残る。削除、archive、または現役所有者へ移す |
| `cep-shell` | 配布・実行上の容器名であり、workspace / dialog / widget / online の所有境界ではない |

## UI の置き方

UI は `surface` や `dialog` で横断分類しない。
必ず、その UI を必要とする操作体系の下に置く。

例:

```text
management/presets/indexing/list/dialog.tsx
management/workspaces/panels/main.tsx
management/online/catalog/list/dialog.tsx
function/widgets/easing/body.tsx
function/presets/code/editor.tsx
function/onboarding/primary.tsx
```

避ける例:

```text
dialogs/presets/PresetListDialog.tsx
surfaces/workspace/WorkspacePanel.tsx
ui/widgets/EasingWidget.tsx
features/presets/...
```

## 冗長命名を避ける

親ディレクトリがすでに意味を持つ場合、子で同じ語を繰り返さない。

良い:

```text
management/presets/indexing/list/dialog.tsx
function/widgets/easing/body.tsx
management/online/licensing/dialog.tsx
```

悪い:

```text
management/presets/preset-indexing/preset-list/PresetListDialog.tsx
function/widgets/easing-widget/EasingWidget.tsx
management/online/online-licensing/LicenseDialog.tsx
```

## 管理系

`management/` は、実機能の基盤だけを扱う。
ユーザーが使う具体的な widget behavior や preset type behavior をここへ入れない。

```text
management/
├─ presets/
│  ├─ records/
│  ├─ indexing/
│  ├─ authoring/
│  ├─ assets/
│  └─ storage/
├─ workspaces/
│  ├─ records/
│  ├─ layout/
│  ├─ runtime/
│  ├─ panels/
│  ├─ selection/
│  ├─ persistence/
│  ├─ messaging/
│  ├─ appearance/
│  └─ settings/
├─ ae/
│  ├─ cep/
│  ├─ commands/
│  ├─ files/
│  └─ scripts/
└─ online/
   ├─ connectivity/
   ├─ account/
   ├─ licensing/
   ├─ catalog/
   └─ notifications/
```

### 管理系の判断基準

- それがなければ実機能が成立しない base か。
- record、index、layout、host bridge、storage、account、license state などを扱っているか。
- 具体的な widget / preset type の動作を持っていないか。

## 機能系

`function/` は、管理系の上で成立する実機能を扱う。

```text
function/
├─ widgets/
│  ├─ system/
│  ├─ search/
│  ├─ menu/
│  ├─ align/
│  ├─ anchor/
│  ├─ easing/
│  └─ text-style/
├─ presets/
│  ├─ system/
│  ├─ file/
│  ├─ folder/
│  ├─ code/
│  ├─ footage/
│  ├─ animation/
│  ├─ layer-comp/
│  ├─ import/
│  ├─ easing/
│  └─ text-style/
└─ onboarding/
```

オンボーディングは管理系ではない。
管理基盤を提供するのではなく、導入というユーザー向け実機能を提供するため、`function/onboarding` に置く。

## 共通系

`shared/` は、管理系にも機能系にも依存しない。

```text
shared/
├─ contracts/
├─ components/
├─ style/
├─ i18n/
├─ debug/
└─ utils/
```

debug は製品導線ではなく、管理系・機能系を観測する独立経路である。
そのため workspace runtime や widget behavior に混ぜない。

## Legacy path

以下の path は旧系统中途の残留であり、layer として docs で参照しない。

- `packages/` — 旧 package 境界
- `host-scripts` — 旧 ExtendScript 配置
- `command-dispatch` — 旧コマンド dispatch 系
- `src/js` — 旧 CEP Panel runtime
- `/apps/` — 旧 application bundle。`rust/apps/` は Rust workspace 内の現行配置であり、これに含めない
- `cep-shell` (as a layer) — 旧配布・実行上の容器名
- `functions/` — 旧 source path (Supabase edge function は `supabase/functions/`)

## 移行時の扱い (legacy)

> The large-scale file migration described here has been completed. These notes are retained for historical reference only.

移動中はファイル移動、リネーム、import 修正だけを行い、機能追加、挙動変更、style 変更、data shape 変更、registry exposure 変更は混ぜない。

## Rust source ownership

Rust は [`rust/`](../../../rust/) を正規 product source root とする。
crate は技術一般の `core` や `native` に集約せず、次の product 責務で分ける。

| 配置 | 所有する責務 | 所有しないもの |
| --- | --- | --- |
| [`crates/protocol`](../../../rust/crates/protocol/) | versioned IPC contract と boundary validation | domain behavior、transport lifecycle |
| [`crates/storage`](../../../rust/crates/storage/) | managed storage、persistent cache、operation history | AE installation discovery、product network |
| [`crates/online`](../../../rust/crates/online/) | product HTTP、catalog、sync、download | license policy、persistent storage |
| [`crates/licensing`](../../../rust/crates/licensing/) | aescripts license policy と state | 一般の product network、offline feature behavior |
| [`crates/host-filesystem`](../../../rust/crates/host-filesystem/) | active AE session から渡された root に scope した filesystem operation | `appRoot` discovery、managed storage policy |
| `apps/operation-worker` | 1 invocation の operation worker の lifecycle と上記 crate の composition | 各責務の domain implementation、常駐 daemon |

この表は source ownership だけを定める。型・JSON shape・未実装の挙動はここで
再定義せず、[`crates/protocol/src`](../../../rust/crates/protocol/src/) の定義とその使用元を追う。

### composition と依存の原則

- `apps/operation-worker` は responsibility crate を組み立て、1 invocation を処理して終了する
  composition root であり、汎用の aggregate core や常駐 daemon にしない。
- `protocol` は wire contract の所有者であり、storage / online / licensing /
  host-filesystem の business logic を吸収しない。
- React / CEP 側は [`src/management/ipc`](../../../src/management/ipc/) の transport
  boundary から Rust operation worker へ接続する。ExtendScript は AE context を供給する
 だけである。Rust の責務を `src/shared`
  の汎用 API として再公開しない。

### OS 差分の配置

Windows と macOS で分岐する実装は、その操作を所有する責務の近傍に
`windows.rs` と `macos.rs` を並べる。共通の OS 別 bucket へ分離しない。

現在の実例:

- [`crates/host-filesystem/src/platform/windows.rs`](../../../rust/crates/host-filesystem/src/platform/windows.rs)
  と [`macos.rs`](../../../rust/crates/host-filesystem/src/platform/macos.rs)
- `apps/operation-worker/src/platform/windows.rs` と
  `apps/operation-worker/src/platform/macos.rs`

対応するもう一方の OS 実装を、fallback や離れた別 task として残さない。

## Development-script ownership

`scripts/` は product behavior ではなく、build / dev / generate / check の実行経路を
所有する。Rust operation worker に関して現在実装済みの正規導線は次の通り。

- generate: [`scripts/generate/generate-rust-protocol-schema.ts`](../../../scripts/generate/generate-rust-protocol-schema.ts)
- check: [`scripts/check/check-rust-workspace.ts`](../../../scripts/check/check-rust-workspace.ts),
  [`scripts/check/check-rust-runtime-boundaries.ts`](../../../scripts/check/check-rust-runtime-boundaries.ts)

Rust operation worker の build / dev launcher は未実装であり、旧 CLI WIP や CEP deploy scriptを
正規導線として扱わない。

generator は source ownership を逆転させない。Rust から生成する contract の source of truth は
Rust の定義であり、script や生成先は別の data shape を所有しない。
