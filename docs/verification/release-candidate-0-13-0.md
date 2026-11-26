# Release candidate 記録: v0.13.0 (stable)

- status: **published**（2026-11-25 JST、GitHub Release `v0.13.0`、draft=false / prerelease=false / latest）
- sourceCommit: `3a34010cdf155161f13c89f8d71cd9a5afdd0f8f`（release PR #373 の merge commit = 公開時点の `origin/main` head）
- version / releaseVersion / channel / trustMode: `0.13.0` / `0.13.0` / `stable` / `release`
- tag: `v0.13.0`（`--target` = sourceCommit、Stable のため `--latest` 使用・prerelease なし）

## 成果物（`dist/github-release/` → GitHub Release assets）

| platform | asset | sha256 | bytes |
| --- | --- | --- | --- |
| windows | `ty-plus-v0.13.0-windows.zip` | `663dc34bda85dc228398871db1626768cb567196e545cf0f0e46adca5362dac7` | 11,544,173 |
| windows | `ty-plus-v0.13.0-windows.zxp` | `3d513e9d431218d5384c618e274068e825cd816ef4cb84f8ee6eb54c27d66918` | 11,560,800 |
| windows | `ty-plus-v0.13.0-windows-release-manifest.json` | — | 597 |
| macos | `ty-plus-v0.13.0-macos.zip` | `7194fbd6c95debf60ff0c0f0e4fdadc55b54b33c38f5aad927bf99d276f82f1a` | 14,670,905 |
| macos | `ty-plus-v0.13.0-macos.zxp` | `71f85d1f108cc8ad36a3353ff9a722095dd72233face1907450bde5120efba83` | 14,685,914 |
| macos | `ty-plus-v0.13.0-macos-release-manifest.json` | — | 593 |

## 実行した検証（実測）

- `bun run release:candidate --channel=stable --release-version=0.13.0` を Windows（`TY_PLUS_BUILD_PLATFORM=windows` クロスコンパイル）と macOS の2回実行
- 両 platform: `verify-online-gateway-package.ts --trust-mode=release` 全項目 PASS（product-version / worker binary / trust-mode-manifest / cep manifest / binary-sha256）
- `verify-release-artifacts.ts`: `0.13.0 (stable), sourceCommit=3a34010c…, 2 artifact(s) hash-verified, secret scan clean`（両 platform）
- ZXP: `ZXPSignCmd -verify` → `Signature verified successfully`（`ZXP_TIMESTAMP_URL=none`、TSA 無し署名）
- macOS worker: Developer ID Application 署名 + 署名証拠読み戻し（codesign: valid on disk / satisfies Designated Requirement）。**未公証**（ADR-0003 Amendment 1）
- Windows worker: 未署名（R0 の正当な形、manifest sha256 pin で整合性保証）
- 公開後検証: `/releases/tags/v0.13.0` で draft=false / prerelease=false / target=3a34010c / 6 assets を確認。全 asset を再取得し sha256 が添付 manifest と一致することを確認（ALL OK）

## CI / ゲート

- release PR #373: static / unit / coverage / skills / release gate PASS。`Workers Builds: ty-plus`（Cloudflare Workers ビルド）は main でも失敗する既存の非関連チェック
- release branch には ticket PR #540（#71）/ #544（#243）/ #589（#108 記録）を landing 済み

## 未実施・既知の制約

- **AE 実機でのインストール・起動・更新経路は未検証**（2026-11-24 device-macos AE2027 dev suite は PASS=16/FAIL=8/BLOCKED=6 で、preset 実行・settings dialog・widget 追加まわりに未解決ケースあり。`docs/verification/e2e-acceptance/results/2026-11-24-device-macos-ae2027-dev.md`）
- 旧版からの更新確認で v0.13.0 を検出する実機確認は未実施
- Windows 実機検証は未実施
- macOS ZXP は TSA 無し署名。署名証明書の有効期間失効後は再署名が必要
