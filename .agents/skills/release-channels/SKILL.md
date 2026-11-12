---
name: release-channels
description: ty-plusのStable / Beta / Insider候補を作成・レビュー・ビルド・署名・監査・公開・公開後検証・復旧する時に使用する。リリース実行やリリースノート作成、Insiderの繰り返し発行、配布物の整合性確認を含む。
---

# Release Channels

ty-plusの配布は**GitHub Releasesを唯一の正本**とする（ADR-0004）。このSkillは「1つのreleaseVersionを、どのchannelとして、どの成果物で出し、何を検証してから公開するか」を一貫して扱う。仕様を再定義しない。次を正本として参照する。

| 知りたいこと | 正本 |
| --- | --- |
| channel / tag / prerelease / asset名の契約 | `docs/adr/ADR-0004-github-release-channels.md` |
| 更新クライアントの挙動と制約 | `docs/architecture/feeds.md` |
| 署名trust model、platform非対称、fail-closed配線 | `docs/architecture/distribution.md` |
| 実行手順の正本 | `docs/operations/release-runbook.md` |
| 署名・公証の環境設定 | `docs/operations/signing-setup.md` |
| 実機ゲートのシナリオ | `docs/verification/r0-device-gate.md`（#10） |
| 配布・更新のユーザー向け説明 | `docs/user-guide/installation/index.md` |

このSkillが持つのは**判断の順序と、そこで止める条件**だけである。tag文法・asset命名・channel購読規則は `scripts/package/release-version.ts` と `src/management/online/update/channel.ts` が実装する唯一の定義であり、Skillやrunbookへコピーしない。

## 0. 鉄則

- **公開は本人の明示承認が唯一の解除条件。** Draft作成・公開・tag作成・asset upload・repo public化は、その時点の会話で対象releaseを名指しした承認がなければ実行しない。「リリースまで進めて」は公開許可ではない。
- **未充足をPASSと呼ばない。** 署名なし・公証なし・実機未検証・CI未実行は、それぞれ「未充足」と記録する。development-unsignedのリリース緑はrelease-trustの証拠ではない。
- **channelはversionから導出する。** operatorがchannelとtagを別々に指定して食い違わせることはできない（`assertReleaseIdentity`が拒否する）。GitHubの`prerelease`フラグもchannelから導出する。
- **数字を手で作らない。** tag・asset名・sha256・versionは必ずコマンドの出力から写す。

## 1. 候補を作る

数値CEP版と配布版を分けて決める。

- `package.json.version` は数値 `X.Y.Z` のまま。CEP `ExtensionBundleVersion` はこれしか表現できない。
- 配布版 `releaseVersion` は `X.Y.Z` / `X.Y.Z-beta.N` / `X.Y.Z-insider.N`。数値コアは必ず `package.json.version` と一致させる。
- Insiderを繰り返すときは**数値コアを据え置き、連番だけ進める**（`0.11.0-insider.1` → `.2`）。これが「同じ数値版でも次のPreviewを検出できる」条件である。

1コマンドでビルド・監査・stagingまで進む（公開はしない）。

```sh
bun run scripts/package/build-github-release.ts \
  --channel=insider --release-version=0.11.0-insider.1
```

このコマンドは `build-release.ts` → `verify-release-artifacts.ts` → `prepare-github-release.ts` を順に実行し、途中で失敗したら止まる。channelとtagが食い違う、数値コアが `package.json` と違う、hostがWindows/macOSでない、のいずれでも**ビルドを始める前に**拒否する。

## 2. platformごとの前提を確認する

同じreleaseでもplatformで要求が違う（ADR-0003）。**片方の成功をもう片方の証拠にしない。**

| | Windows | macOS |
| --- | --- | --- |
| worker binaryのOS署名 | **不要**（未署名がR0の正当な形。整合性はmanifestのsha256 pin） | **必須**（Developer ID署名 + 公証） |
| 必要な環境変数 | `TY_PLUS_ZXP_CERT_PATH` / `TY_PLUS_ZXP_CERT_PASSWORD` | 上記 + `TY_PLUS_SIGN_IDENTITY` / `TY_PLUS_NOTARY_PROFILE` |
| 未設定時の挙動 | ZXP未設定なら拒否 | 署名・公証いずれか未設定なら**ビルド前に**拒否 |

環境変数の作り方は `docs/operations/signing-setup.md`。**secret値をSkill・Issue・commit・ログへ書かない。**

