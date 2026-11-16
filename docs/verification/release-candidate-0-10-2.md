# リリース候補の検証記録（v0.10.2 / Stable）

- Status: **Windows・macOSともに release-trust で完成**（macOSは未公証、ADR-0003 Amendment 1）
- 対象: PR #63 / `release-0-10-2`
- 正本: `.agents/skills/release-channels/SKILL.md`、`docs/operations/release-runbook.md`、ADR-0003/0004
- この記録は**公開の承認ではない**。GitHub Release作成・tag作成・`release-0-10-2 → main` mergeは本人の明示承認まで実行しない。

## 1. 版の確定

| 項目 | 値 |
| --- | --- |
| CEP数値版（`package.json.version`） | `0.10.2` |
| 配布版（`releaseVersion`） | `0.10.2` |
| GitHub tag | `v0.10.2` |
| channel / prerelease | `stable` / `false` |
| sourceCommit | `78f95de20202a188282a0557680d3c80aa4788ca`（PR #133 merge commit） |

v0.10.1 とは**別の成果物**である。`channel=stable`、tagが`v0.10.2`、ハッシュが異なる。

## 2. Windows配布候補（完成）

macOSホストで `cargo xwin`（MSVCツールチェーン、`cargo +1.89.0 xwin`）によりクロスコンパイル。WindowsはAuthenticode不要（ADR-0003）。

```sh
CROSS_COMPILE_CARGO="cargo +1.89.0 xwin" \
TY_PLUS_BUILD_PLATFORM=windows \
TY_PLUS_RELEASE_VERSION=0.10.2 TY_PLUS_RELEASE_CHANNEL=stable \
TY_PLUS_ZXP_CERT_PATH="$HOME/Library/Application Support/ty-plus-signing/ty-plus-release.p12" \
TY_PLUS_ZXP_CERT_PASSWORD="$(security find-generic-password -s 'ty-plus.zxp.signing' -w)" \
ZXP_SIGN_CMD="$PWD/.tmp/zxp/ZXPSignCmd" \
bun run release:candidate --channel=stable --release-version=0.10.2
```

| 項目 | 実測値 |
| --- | --- |
| sourceCommit | `78f95de20202a188282a0557680d3c80aa4788ca` |
| trustMode | `release` |
| ZIP | `ty-plus-v0.10.2-windows.zip` / sha256 `568fd880e28b81ec8c364ecd097d494a1a67f0c31c4a9d11a674e9d52c20cbe3` / 11,065,436 bytes |
| ZXP | `ty-plus-v0.10.2-windows.zxp` / sha256 `8b3bf17e5ecdf73cbb2280d6e6f6211728e79f667bca9d0a2cab25e12865b8e2` / 11,084,338 bytes |
| worker | `windows/operation-worker.exe`（PE32+ x86-64、7,907,328 bytes、sha256 `e6e14f5364c48cd4eeb3d5b00df4fb3e9d9c81e248b68978acaf2ce12a4536d3`、Authenticode未署名 = R0の正当な形） |
| ZXP署名 | `ZXPSignCmd -verify` → `Signature verified successfully` |

実測で確認した内容:

- ZIPは `LICENSE` / `THIRD-PARTY-NOTICES.md` / `jsx/ty-plus-host.jsx` / `CSXS/manifest.xml`（`ExtensionBundleVersion="0.10.2"`）+ `windows/` workerのみを含む。macOS workerは含まない（`pruneUndeclaredWorkers` で宣言外のworker版を除去）
- ZXPも当該platformのworkerのみを含む
- `verify-online-gateway-package.ts` 全項目PASS（`trust-mode-manifest`: unsigned worker — R0 Windows shape）
- 監査（`verify-release-artifacts.ts`）全項目PASS: `0.10.2 (stable), sourceCommit=78f95de2…, 2 artifact(s) hash-verified, secret scan clean`

## 3. macOS配布候補（完成 — Developer ID署名 / 未公証）

