# ZXP署名の長期運用（ty-plus release signing）

- Status: 初回Insider用の署名主体を確立済み（2026-11-12）
- 正本: 本doc / `docs/operations/signing-setup.md`（設定手順）/ `docs/architecture/distribution.md`（trust model）
- 対象: GitHub Releasesで配布するZXPのAdobe署名。worker binaryのOS署名とは独立した契約（ADR-0003）。

## 1. 決定

初回無料OSS Insider以降、**同じ自己署名証明書を継続利用する**。更新のたびに作り直さない。
理由: Adobe ZXP署名の発行者表示は検証されないが、更新で主体が変わると利用者側の信頼判断の材料が失われ、
将来認証局署名へ移行する際の比較基準もなくなるため。

| 項目 | 値 |
| --- | --- |
| 証明書ファイル | `~/Library/Application Support/ty-plus-signing/ty-plus-release.p12` |
| 形式 | PKCS#12、自己署名、`ZXPSignCmd -selfSignedCert` |
| subject | `CN=ty-plus, O=ty-plus, L=Tokyo, ST=Tokyo, C=JP`、`ty-plus release signing` |
| 有効期間 | 3650日（発行 2026-11-12） |
| パスワード保管 | ログインキーチェーン `ty-plus.zxp.signing`（account `rebui`） |
| ファイル権限 | `600`（所有者のみ） |

**秘密値・パスワード・証明書そのものをGitHub・Issue・commit・ログへ書かない。** 本docはパスのみを持つ。

## 2. 利用

```sh
export TY_PLUS_ZXP_CERT_PATH="$HOME/Library/Application Support/ty-plus-signing/ty-plus-release.p12"
export TY_PLUS_ZXP_CERT_PASSWORD="$(security find-generic-password -s 'ty-plus.zxp.signing' -w)"
```

- macOSではZXPSignCmd実行体も必要（同梱バイナリはWindows x64のみ）:
  ```sh
  export ZXP_SIGN_CMD="/path/to/ZXPSignCmd"
  ```
- release-trustビルドは自己署名の自動生成へfallbackしない。パスが違えば拒否する。

## 3. タイムスタンプ（TSA）

pinned Adobe signer（ZXPSignCmd 4.1.3）が現在検証できるTSAは**Apple**のみである。

- 既定: `http://timestamp.apple.com/ts01`（`scripts/package/sign-zxp.ts`）
- DigiCert / Sectigo / Entrust は 2026-11-12 時点で `exit 35`（timestamp could not be verified）で署名を中断する
- 別TSAを使う場合は `ZXP_TIMESTAMP_URL` で明示する。検証できないTSAを既定に戻さない

## 4. バックアップと復元

- `.p12` とパスワードを**別々の安全な場所**へ保管する（このMacの故障に備える）。
- 復元は `.p12` を同じパスへ置き、キーチェーン項目 `ty-plus.zxp.signing` を作り直す。
- 証明書を作り直した場合は、その事実と日付を本docへ追記する。以後の更新は新しい証明書で行う。
- 認証局署名へ移行する場合は、`TY_PLUS_ZXP_CERT_PATH` を差し替えるだけで同じ経路を使う（コード変更不要）。

## 5. 検証

署名後、`build-release.ts` が `ZXPSignCmd -verify` を実行し、`verify-release-artifacts.ts` が監査時に**再度**検証する
（ビルド後に差し替えても前の判定を継承しない）。検証にパスワードは不要。
