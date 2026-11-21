# リリース候補の検証記録（v0.12.0 / Stable）

- Status: **Windows・macOSともに release-trust で完成し、GitHub Release公開済み**（macOSは未公証、ADR-0003 Amendment 1）
- 対象: `main`（`release-0-12-0` を PR #354 で統合後、ZXP TSA 修正 PR #356 を追加統合）
- 正本: `.agents/skills/release-channels/SKILL.md`、`docs/operations/release-runbook.md`、ADR-0003/0004
- 公開記録: tag `v0.12.0` → `53038cf65b0bb53140ec70d47d87cbb588d5ed4c`、GitHub Release `ty-plus 0.12.0`（draft=false, prerelease=false, `/releases/latest` = v0.12.0）、公開日時 2026-11-21T14:56:38Z

## 1. 版の確定

| 項目 | 値 |
| --- | --- |
| CEP数値版（`package.json.version`） | `0.12.0` |
| 配布版（`releaseVersion`） | `0.12.0` |
| GitHub tag | `v0.12.0` |
| channel / prerelease | `stable` / `false` |
| sourceCommit | `53038cf65b0bb53140ec70d47d87cbb588d5ed4c`（PR #356 merge commit = 公開時点の `origin/main` head） |

v0.10.3 とは**別の成果物**である。`channel=stable`、tagが`v0.12.0`、ハッシュが異なる。

## 2. Windows配布候補（完成）

macOSホストから `TY_PLUS_BUILD_PLATFORM=windows` でクロスコンパイル。WindowsはAuthenticode不要（ADR-0003、未署名workerがR0の正当な形）。

```sh
TY_PLUS_BUILD_PLATFORM=windows \
TY_PLUS_SIGN_IDENTITY="Developer ID Application: Yusuke Kimura (JK49RJ2CK2)" \
TY_PLUS_ZXP_CERT_PATH="$HOME/Library/Application Support/ty-plus-signing/ty-plus-release.p12" \
TY_PLUS_ZXP_CERT_PASSWORD="$(security find-generic-password -s 'ty-plus.zxp.signing' -w)" \
ZXP_SIGN_CMD="$PWD/node_modules/vite-cep-plugin/lib/bin/ZXPSignCmd" \
ZXP_TIMESTAMP_URL=none \
bun run release:candidate --channel=stable --release-version=0.12.0
```

| 項目 | 実測値 |
| --- | --- |
| sourceCommit | `53038cf65b0bb53140ec70d47d87cbb588d5ed4c` |
| trustMode | `release` |
| ZIP | `ty-plus-v0.12.0-windows.zip` / sha256 `899603d97b155d1b1fa2153a9c32adbc49de26d661bf1f5c31b138170330d02f` / 11,208,103 bytes |
| ZXP | `ty-plus-v0.12.0-windows.zxp` / sha256 `5c04bc2678be9f9845c8f2b792536b6b880c38af9eda7eb8e981e0647ae725dc` / 11,223,608 bytes |
| manifest | `ty-plus-v0.12.0-windows-release-manifest.json` / sha256 `fcfafb1ff249adb8e601e4b614e62c0832eb96cc4cabe0590a31515a3c381338` |
| worker | `windows/operation-worker.exe`（8,188,416 bytes、binary sha256 `7289a160c259…` = pack内version dir名と一致、Authenticode未署名 = R0の正当な形） |
| ZXP署名 | `ZXPSignCmd -verify` → `Signature verified successfully` |

`verify-online-gateway-package.ts` 全項目PASS（`trust-mode-manifest`: unsigned worker — R0 Windows shape）。監査（`verify-release-artifacts.ts`）: `0.12.0 (stable), sourceCommit=53038cf6…, 2 artifact(s) hash-verified, secret scan clean`。

## 3. macOS配布候補（完成 — Developer ID署名 / 未公証）

