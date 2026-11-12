# リリース候補の検証記録（0.10.1-insider.1）

- Status: **Windows配布候補は release-trust で完成 / macOSは公証未設定のため未完成**
- 対象: #58（進行正本）/ PR #57 / `release-0-10-1`
- 正本: `.agents/skills/release-channels/SKILL.md`、`docs/operations/release-runbook.md`、ADR-0003/0004
- この記録は**公開の承認ではない**。GitHub Release作成・tag作成・repo public化は本人の明示承認まで実行しない。

## 1. 版の確定

| 項目 | 値 |
| --- | --- |
| CEP数値版（`package.json.version`） | `0.10.1` |
| 配布版（`releaseVersion`） | `0.10.1-insider.1` |
| GitHub tag | `v0.10.1-insider.1` |
| channel / prerelease | `insider` / `true` |
| 衝突確認 | 既存tag 0件、既存Release 0件（`git tag`、`gh release list`） |

`0.10.0` → `0.10.1` の更新はrelease変更としてcommitした。旧版 `0.10.0` からの更新が「新しい」と判定されることを確認済み（§4）。

## 2. Windows配布候補（完成）

**このホスト（macOS）でクロスコンパイルして生成した。** WindowsはAuthenticode不要（ADR-0003）のため、MSVCターゲットのworkerをmacOS上でビルドできる。

```sh
CROSS_COMPILE_CARGO="cargo +1.89.0 xwin" \
TY_PLUS_BUILD_PLATFORM=windows \
TY_PLUS_RELEASE_VERSION=0.10.1-insider.1 TY_PLUS_RELEASE_CHANNEL=insider \
TY_PLUS_ZXP_CERT_PATH="$HOME/Library/Application Support/ty-plus-signing/ty-plus-release.p12" \
TY_PLUS_ZXP_CERT_PASSWORD="$(security find-generic-password -s 'ty-plus.zxp.signing' -w)" \
ZXP_SIGN_CMD="$PWD/.tmp/zxp/ZXPSignCmd" \
bun run release:candidate --channel=insider --release-version=0.10.1-insider.1
```

| 項目 | 実測値 |
| --- | --- |
| sourceCommit | `4181a5015be226354b2f404b9561a438dd44e2b1` |
| trustMode | `release` |
| ZIP | `ty-plus-v0.10.1-insider.1-windows.zip` / sha256 `1ccb76fdd52357a89da7abb5ff260330d4e81c884bc46f86e15419c83f8eb448` / 11,026,376 bytes |
| ZXP | `ty-plus-v0.10.1-insider.1-windows.zxp` / sha256 `548be9af769c9ea4d5054f25377e325988f86fd58d076940bfcfa6e57befc98d` / 11,044,917 bytes |
| worker | `windows/operation-worker.exe`（PE32+ x86-64、7,907,328 bytes、sha256 `d73edf6d23c3e6890583377dbf964c02c9575ba7b1c9967eaa32b1e79d99291a`） |
| ZXP署名 | `ZXPSignCmd -verify` → `Signature verified successfully` |

ZIP/ZXPの内容を実測で確認:

- ZIP: `LICENSE` / `THIRD-PARTY-NOTICES.md` / `jsx/ty-plus-host.jsx` / `CSXS/manifest.xml`（`ExtensionBundleVersion="0.10.1"`）/ `windows/operation-worker.exe`
- ZXP: **Windows workerのみ**（macOS workerを含まない）
- ZXPのsha256がZIPと異なる（別物であることの確認）

監査（`verify-release-artifacts.ts`）の全項目PASS: `trustMode=release` / `sourceCommit=HEAD` / artifact sha256 / 更新contract埋め込み / 注入bindingの版・channel一致 / CEP版一致 / worker署名証拠（Windowsは未署名を許容）/ secret scan clean。

## 3. macOS（未完成 — 公証資格情報が無い）

macOSのrelease-trustビルドは**ビルドを進めてから公証で停止**する。コード署名自体は成功している。

実測した状態:

| 段階 | 結果 |
| --- | --- |
| Developer ID署名（`codesign`） | **成功**。`Authority=Developer ID Application: Yusuke Kimura (JK49RJ2CK2)`、hardened runtime（`flags=0x10000(runtime)`） |
| `codesign --verify --strict` | **成功**（`valid on disk` / `satisfies its Designated Requirement`） |
| 公証（`notarytool submit`） | **失敗**。`No Keychain password item found for profile: ty-plus-notary` |
| `spctl --assess --type execute` | `rejected: source=Unnotarized Developer ID` |

したがって **macOSの release-trust 成果物は存在しない**。`signature-evidence.ts` は公証（`spctl`）を証拠の一部として要求するため、未公証では manifest を書けない（fail-closed、意図どおり）。

**解除に必要な本人操作は1つ**: `xcrun notarytool store-credentials ty-plus-notary`（Apple ID + app-specific password、または App Store Connect API key）。このホストには Apple の資格情報が存在しないことを確認済み（keychain 92項目を走査、`~/.appstoreconnect` 無し、`.p8` 無し）。notarytool 自体は Apple と通信できる（401 応答を確認）。

