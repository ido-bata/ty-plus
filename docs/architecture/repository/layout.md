# Repository Layout

この repo の現行 product source と開発スクリプトの物理構造を固定する。
言語ごとの所有境界は [source-ownership.md](source-ownership.md) で読む。

## 現行構造

```text
src/       # React / CEP / ExtendScript の TypeScript product source
rust/      # Rust operation worker の product source
scripts/   # build / dev / generate / check の開発・検証経路
```

`src/` と `rust/` はどちらも現行の product source である。`rust/` を
`native/` や汎用の `core/` という集約 bucket に読み替えない。

## TypeScript source

```text
src/
├─ function/          # leaf features: widgets, presets, onboarding
├─ management/        # platform capabilities: storage, ae, i18n, style, workspace, dialog, online, ...
└─ shared/           # generic primitives: components, util, contracts
```

`src/` は `function/` `management/` `shared/` の 3 系統だけを最上位に使う。

## Rust source

```text
rust/
├─ Cargo.toml
├─ rust-toolchain.toml
├─ apps/
│  └─ operation-worker/    # 1 operation ごとの Rust worker composition root
└─ crates/
   ├─ protocol/            # versioned IPC contract
   ├─ storage/             # managed storage と永続 local state
   ├─ online/              # product network と download
   ├─ licensing/           # aescripts license policy と state
   └─ host-filesystem/     # AE session に scope した filesystem operation
```

workspace member の正は [`rust/Cargo.toml`](../../../rust/Cargo.toml) である。
上のツリーは責務配置を示すものであり、各責務の実装完了度を示さない。

## Development scripts

Rust operation worker に関して現在正規化済みの開発経路は、役割に応じて次の近接した場所に置く。

| 役割 | 配置 | 現行の導線 |
| --- | --- | --- |
| generate | `scripts/generate/` | [`generate-rust-protocol-schema.ts`](../../../scripts/generate/generate-rust-protocol-schema.ts) |
| check | `scripts/check/` | [`check-rust-workspace.ts`](../../../scripts/check/check-rust-workspace.ts), [`check-rust-runtime-boundaries.ts`](../../../scripts/check/check-rust-runtime-boundaries.ts) |

script は product source の所有者にはならない。生成元と生成物の関係は個別の
generator から追跡し、docs で data shape を再定義しない。
Rust operation worker の正規 build / dev launcher はまだ実装されていない。未追跡の旧 CLI
WIP や CEP deploy script を、その代替として正規導線にしない。

**Legacy paths** (no longer used as layer names): `packages/`, `cep-shell`, `host-scripts`, `command-dispatch`, `src js`, `apps/` (リポジトリ直下), `functions/` (as root).

## 重要ルール

- `src/` の product source はビルド前に TypeScript で書く
- `rust/` は pinned toolchain の Rust workspace として扱う
- `archive/`, `reference/`, `docs/no-use/` は現行 build の根拠にしない
