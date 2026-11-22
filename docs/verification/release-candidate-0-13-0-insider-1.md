# Release candidate 検証記録: v0.13.0-insider.1

- 実施日: 2026-11-22
- channel: insider / tag: `v0.13.0-insider.1` / GitHub `prerelease=true`
- sourceCommit: `f08a680db818d652a142529a7586fb9ddd865f66`（`release: prepare v0.13.0 insider candidate`、package.json `0.13.0`）
- 実行: `bun run release:candidate --channel=insider --release-version=0.13.0-insider.1`（macOS host。Windows は `TY_PLUS_BUILD_PLATFORM=windows` + cargo-xwin 0.23.1 でクロスコンパイル）

## 成果物

| platform | file | sha256 |
| --- | --- | --- |
| macOS | `ty-plus-v0.13.0-insider.1-macos.zip` | manifest 記載値と実バイト一致（公開後再取得でも一致確認済み） |
| macOS | `ty-plus-v0.13.0-insider.1-macos.zxp` | 同上 |
| Windows | `ty-plus-v0.13.0-insider.1-windows.zip` | 同上 |
| Windows | `ty-plus-v0.13.0-insider.1-windows.zxp` | 同上 |

正式な sha256 は各 `*-release-manifest.json` を正本とする（本書には転記しない）。

## 監査結果（verify-release-artifacts.ts、両 platform で PASS）

- `trustMode=release`、`sourceCommit` = HEAD(`f08a680d`) 一致
- manifest `releaseVersion=0.13.0-insider.1` / `channel=insider` / 数値コア `0.13.0` = `package.json.version`
- 各 artifact の sha256 が実バイトと一致
- pack 内 `LICENSE` / `THIRD-PARTY-NOTICES.md` / `jsx/ty-plus-host.jsx` 存在、CEP `ExtensionBundleVersion` 一致
- panel bundle の更新 contract（`ty-plus.github-releases/1`）と `releaseVersion`/`channel` 注入 binding 一致
- macOS worker: Developer ID Application 署名（`codesign` valid on disk / satisfies DR）
- Windows worker: 未署名（R0 の正当な形、ADR-0003）
- ZXP: `ZXPSignCmd -verify` で署名検証 PASS（timestamp 無し、#233）
- secret scan clean

## 公開後検証

- `/releases/tags/v0.13.0-insider.1`: `draft=false` / `prerelease=true` / target=`f08a680d` / asset 6件
- 公開 asset を再取得し sha256 が添付 manifest と一致することを確認（全4バイナリ OK）

## 未実施・既知の制約

- **未実施**: Windows 実機、AE 実機でのインストール・更新経路、旧版からの更新検出の実機確認
- macOS worker は Developer ID 署名済みだが**未公証**（ADR-0003 Amendment 1。公証 profile 未設定のため公証 skip — 公証済みではない）
- Windows worker は未署名のため SmartScreen 警告が出る（R0 既知の制約）
- ZXP は RFC3161 timestamp 無し署名（Apple TSA endpoint 無効化、#233）
- CI（GitHub Actions）は release candidate ビルドには未使用。ローカルビルド + 監査スクリプトで検証