## 3. 成果物を監査する

`verify-release-artifacts.ts` が次を実測で確認する。ここを飛ばして「ビルドが通った」を成果物の証拠にしない。

- manifestの `trustMode` が `release` であること
- `sourceCommit` が現在の `HEAD` と一致すること（別のバイトを保証していないこと）
- 各artifactのsha256がディスク上の実バイトと一致すること
- packに `LICENSE` / `THIRD-PARTY-NOTICES.md` があること
- packに `jsx/ty-plus-host.jsx` があること（無いと全host操作が実行時に失敗する）
- packの `ExtensionBundleVersion` がmanifestの `version` と一致すること
- panel bundleが更新contractと `releaseVersion` / `channel` を埋め込んでいること
- packにsecretパターンが無いこと

失敗したら**成果物を再生成する**。manifestだけ書き換えない。

## 4. 公開前の確認

本人へ渡す前に、次を一続きで確認する。

1. `dist/github-release/` の3ファイル（zip / zxp / manifest）が揃っている。
2. manifestの `sourceCommit` / `releaseVersion` / `channel` / sha256 が意図した値である。
3. ZXPの署名検証が通っている（`build-release.ts` が `-verify` を実行済み）。
4. macOSは `spctl --assess --type execute` と `codesign --verify --strict` の証拠がある。
5. 実機（#10）で起動・主要操作・保存/復元を確認済み、または**未実施と明記**する。
6. 欠けているplatformがあれば、リリースノートに明記する（WindowsだけのInsiderは「macOS未提供」と書く）。

両platformを同じReleaseに入れる場合、`sourceCommit` / `releaseVersion` / `channel` が一致していることを確認する。**一致しない成果物を1つのReleaseに混ぜない。**

## 5. 公開（本人承認後のみ）

`docs/operations/release-runbook.md` §5 の手順に従う。守ること。

- Draftで作り、`prerelease` はchannelから導出した値（stable=false / beta・insider=true）を使う。
- `--target` は**release merge commitのSHA**。tagが別SHAを指したら上書きしない。
- `make_latest` はStable以外で使わない。
- 既存tagを付け替えない。同じtagへ追加する場合も `sourceCommit` を照合する。
- Private repoのままでは匿名APIが404になり、利用者の更新確認は動かない。**公開順序（repo public化 → Release公開）を意識する。**

## 6. 公開後の検証

1. `/repos/ido-bata/ty-plus/releases/tags/<tag>` で `draft=false` / `prerelease` / asset名 / asset digest を確認する。
2. assetを実際に再取得し、sha256が添付manifestと一致することを確認する。
3. 旧版から更新確認が新versionを検出することを確認する（同一数値コアの連番を含む）。
4. 導入・起動・ユーザーデータ保持を実機で確認する。

## 7. 失敗時の復旧

**公開後に壊れた成果物を見つけた場合、同じtagを書き換えない。** 次の順で判断する。

| 症状 | 対応 |
| --- | --- |
| assetのsha256がmanifestと違う | そのReleaseを更新対象から外す（draftへ戻す／asset削除）。同じtagで再uploadしない。修正版を**新しい連番**で出す |
| ZXP署名検証が落ちた | 公開しない。証明書設定を確認し、成果物を再生成する |
| macOS公証が未設定 | ビルドは拒否される。`signing-setup.md` の本人操作を待つ。**公証なしを配布可と呼ばない** |
| manifestの `sourceCommit` がHEADと違う | ビルド後にcommitした。成果物を再生成する |
| channelとtagが食い違う | 環境変数の取り違え。ビルド前に拒否されるので、正しい `releaseVersion` で再実行する |
| CIが課金等で実行できない | ローカルの再現可能な検証を進め、**未実施のCIだけを明示**する。緑と主張しない |

復旧後は、どのReleaseが有効かをリリースノートとIssueへ記録する。

## 8. 配布先・インストーラを増やすとき

channelの概念を再実装しない。拡張点は2つだけである。

- **成果物のidentity**: `scripts/package/release-version.ts`（tag・asset名・platform）
- **購読の意味**: `src/management/online/update/channel.ts`（どのchannelがどれを受信するか）

インストーラ形式を増やすならasset名の導出を `release-version.ts` に足し、配布元を増やすなら更新providerを追加する。Skill・runbook・各scriptへtag文法を書き写さない。
