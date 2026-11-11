# 正式署名・公証のための本人操作手順（Issue #32）

- Status: 実装済み（fail-closed配線は PR #48 / #49）。実行は証明書の取得・設定が完了した後（本人操作）。
- 正本: 本doc / `docs/architecture/distribution.md`（trust model）/ `docs/operations/release-runbook.md`（リリース手順）
- この文書は **証明書の購入・取得・公開を指示しない**。取得は本人の決定と承認に従う。

## 前提（実装済み、コード変更不要）

- 署名は環境変数で設定する。コードは設定を読むだけで、証明書の値を持たない。
- worker binaryのOS署名: `scripts/package/sign-worker.ts`（証明書store参照 `TY_PLUS_SIGN_CERT_SHA1` を優先、PFXは代替。設定なしでは何も生成する前に拒否する）。
- ZXP署名: `scripts/package/sign-zxp.ts`（`TY_PLUS_ZXP_CERT_PATH` / `TY_PLUS_ZXP_CERT_PASSWORD`、release-trustでは自己署名へのfallbackを拒否）。
- notarization: `notarytool submit`（zip提出 — bare Mach-Oは受理形式外）+ `spctl --assess --type execute` で証拠取得。
- 検証: `bun run scripts/package/build-release.ts` が全工程を実行し、fail-closedに拒否することをCIの `release-trust-gate-refusal` jobが検証する。

## 1. macOS（Developer ID署名 + 公証）

1. **Apple Developer Programへの加入**（個人名義。公開価格 $99/年 — 価格は要確認）。
2. Xcodeまたは[developer.apple.com](https://developer.apple.com/account/resources/certificates)で **Developer ID Application証明書** を作成する（キーチェーンに取り込まれる）。
3. 署名identityの確認:
   ```sh
   security find-identity -v -p codesigning | grep "Developer ID Application"
   ```
4. notarytool用keychain profileを一度だけ作成する:
   ```sh
   xcrun notarytool store-credentials ty-plus-notary
   ```
   （App Store Connect API key または Apple IDで認証。profile名は `TY_PLUS_NOTARY_PROFILE` の値と一致させる）
5. 環境変数の設定（`.env` またはシェル。リポジトリにcommitしない）:
   ```sh
   export TY_PLUS_SIGN_IDENTITY="Developer ID Application: <本人名義> (<TEAMID>)"
   export TY_PLUS_NOTARY_PROFILE="ty-plus-notary"
   ```
6. 実行: `bun run scripts/package/build-release.ts` → `signature-evidence.ts` が署名済みbinaryから証拠（CDHash / 証明書fingerprint）を読み戻し、release trust manifestに記録する。

## 2. Windows（Authenticode署名）

1. コード署名証明書を取得する。選択肢は #32 の判断資料を参照（OV: 低コスト、SmartScreenの評価期間あり / EV: SmartScreen即時評価、ハードウェアトークン必須でCI自動化に工作が必要。価格・個人名義での取得可否は要確認）。
2. **推奨: 証明書storeへインポート** し、SHA-1 thumbprintを控える（パスワードがプロセス引数に現れない）:
   ```powershell
   certutil -user -importPFX PFX <path-to-pfx>
   certutil -user -store My   # thumbprintを確認
   ```
   ```sh
   export TY_PLUS_SIGN_CERT_SHA1="<40桁のthumbprint>"
   ```
3. PFXファイルを使う場合（代替。signtoolの仕様上パスワードがプロセス引数に現れる — 実行中は他プロセスから見える）:
   ```sh
   export TY_PLUS_SIGN_PFX_PATH="<path-to-pfx>"
   export TY_PLUS_SIGN_PFX_PASSWORD="<password>"
   ```
4. signtoolの所在（Windows SDKに同梱）:
   ```sh
   export TY_PLUS_SIGN_TOOL_PATH="C:/Program Files (x86)/Windows Kits/10/bin/<ver>/x64/signtool.exe"
   ```
5. 実行: `bun run scripts/package/build-release.ts` → Authenticode署名 → `Get-AuthenticodeSignature` probeで証拠を読み戻す。

## 3. ZXP署名

1. ZXP署名証明書を用意する（自己署名でもZXPインストーラは受け入れる — PlayerDebugMode不要。発行者表示は検証されない。認証局署名は費用に見合う信頼性表示）。
2. 環境変数の設定:
   ```sh
   export TY_PLUS_ZXP_CERT_PATH="<path-to-p12>"
   export TY_PLUS_ZXP_CERT_PASSWORD="<password>"
   ```
3. `TY_PLUS_ZXP_CERT_PATH` は **自己署名開発証明書（`dist/certs/ty-plus-self-signed.p12`）以外** を指定する。release-trustビルドは自己署名defaultへのfallbackを拒否する。
4. macOSではZXPSignCmd実行体の指定が必要（同梱バイナリはWindows x64のみ）:
   ```sh
   export ZXP_SIGN_CMD="/path/to/ZXPSignCmd"
   ```
5. 検証: `verifyZxp`（`ZXPSignCmd -verify`）が署名済みZXPのembedded signatureを検証する。

## 4. Extension ID（確定済み — 追加操作なし）

- `app.ty-plus` を2026-11-11に本人確定（#32）。実manifest・検証・ドキュメントはこの値で統一済み。
- 残る検証のみ: 既存インストール（Log!N由来IDの旧版）からの上書きインストール時に、旧IDの拡張が残存しないことと、新IDのpanelが起動すること — **#10の実機ゲート（11/29）で実施する**。

## 5. 未解決の本人判断（公開ブロッカー、変更なし）

| 項目 | 判断内容 |
| --- | --- |
| Windows証明書 | OV / EVの選択、取得方法、署名者名義（#32の判断資料参照） |
| macOS | Developer Program加入（$99/年 — 要確認）、Developer ID証明書の発行 |
| ZXP署名 | 自己署名で開始するか、認証局署名を取得するか、発行者名義 |

証明書の購入・取得は **本人の承認と実行** に委ねる。この文書の手順は、取得後に同じコード経路で実行できる状態を保証する。

## 6. 実行順序（証明書設定後）

1. `bun run scripts/package/build-release.ts`（worker OS署名 + ZXP署名 + verify gate + secret検査 + zip + release manifest）
2. `bun run scripts/verify/verify-release-artifacts.ts`（manifestのsha256再計算・HEAD一致・pack走査・notices同梱確認）
3. 実機ゲート（#10、11/29枠）: D-01〜D-15を検証対象ビルドで実施
4. 公開判断（#1、11/30 Go/No-Go）— **本人の明示的承認ゲート**