```sh
TY_PLUS_SIGN_IDENTITY="Developer ID Application: Yusuke Kimura (JK49RJ2CK2)" \
TY_PLUS_ZXP_CERT_PATH="$HOME/Library/Application Support/ty-plus-signing/ty-plus-release.p12" \
TY_PLUS_ZXP_CERT_PASSWORD="$(security find-generic-password -s 'ty-plus.zxp.signing' -w)" \
ZXP_SIGN_CMD="$PWD/node_modules/vite-cep-plugin/lib/bin/ZXPSignCmd" \
ZXP_TIMESTAMP_URL=none \
bun run release:candidate --channel=stable --release-version=0.12.0
```

| 項目 | 実測値 |
| --- | --- |
| sourceCommit | `53038cf65b0bb53140ec70d47d87cbb588d5ed4c` |
| trustMode | `release` |
| ZIP | `ty-plus-v0.12.0-macos.zip` / sha256 `d30dcc84191ee44f4813935cf90771b82aff3bd1250f1a42fdeea29cc1f27dd7` / 14,334,820 bytes |
| ZXP | `ty-plus-v0.12.0-macos.zxp` / sha256 `1ebaa8a19d425790691bdbcdbbd60a312ba3e29d7f233644a5d1f667439f0247` / 14,348,854 bytes |
| manifest | `ty-plus-v0.12.0-macos-release-manifest.json` / sha256 `4b28f6631e2023d780b74f55d7a8d98d5a382f58e4b8a7dd512f70a6677ab15d` |
| worker | `macos/operation-worker`（13,407,040 bytes、binary sha256 `6db79bdc2554…`、Developer ID署名 + 署名証拠読み戻し済み） |
| ZXP署名 | `ZXPSignCmd -verify` → `Signature verified successfully` |

`verify-online-gateway-package.ts` 全項目PASS（`binary-sha256-matches-manifest`: `6db79bdc2554…`）。監査: `0.12.0 (stable), sourceCommit=53038cf6…, 2 artifact(s) hash-verified, secret scan clean`。

## 4. 今回のビルドで判明・修正した問題

- **ZXP署名 exit -1 → exit 36**: `ZXP_SIGN_CMD` 未設定時の bundled 解決先が Windows用 `ZXPSignCmd.exe` 参照で macOS では spawn 不能。`node_modules/vite-cep-plugin/lib/bin/ZXPSignCmd` を明示して解消。
- **Apple TSA 無効化**: 既定 TSA `http://timestamp.apple.com/ts01` が死んでおり exit 36。`release-0-11-0` 系の既知知見を main へ port（Issue #355 / PR #356: 既定 TSA 無し、`ZXP_TIMESTAMP_URL=none` で明示無効化、明示URLのみ `-tsa` 付与）。`-tsa` 無し ZXP は `ZXPSignCmd -verify` で受理され、署名証明書の有効期間（2027-11-22まで）が署名を担保する。

## 5. 公開後検証（実測）

| 項目 | 実測値 |
| --- | --- |
| tag | `refs/tags/v0.12.0` → `53038cf65b0bb53140ec70d47d87cbb588d5ed4c`（`git ls-remote`） |
| release | `draft=false`, `prerelease=false`, `target_commitish=53038cf6…`, `published_at=2026-11-21T14:56:38Z` |
| latest | `/releases/latest` = `v0.12.0`（draft→公開時に `make_latest` が自動適用されなかったため `PATCH make_latest=true` で修正済み） |
| assets | 6ファイル全て upload 済み。4つの配布物（zip/zxp ×2 platform）の GitHub asset digest が manifest 記録の sha256 と一致 |

## 6. 残存リスク・既知制約

- **実機インストールゲート未実施**: 署名・整合性は検証済みだが、実機 After Effects での起動確認はユーザー環境での確認が前提（過去リリースと同じ運用）。
- macOS ZXP は TSA 無し署名。署名証明書の有効期間が失効する 2027-11-22 以降は再署名が必要。
- Windows は SmartScreen 警告が出る既知の制約（ADR-0003）。Authenticode 証明書は R0 では導入しない。
- macOS は未公証（ADR-0003 Amendment 1）。`TY_PLUS_NOTARY_PROFILE` 設定で公証経路は有効化可能。
