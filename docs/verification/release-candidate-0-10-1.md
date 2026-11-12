# リリース候補の検証記録（v0.10.1 / Stable）

- Status: **Windows配布候補は release-trust で完成 / macOSは公証未設定のため未完成**
- 対象: #58（進行正本）/ PR #57 / `release-0-10-1`
- 正本: `.agents/skills/release-channels/SKILL.md`、`docs/operations/release-runbook.md`、ADR-0003/0004
- この記録は**公開の承認ではない**。GitHub Release作成・tag作成・repo public化は本人の明示承認まで実行しない。

## 1. 版の確定

| 項目 | 値 |
| --- | --- |
| CEP数値版（`package.json.version`） | `0.10.1` |
| 配布版（`releaseVersion`） | `0.10.1` |
| GitHub tag | `v0.10.1` |
| channel / prerelease | `stable` / `false` |
| 衝突確認 | 既存tag 0件、既存Release 0件 |

Insider（`0.10.1-insider.1`）とは**別の成果物**である。Insider候補をStableへ流用していない（`channel=stable`、tagが`v0.10.1`、ハッシュが異なる）。

## 2. Windows配布候補（完成）

macOSホストで `cargo xwin`（MSVCツールチェーン）によりクロスコンパイル。WindowsはAuthenticode不要（ADR-0003）。

```sh
CROSS_COMPILE_CARGO="cargo +1.89.0 xwin" \
TY_PLUS_BUILD_PLATFORM=windows \
TY_PLUS_RELEASE_VERSION=0.10.1 TY_PLUS_RELEASE_CHANNEL=stable \
TY_PLUS_ZXP_CERT_PATH="$HOME/Library/Application Support/ty-plus-signing/ty-plus-release.p12" \
TY_PLUS_ZXP_CERT_PASSWORD="$(security find-generic-password -s 'ty-plus.zxp.signing' -w)" \
ZXP_SIGN_CMD="$PWD/.tmp/zxp/ZXPSignCmd" \
bun run release:candidate --channel=stable --release-version=0.10.1
```

| 項目 | 実測値 |
| --- | --- |
| sourceCommit | `40791874c2633b3c13a89ad63d4ca3037dd29dfd` |
| trustMode | `release` |
| ZIP | `ty-plus-v0.10.1-windows.zip` / sha256 `bef0cf3badef1d8b10b965f9eb3acc168b83dc2ea936a5b17829721dfd1392a2` / 11,026,352 bytes |
| ZXP | `ty-plus-v0.10.1-windows.zxp` / sha256 `7c0bd96c4cf5aa5f69808e1d6b8fa1068d64716720997d97a3a9d12fe3a769a0` / 11,044,912 bytes |
| worker | `windows/operation-worker.exe`（PE32+ x86-64、7,907,328 bytes、sha256 `d73edf6d23c3e6890583377dbf964c02c9575ba7b1c9967eaa32b1e79d99291a`） |
| ZXP署名 | `ZXPSignCmd -verify` → `Signature verified successfully` |

実測で確認した内容:

- ZIP: `LICENSE` / `THIRD-PARTY-NOTICES.md` / `jsx/ty-plus-host.jsx` / `CSXS/manifest.xml`（`ExtensionBundleVersion="0.10.1"`）/ `windows/operation-worker.exe`
- ZXP: **Windows workerのみ**（macOS workerを含まない）。ZIPとハッシュが異なる
- panel bundleの注入binding: `currentReleaseVersion=0.10.1` / `buildReleaseChannel=stable`
- 監査（`verify-release-artifacts.ts`）全項目PASS

> **tag target**: この成果物の `sourceCommit` は `40791874c2633b3c13a89ad63d4ca3037dd29dfd`。GitHub Release作成時は `--target 40791874c2633b3c13a89ad63d4ca3037dd29dfd` を指定し、**tagと成果物の `sourceCommit` を一致させる**。この記録docの後続commitはdocsのみで、成果物のバイトに影響しない。

## 3. macOS（未完成 — 公証資格情報が無い）

| 段階 | 結果 |
| --- | --- |
| Developer ID署名（`codesign`） | **成功**。`Authority=Developer ID Application: Yusuke Kimura (JK49RJ2CK2)`、hardened runtime |
| `codesign --verify --strict` | **成功** |
| 公証（`notarytool submit`） | **失敗**。`No Keychain password item found for profile: ty-plus-notary` |
| `spctl --assess --type execute` | `rejected`（Unnotarized Developer ID） |

`signature-evidence.ts` は公証（`spctl`）を証拠の一部として要求するため、未公証ではrelease manifestを書けない（fail-closed、意図どおり）。**macOSのrelease-trust成果物は存在しない。**

解除に必要な本人操作は1つ: `xcrun notarytool store-credentials ty-plus-notary`（Apple ID + app-specific password、または App Store Connect API key）。

## 4. Stable利用者の更新検出

`v0.10.1`（prerelease=false）のみがある状態で `checkForUpdate` を実行:

