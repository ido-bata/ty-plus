# リリース候補の検証記録（0.10.0-insider.3）

- Status: ローカル検証済み / release-trust（署名・公証）未実施
- 対象: #55 / PR #56 / `release-0-10-1`
- 正本: `docs/operations/release-runbook.md`（手順）、`docs/adr/ADR-0004-github-release-channels.md`（channel契約）
- この記録は**公開の承認ではない**。GitHub Release作成・tag作成・repo public化は本人の明示承認まで実行しない。

## 1. 生成した成果物

コマンド（`package.json` の `version` は `0.10.0` のまま、配布版だけを insider にする）:

```sh
TY_PLUS_RELEASE_VERSION=0.10.0-insider.3 bun run build:cep:dev
bun run verify:online-gateway:package -- --trust-mode=development-unsigned --product-version=0.10.0
bun run scripts/package/package-cep-archive.ts zip
TY_PLUS_RELEASE_VERSION=0.10.0-insider.3 TY_PLUS_RELEASE_CHANNEL=insider \
  bun scripts/package/release-manifest.ts \
  --trust-mode=development-unsigned --artifact=dist/app.ty-plus.zip
```

| 項目 | 実測値 |
| --- | --- |
| sourceCommit | `66b184164f442f00cd293fc8a351c7e9d5d29a89` |
| version（CEP数値版） | `0.10.0` |
| releaseVersion（配布版） | `0.10.0-insider.3` |
| channel | `insider` |
| trustMode | `development-unsigned`（**release-trustではない**） |
| zip | `dist/app.ty-plus.zip` / sha256 `3f2207074f532dee2aaa3f33b3cd3c1367a07b96916a3673cd4dc9df7cc0c1c8` / 14,108,205 bytes |

zip内の確認（実バイト）: `app.ty-plus/jsx/ty-plus-host.jsx`、`LICENSE`、`THIRD-PARTY-NOTICES.md`、`CSXS/manifest.xml`（`ExtensionBundleVersion="0.10.0"`）、`worker/versions/<sha>/macos/operation-worker`（13,079,664 bytes）。

## 2. 配布物監査（release信頼に読み替えた場合の機構確認）

`verify-release-artifacts.ts` の全検査を、上記zipと別途ZXP署名した実artifactに対して実行し、PASSを確認した。

- `trustMode=release` / `sourceCommit`=`HEAD` / artifact sha256一致
- pack内の LICENSE / THIRD-PARTY-NOTICES.md / `jsx/ty-plus-host.jsx`
- CEP `ExtensionBundleVersion` と manifest `version` の一致
- panel bundleの**注入binding**が `releaseVersion` / `channel` と一致（minified形 `isReleaseChannel(\`insider\`)?...` を読む）
- ZXP署名検証（`ZXPSignCmd -verify`）
- worker manifestが `trust.mode=release`、macOS workerはOS署名証拠あり、WindowsはADR-0003により未署名を許容
- secret patternなし

反例も確認済み: ZXP欠落 / worker manifest欠落 / `signature:{}` / 非release trust / channel drift / version drift は**すべて失敗**する（fail-closed）。Windows未署名のみが正当に通過する。

## 3. 更新検出の実証（同一数値コアの連番）

実buildの注入値（`currentReleaseVersion=0.10.0-insider.3`）とfixtureのRelease一覧で `checkForUpdate` を実行:

| ケース | 結果 |
| --- | --- |
| insider `.1` から `.2` を検出 | update-available → `0.10.0-insider.2` |
| insider `.2` が最新 | up-to-date |
| beta `.1` から `.2` を検出 | update-available → `0.10.0-beta.2` |
| beta購読者がinsiderのみ存在 | unavailable（降格しない） |
| insider `.4` からstableへ変更 | up-to-date（自動ダウングレードしない） |

CORS: `api.github.com` は 200/404 の双方で `access-control-allow-origin: *` を返すことを実測。private repoでは匿名APIが404になり、fail-softで `unavailable` になる（設計どおり）。

## 4. 未実施（release-trust）

**署名済み配布物は生成していない。** 理由は環境側の未充足であり、実装の欠陥ではない。

- macOS: `notarytool` のkeychain profileが未設定。Developer ID Application identity（`Yusuke Kimura (JK49RJ2CK2)`、2027-11-22まで有効）は存在するが、公証profileが無いため `build-release.ts` は**ビルド開始前に拒否**する（実測: `macOS notarization is not configured`）。
- ZXP署名証明書: 発行主体が未確定（#32）。Infisicalのdev環境には `ZXP_CERT_PASSWORD` 等の署名素材が無い。`ZXPSignCmd` による署名・検証の**機構**はmacOS実機で実証済み（自己署名の使い捨て証明書、`Signature verified successfully`）。
- Windows: このホスト（macOS）ではWindows配布候補を生成できない。CIの `release-trust-windows-candidate` jobは課金停止で実行できていない。
- 実機（#10のD-01〜D-20）は未実施。

## 5. CI

GitHub Actionsは課金停止（`The job was not started because recent account payments have failed or your spending limit needs to be increased`）で全jobが起動しない。**CI緑は主張しない。** 代わりにローカルで `typecheck`（main/test/extendscript/**release scripts**）、`lint`（biome / i18n / static guardrail / storage split）、`check:boundaries`、unit test 2,971件を実行した。

唯一の失敗は `src/management/debug/console/interceptor-session.test.ts` のtimeout 1件で、これは**変更前の `main` でも同一に失敗**する既存のflaky test。本PRの差分はこのファイルに触れていない。

## 6. 公開までに必要な本人操作

1. macOS公証: `xcrun notarytool store-credentials ty-plus-notary`（`docs/operations/signing-setup.md`）。
2. ZXP署名証明書と発行主体の確定（#32）。`TY_PLUS_ZXP_CERT_PATH` / `TY_PLUS_ZXP_CERT_PASSWORD` を用意する。
3. Windows実機または復旧したCIでWindows配布候補を生成する。
4. `bun run release:candidate --channel=<ch> --release-version=<ver>` でrelease-trust候補を生成し、`release:verify` のPASSを確認する。
5. #10の実機ゲートを実施し、結果を記録する。
6. **明示承認**のうえで、GitHub ReleaseをDraft作成→公開、release PRをmainへmerge、repoをpublic化する。