## 4. 更新検出の実証

実buildの注入値（`currentReleaseVersion=0.10.1-insider.1`）とfixtureで `checkForUpdate` を実行:

| ケース | 結果 |
| --- | --- |
| `0.10.0` / insider購読 | update-available → `0.10.1-insider.1` |
| `0.10.0` / stable購読 | unavailable（insiderは見えない） |
| `0.10.1-insider.1` / insider購読 | up-to-date |

## 5. 実機スモーク（macOS / AE 2026）

**development-unsigned ビルド**を実AEに導入して実施した。release-trust成果物が無いため、**この実機確認は正式配布物の証拠ではない**（その区別を曖昧にしない）。

環境: macOS、After Effects `26.5.3`（`app.version` は `27.0x78` を返す）、CEP PlayerDebugMode 有効。

`scripts/verify/device-smoke.ts`（新規、CDP経由で実パネルを検査）:

| 検査 | 結果 |
| --- | --- |
| panel mounted | PASS（`readyState=complete`、DOM 53,175 bytes、title=ty-plus） |
| loaded from the installed extension | PASS（`.../CEP/extensions/app.ty-plus/panel/index.html`） |
| CEP host bridge present | PASS（`platform=MacIntel`、`CSInterface=true`） |
| extendscript host responds | PASS（`app.version=27.0x78`） |
| host bundle loads in ExtendScript | PASS（`$.evalFile` 成功、`$.global.__TY_PLUS_HOST__` 設定） |
| no captured panel errors | PASS（0件） |

追加で確認したこと:

- パネルが日本語UIで起動し、オンボーディング10ステップを完了できた（「完了」で設定保存）。
- 設定が管理ルート `/Applications/Adobe After Effects 2026/ty-plus/settings/{app,paths,ui}.json` に永続化された。
- ExtendScript経由でユーザーデータ領域への書き込み・読み戻しが成功（probeは削除済み）。
- `operation-worker` が `Mach-O universal binary (x86_64 + arm64)` で実行可能。

**未実施**: 実AE上でのプリセット適用・レイヤー操作などの操作系シナリオ、Windows実機、AE再起動後のレイアウト復元の反復確認。これらは #10 のシナリオとして残る。

## 6. 検証中に見つけて修正した欠陥

いずれも再現テストを追加した。

1. **他platformのworkerが配布物に混入** — `dist/cep-dev/worker/versions/` はビルド間で蓄積するため、macOS用ZIPにWindowsの`.exe`（7.9MB）が入っていた。manifestが宣言するworkerだけを残すよう修正。
2. **古いZXPがそのまま梱包される** — `ZXPSignCmd` は既存出力を残すことがあり、Windows用ReleaseにmacOS workerを含む古いZXPが「現行ビルド」としてハッシュ検証を通っていた。署名前に出力を削除し、生成されなければ失敗するよう修正。
3. **同一版の再ビルドができない** — stagingディレクトリをマージしていたため、正当な再ビルドが「different bytes」で拒否された。ビルドごとに丸ごと書き換えるよう修正。
4. **既定TSAが検証不能** — DigiCert/Sectigo/Entrust は pinned Adobe signer (ZXPSignCmd 4.1.3) で `exit 35`。Apple TSA に変更（`ZXP_TIMESTAMP_URL` で上書き可）。
5. **クロスビルドのplatform判定が不統一** — verify gate がホストOSで判定し、Windows候補をmacOSとして検査していた。`build-platform.ts` に一本化。
6. **`package-cep-archive.ts` が import 時に `main()` を実行** — 他のscriptと不整合でテスト不能だった。

## 7. 署名基盤（継続利用）

- ZXP: `~/Library/Application Support/ty-plus-signing/ty-plus-release.p12`（自己署名、3650日、権限600）、パスワードはキーチェーン `ty-plus.zxp.signing`。詳細は `docs/operations/zxp-signing-identity.md`。
- 秘密値・パスワード・証明書はGitHub/Issue/commit/ログに書いていない。
- macOS: 既存の Developer ID Application を再利用（2027-11-22まで有効）。

## 8. CI

GitHub Actionsは課金停止で全jobが起動しない（ジョブが2秒で失敗、stepゼロ）。**CI緑は主張しない。** 代わりにローカルで `typecheck`（main/test/extendscript/release scripts）、`lint`、`check:boundaries`、`check:skills`、unit test を実行した。

## 9. 公開までに必要な本人操作

1. **macOS公証**: `xcrun notarytool store-credentials ty-plus-notary` を実行する（この後 `release:candidate` をmacOS向けに再実行すれば候補が完成する）。
2. **Windows実機スモーク**（任意だが推奨）: 生成済みZIP/ZXPをWindowsに導入し、パネル起動とworker動作を確認する。未実施ならリリースノートに「Windows実機未検証」と明記する。
3. **明示承認**: 対象releaseを名指しして、PR #57 のmerge / GitHub Release公開 / repo public化を承認する。