| 現在版 / 購読channel | 結果 |
| --- | --- |
| `0.10.0` / **stable** | update-available → `0.10.1` |
| `0.10.0` / beta | update-available → `0.10.1` |
| `0.10.0` / insider | update-available → `0.10.1` |
| `0.10.1` / stable | up-to-date |
| `0.10.2` / stable | up-to-date（降格しない） |

**Stable利用者が `v0.10.1` を検出できることを実証済み。**

## 5. 実機スモーク（macOS / AE 2026）

development-unsignedビルドを実AEに導入して実施。**release-trust成果物が無いため、この実機確認は正式配布物の証拠ではない**（その区別を曖昧にしない）。

環境: macOS、After Effects `26.5.3`、CEP PlayerDebugMode 有効。

`scripts/verify/device-smoke.ts`（CDP経由で実パネルを検査）— **再起動後も含め2回実施し、いずれも全項目PASS**:

| 検査 | 結果 |
| --- | --- |
| panel mounted | PASS（`readyState=complete`、DOM 55,990 bytes、title=ty-plus） |
| loaded from the installed extension | PASS |
| CEP host bridge present | PASS（`platform=MacIntel`、`CSInterface=true`） |
| extendscript host responds | PASS（`app.version=26.5.3x9`） |
| host bundle loads in ExtendScript | PASS（`$.evalFile` → `$.global.__TY_PLUS_HOST__` 設定） |
| no captured panel errors | PASS（0件） |

追加で確認したこと（実AE操作）:

- 設定ダイアログをメニューから開き、**更新タブに「更新チャンネル: 安定版」「インストール済みリリース: 0.10.1」**が表示されることを確認。
- チャンネルを `安定版` → `インサイダー版` → `安定版` と変更し、その都度 `settings/app.json` の `ui.updateChannel` がディスクへ永続化されることを確認（`version: 2` も書き込まれる）。
- 管理ルートへマーカーファイルを書き、**AEを終了・再起動した後もマーカーと `updateChannel: stable` が保持されている**ことを確認（ユーザーデータ保持）。
- `operation-worker` が `Mach-O universal binary (x86_64 + arm64)` で実行可能。

**未実施**: プリセット適用・レイヤー操作などの操作系シナリオ、Windows実機、AE再起動後のレイアウト復元の反復確認。これらは #10 のシナリオとして残る。

## 5b. 独立レビューで見つけて修正した欠陥（再現テスト付き）

リリース前に独立レビューを実施し、監査の抜けを4件修正した。いずれも「壊れた成果物がPASSする」方向の欠陥。

1. **古いZIP/ZXPが監査を通過** — 監査はartifactのハッシュだけを検証し、中身が監査済みpackと同一かを見ていなかった。**有効な署名を持つ古いZXP**を差し替え、manifestのハッシュを記録し直すとPASSしていた。アーカイブを開いてpackと1ファイルずつバイト比較するよう修正（実測: `archive differs from the audited pack: app.ty-plus/CSXS/manifest.xml` で拒否）。
2. **platform名と中身の不一致** — staging時のplatformを `dist/cep-dev`（最後に走ったビルド）から読んでいたため、packがWindowsでも`-macos`名で配置され得た。**出荷するpack内のmanifest**から読むよう修正し、artifact名とpackのplatformが一致することを監査で検証。
3. **埋め込みidentityが最初の一致しか見ていなかった** — 古いchunkが先頭にあると、実際に読み込まれるchunkの不一致を隠せた。全出現が一致することを要求するよう修正。
4. **secret scanが出荷ファイルを飛ばしていた** — 拡張子allowlistのため `LICENSE` / `.debug` / `*.map` が対象外だった。ファイル名ではなく**内容**（先頭8KiBのNULバイト）でbinaryを判定するよう修正。

回帰テストを追加し、実artifactに対して修正が効くことを確認済み。

## 6. 署名基盤（継続利用）

- ZXP: `~/Library/Application Support/ty-plus-signing/ty-plus-release.p12`（自己署名、3650日、権限600）、パスワードはキーチェーン `ty-plus.zxp.signing`。初回Insiderから同一証明書を継続利用している。詳細は `docs/operations/zxp-signing-identity.md`。
- 秘密値・パスワード・証明書はGitHub/Issue/commit/ログに書いていない。
- macOS: 既存の Developer ID Application を再利用（2027-11-22まで有効）。新しい証明書の購入・取得は行っていない。

## 7. CI

GitHub Actionsは課金停止で全jobが起動しない。**CI緑は主張しない。** ローカルで typecheck / lint / boundaries / skills / unit test を実行する。

## 8. 公開までに必要な本人操作

1. **macOS公証**（macOSを今回のReleaseに含める場合のみ）: `xcrun notarytool store-credentials ty-plus-notary` を実行する。実行後、macOS候補を生成・監査できる。
2. **Windows実機スモーク**（任意）: 生成済みZIP/ZXPをWindowsに導入し、起動とworker動作を確認する。未実施ならリリースノートに明記する（記載済み）。
3. **明示承認**: 対象releaseを名指しして、PR #57 のmerge / GitHub Release公開 / repo public化を承認する。