```sh
TY_PLUS_SIGN_IDENTITY="Developer ID Application: Yusuke Kimura (JK49RJ2CK2)" \
TY_PLUS_ZXP_CERT_PATH="$HOME/Library/Application Support/ty-plus-signing/ty-plus-release.p12" \
TY_PLUS_ZXP_CERT_PASSWORD="$(security find-generic-password -s 'ty-plus.zxp.signing' -w)" \
ZXP_SIGN_CMD="$PWD/.tmp/zxp/ZXPSignCmd" \
bun run release:candidate --channel=stable --release-version=0.10.2
```

| 項目 | 実測値 |
| --- | --- |
| sourceCommit | `78f95de20202a188282a0557680d3c80aa4788ca` |
| trustMode | `release` |
| ZIP | `ty-plus-v0.10.2-macos.zip` / sha256 `8d55f32d2af4d2215e3d66aec0fa0046a937ca7054facd9482b10472f0559e63` / 14,184,925 bytes |
| ZXP | `ty-plus-v0.10.2-macos.zxp` / sha256 `da0aebe09a04beb1d1538fa4c7fc962b282d3e6d5fc8d9c5bb9a355f3f4bd546` / 14,203,133 bytes |
| worker | `macos/operation-worker`（Mach-O universal x86_64+arm64、13,160,080 bytes相当、sha256 `cd2b40709e2b74cd1340b4e30f4c49d2761a74080cc49328eeeb41be926c190e`、`flags=0x10000(runtime)`、hardened runtime、Developer ID署名） |
| ZXP署名 | `ZXPSignCmd -verify` → `Signature verified successfully` |

実測で確認した内容:

- `codesign --verify --strict` 成功。`Authority=Developer ID Application: Yusuke Kimura (JK49RJ2CK2)`、TeamIdentifier `JK49RJ2CK2`
- `spctl --assess --type execute` は `rejected (Unnotarized Developer ID)` を返す。**ADR-0003 Amendment 1（2026-11-12 本人決定）により公証はR0の要件ではなく、これは正しい状態**
- ZIPは `ExtensionBundleVersion="0.10.2"`、当該platformのworkerのみを含む
- 監査（`verify-release-artifacts.ts`）全項目PASS、secret scan clean

> **tag target**: 両platformの成果物の `sourceCommit` は `78f95de20202a188282a0557680d3c80aa4788ca`。GitHub Release作成時は `--target 78f95de20202a188282a0557680d3c80aa4788ca` を指定し、**tagと成果物の `sourceCommit` を一致させる**。この記録docの後続commitはdocsのみで、成果物のバイトに影響しない。

## 4. CI（最終SHA）

`release-0-10-2` の push run `43775359073`（head `78f95de2`）— **全job success**:

unit / coverage / static / skills / storybook (1–4) / release gate / **operation-worker-macos / operation-worker-windows**（いずれも実行・success。skipではない）

PR #63 の `pull_request` run `43775365040` も success。

## 5. 主要ジャーニーの受入証拠（#108 matrix より）

`docs/verification/e2e-acceptance/use-case-matrix.md` が正本。release範囲の主要項目:

| ジャーニー | 状態 | 証拠 |
| --- | --- | --- |
| 起動・既存データ復元（layout/settings/theme）| mac/win 自動PASS | UC-A02、`results/2026-11-15-device-*-dev-*` |
| panel-1〜5 開閉・独立性 | mac/win 自動PASS | UC-A03 |
| host bundle 常駐/self-heal | mac/win 自動PASS | UC-A04（#107修正済） |
| preset配置・widget追加 | mac 自動PASS（catalog/drag経路は未カバー）| UC-B01/B02 |
| layout snapshot 保存→復元→削除 | mac 自動PASS(sandbox) | UC-B05、`results/2026-11-16-device-macos-ae2026-dev-workspace-sandbox/` |
| `.jsx` script preset 実行 | mac 自動PASS | UC-C11 |
| `.ffx` preset 実行 | mac 自動PASS | UC-C10 |
| preset失敗時の通知（#126）| 実装済・toast観測は未検証 | UC-C14 BLOCKED |
| footage preset（PNG sequence）| **BLOCKED**（dialog Create button hydration、harness修正済・AE未起動のため再実行待ち）| UC-C12 |
| preset asset 欠落検出 / 破損JSON耐性 | mac/win 自動PASS | UC-C15/C16、UC-I01/I02/I05 |
| 言語切替・外観設定 | mac/win 自動PASS | UC-E01/E02（#121/#112修正済） |
| widget state 永続化 | mac/win 自動PASS | UC-D11 |
| quick-actions preset実行（#125）| mac 自動PASS(sandbox、AE marker確認) | UC-D10 |
| debug console / worker verify | mac/win 自動PASS | UC-G01–G03 |
| 破損 theme.css / app.json 起動 | mac/win 自動PASS | UC-I04/I05 |

