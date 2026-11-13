# ADR-0005: 開発ビルドとリリースビルドのExtension Id分離

- Status: Accepted（2026-11-14）
- 正本: 本文 / Issue #86 / `docs/verification/r0-device-gate.md`（検証時の識別手順）
- 対象: CEPバンドルの Extension Bundle Id / Extension Id の発行規則

## Context

開発ビルド（`bun run build:cep:dev` → `dist/cep-dev`）とリリース配布物は、これまで同一の Extension Bundle Id `app.ty-plus`（および `app.ty-plus.panel1` / `app.ty-plus.dialog-*` の Extension Id）を名乗っていた。CEP は extensions ディレクトリ全体から Extension Id を解決するため、両者が同居するとどちらのコードがロードされるか一意に決まらず、実機検証では同居禁止の運用で回避していた（#80 で文書化）。

## Decision

- **リリースビルド**の Extension Bundle Id は `app.ty-plus` のまま変更しない。`Extension Id = <bundleId>.<surfaceName>` の対応も不変であり、公開済み v0.10.1 との互換性と既存ユーザーデータへの影響はない。
- **開発ビルド**は Extension Bundle Id `app.ty-plus.dev` を名乗り、Extension Id は `app.ty-plus.dev.panel1` / `app.ty-plus.dev.dialog-*` となる。リリースインストールと同一 extensions ディレクトリに共存でき、surface が一意に解決される。
- 開発/リリースの判定はビルドモードで行う。`TY_PLUS_CEP_BUILD_MODE=development` または `NODE_ENV !== "production"` のビルドが開発扱い（worker manifest の `development-unsigned` 判定と同一条件）。`bun run build` / `bun run zip` / `bun run release:candidate` は production でありリリース ID を使う。
- パネル・modeless のランタイムコードは `src/management/ae/cep/extension-id.ts` の `tyPlusExtensionId()` / `tyPlusExtensionBundleId` を経由し、Vite define `__TY_PLUS_EXTENSION_BUNDLE_ID__`（`cep.config.ts` の `id` と同一値）を唯一の注入点とする。`app.ty-plus` prefix のリテラルを src へ新規に書かない。
- panel entry の surface id 解決と `panel/index.html` の inline script は Extension Id の**接尾辞**（`.panelN` / `.panel.N`）で判定し、prefix に依存しない。
- 開発インストールのフォルダ名は Extension Bundle Id と同じ `app.ty-plus.dev` とし、リリースの `app.ty-plus` フォルダと分ける（`scripts/cep/install-cep-dev.ts`）。manifest 内の Id とフォルダ名は独立だが、同名フォルダの衝突を避けるため両方を分離する。#86 以前の開発フォルダ名 `org.loginc.ty-plus` はレガシー配置として uninstall / prebuild-clean の対象に残す。
- `scripts/verify/verify-operation-worker-cep.ts` は `.debug` の `*.panel1` エントリから Extension Id を解決し、開発/リリースどちらのバンドルでも検証できる。

## Consequences

- dev build と release build を同時にインストールしても CEP surface は衝突しない。`r0-device-gate.md` の「同居禁止」ルールは、Id が分離された後は「対象ビルドの証跡化」として簡略化できる（フォルダ名で判別可能）。
- ユーザーデータ（管理ルート `~/Library/Application Support/ty-plus/` 等）は Extension Id に依存しないため、dev/release 間でデータは共有される。これは従来どおりであり、本 ADR で変更しない。
- preset tool handoff ファイル名は Extension Id を含むため、dev build は `app.ty-plus.dev.*.json` を読み書きする。一時ファイルであり永続データではない。
- `app.ty-plus.dev` という Id を名乗るのは開発ビルドのみ。リリース・ZXP・zip の監査（`verify-release-artifacts.ts`）は従来どおり `app.ty-plus` を要求し、開発 Id が混入した成果物はリリース監査で拒否される。

## Rejected

- フォルダ名だけを分けて manifest Id を共有する：CEP の Id 解決衝突は解消しない（#80 の問題の根本原因）。
- dev build に `org.loginc.ty-plus` を新たな契約名として使う：レガシー由来の識別子を公開 repo の命名規則へ持ち込まない。フォルダ名は Bundle Id と同じ `app.ty-plus.dev` に統一する。