sandbox run の整合性: `cleanAfterRepair: true`（修復1件: `cache/layout-undo/panel-1/stack.json`、実rootはbyte比較で復元済み）。

**未検証のまま残るもの（PASSにしていない）**: UC-C12/C14（BLOCKED）、Windows側の大半のsemi-auto UC、多数のwidget/drag/undo/複合ジャーニー（UC-B03/B06–B08、UC-C01–C09/C13、UC-D07–D09、UC-J01–J07 等）。これらはmatrixに `未実施` のまま記録されており、release範囲の主要ジャーニー（保存復元・script/FFX・widget・offline・host契約）は上記の通り検証済み。

## 6. 更新フィード・導入互換

- 更新検出（`checkForUpdate` → GitHub Releases API、channelフィルタ）は `src/management/online/update/feed.test.ts` で単体検証済み。v0.10.1では公開後に実feedで `0.10.0 → 0.10.1` 検出を実証済み
- **v0.10.2の実feed検証は GitHub Release公開後にしか実施できない**（tag/Releaseが存在しない現時点では意味のある結果が出ない）。公開後の確認項目として残す
- 導入・更新・既存データ保持: managed root 配下の `settings/`・`workspace-N.json`・`widgets/`・`presets/` は拡張更新で上書きされない設計（ZIP同梱物は extension bundle のみ）。AE再起動後の保持は v0.10.1 で実機確認済み（`release-candidate-0-10-1.md` §5）。v0.10.2での release-trust 成果物そのものの実機導入スモークは**未実施**（任意項目。runbook §公開までに必要な本人操作 1 と同じ扱い）

## 7. 署名基盤（継続利用）

- ZXP: `~/Library/Application Support/ty-plus-signing/ty-plus-release.p12`（自己署名、継続利用）。パスワードはキーチェーン `ty-plus.zxp.signing`。秘密値は記録していない
- macOS worker: 既存 Developer ID Application（`TY_PLUS_SIGN_IDENTITY` で指定、証明書の新規取得なし）
- macOS公証: **未実施**（`TY_PLUS_NOTARY_PROFILE` 未設定。ADR-0003 Amendment 1 によりR0要件外。解除する場合は `xcrun notarytool store-credentials ty-plus-notary` + env設定で再ビルド）

## 8. 残余リスク・未検証事項

1. **release-trust成果物の実機導入スモーク未実施** — v0.10.1同様、開発署名ビルドでのE2Eは実施済みだが、署名済みZIP/ZXPを実AEへ導入する確認は残る（任意。実施する場合は `docs/operations/release-runbook.md` の手順）
2. **UC-C12/C14 BLOCKED** — footage preset実行と失敗通知の実機観測が未完了。harness修正はcommit済みだがAE未起動で再実行できていない
3. **Windows実機でのv0.10.2確認なし** — Windows成果物はクロスコンパイル+静的検証のみ。v0.10.1時点のWindows実機結果（AE2027）を参照するが、v0.10.2差分の実機確認はない
4. **公開後の更新feed実証** — §6 の通り公開後に実施
5. **Smart App Control 有効環境ではWindows版が起動しない**（未署名worker、ADR-0003で許容済み・周知事項）

## 9. 公開までに必要な本人操作

1. **明示承認**: PR #63 のmerge（`release-0-10-2 → main`）と GitHub Release `v0.10.2`（`prerelease=false`、`--target 78f95de20202a188282a0557680d3c80aa4788ca`）の公開を承認する
2. **公開後確認**: 実feedでの更新検出、必要ならrelease-trust成果物の実機スモーク、UC-C12/C14の再実行
3. **任意**: macOS公証の有効化（`xcrun notarytool store-credentials ty-plus-notary`）
