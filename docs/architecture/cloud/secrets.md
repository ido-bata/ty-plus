# Secrets Management

ty-plus の project-managed secrets は self-hosted Infisical project `ty-plus` を正本とし、Windows native の開発環境と必要な trusted workflow から取得する。endpoint、Project ID、environment、Secret 名は公開 metadata である。

## Binding

Repository binding は [`.infisical.json`](../../../.infisical.json) を正とする。

| 項目 | 値 |
| --- | --- |
| Endpoint | `https://secrets.rebuildup.dev` |
| Project | `ty-plus` |
| Project ID | `4a42939b-5be2-47e7-8a23-f8931dfe2b1d` |
| Environment | `dev` |
| Secret paths | `/` and `/config` |

CLI command は endpoint、Project ID、environment を明示する。Cloud default、別 Project、OS に残った環境変数へ切り替えて続行しない。

## Secret schema

| Name | 種別 | 必須 | 用途 / consumer |
| --- | --- | --- | --- |
| `NOTION_TOKEN` | Secret | Yes | Notion API。`supabase/functions/typlus` Edge Function およびローカル Supabase Functions runtime |
| `SYNC_TOKEN` | Secret | Yes | 管理 sync endpoint の `x-sync-token` 認証。`supabase/functions/typlus` |
| `ZXP_CERT_PASSWORD` | Secret | Optional (signing only) | ZXP 証明書の署名。`bun run sign` |

`SUPABASE_SERVICE_ROLE_KEY` は Supabase が Edge Function runtime に供給する project runtime credential であり、Infisical の application-managed schema には複製しない。

## 公開ランタイム設定

次の public configuration も remote build / runtime から必要なため、Infisical の `/config` に置く。Secret ではないが、値は repository や `.env` に保存しない。

| Name | 必須 | 用途 / consumer |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | Supabase project endpoint。client build と API base の導出 |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase client の公開キー |

`/config` は Supabase Secret Sync の root `/` 対象外である。Supabase が管理する `SUPABASE_URL` などの Edge Function runtime values と衝突させない。Notion data source ID、bucket 名、API base URL は public configuration / identifier として扱い、それぞれの runtime が明示的に必要とする場合のみ別途 schema に追加する。

## Setup and use

`bun run setup` が一回のコマンドで `bun install --frozen-lockfile --ignore-scripts` と
self-hosted Infisical への CLI restore / login / doctor をまとめた entry point である。
新規 contributor と fresh agent はここから始める。

```bash
bun run setup
```

内部では次の順で進む。

1. `bun install --frozen-lockfile --ignore-scripts`（docs/architecture/storage/index.md が依存する install contract）
2. `scripts/infisical/setup.ts` が `.infisical.json` の binding を検証し、Infisical CLI を OS ごとに install して `infisical login --domain https://secrets.rebuildup.dev` を対話的に実行する
3. `bun run secrets:doctor` で binding / auth / runtime injection を検証する

OS 別の install 経路は次の通り。Linux は WSL (Debian/Ubuntu) を主対象とし、Fedora / Alpine など他 distribution は `secrets.md` を参照して手動 install する。

| OS | install command |
| --- | --- |
| Windows 10/11 | `winget install --id infisical.infisical --exact` |
| macOS | `brew install infisical/get-cli/infisical` |
| Linux / WSL (Debian/Ubuntu) | `curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' \| sudo -E bash && sudo apt-get update && sudo apt-get install -y infisical` |

`secrets:doctor` は CLI、repository binding、authentication、root Secret と `/config` 値の存在、および親 process の同名 environment variable を一度取り除いた runtime injection を検証する。value は出力しない。再実行（CLI が既にあり login 済み）では install / login を skip して doctor だけ走らせる。

login だけやり直したい、あるいは install を skip して Infisical 部分だけ実行したい場合は `bun run secrets:setup` を直接叩く。

```bash
bun run secrets:setup
```

一般の command は次の形で起動する。

```bash
bun run secrets:run -- <command> [arguments...]
```

ローカル Edge Function や build は `bun run secrets:run -- <command>` で起動する。wrapper は root `/` と `/config` の値を注入し、親 process に残る同名値を一時的に外して別の値へ黙って切り替わらないようにする。`.env` は使用しない。新しい値が必要なら、この schema と Infisical に用途を追加する。

## Install threat model

`secrets:setup` の install 経路は OS ごとに次の trust boundary を持つ。

| OS | install command | trust boundary |
| --- | --- | --- |
| Windows 10/11 | `winget install --id infisical.infisical --exact` | winget repository（Microsoft 配布） |
| macOS | `brew install infisical/get-cli/infisical` | Homebrew tap（公式リポジトリ） |
| Linux / WSL | `curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' \| sudo -E bash && sudo apt-get install -y infisical` | upstream CDN を root shell に pipe |

Linux の経路は canonical な curl-pipe-supply-chain で、artifacts-cli.infisical.com 側の DNS / TLS / 配布 host が侵害された場合に checksum / signature / hash pin 無しで root code execution を許す。同 endpoint が `.infisical.json` の `domain` と一致することは publish された metadata であり、workspace ID (`4a42939b-5be2-47e7-8a23-f8931dfe2b1d`) 自体は public な binding identifier に過ぎない。GitHub Actions には OIDC を貼らず、PR の workflow には secret を渡さない（[GitHub Actions](#github-actions) 参照）。CI / production host でこの threat を許容できない場合は次の checksum-verified 経路を使う。

### Checksum-verified install (Linux / WSL)

apt リポジトリではなく release artifact を直接 download して verify する。

```bash
set -euo pipefail
expected_sha="$(curl -fsSL https://artifacts-cli.infisical.com/infisical-linux-amd64.deb.sha256)"
curl -fsSL -o /tmp/infisical.deb https://artifacts-cli.infisical.com/infisical-linux-amd64.deb
actual_sha="$(sha256sum /tmp/infisical.deb | awk '{print $1}')"
[ "$actual_sha" = "$expected_sha" ] || { echo "checksum mismatch: $actual_sha"; exit 1; }
sudo dpkg -i /tmp/infisical.deb
```

`expected_sha` は release note か trusted operator が手元で確認した値を貼り付ける運用とし、repository 内に pinned しない（Infisical 側の release 頻度で commit が走るのを避ける）。Fedora / Alpine など他 distribution は公式の binary archive (`infisical-linux-amd64.tar.gz`) を同様に verify して `PATH` の通った場所に展開すればよい。

## Supabase Edge Functions

Supabase Edge Function の `NOTION_TOKEN` と `SYNC_TOKEN` は Infisical の Supabase Secret Sync で配布し、GitHub Actions を中継させない。Supabase app connection の Personal Access Token は Infisical にのみ保管する。Sync の対象はこの Project の ty-plus 関数に限定し、Supabase が管理する `SUPABASE_SERVICE_ROLE_KEY` は同期対象に含めない。

ローカル関数 runtime は `bun run secrets:run -- supabase functions serve typlus` で root `/` の Secret を使う。`/config` は local client/build configuration の注入先で、Supabase Edge Function Secret Sync には含めない。

## GitHub Actions

現行 `.github/workflows/ci.yml` は lint / build / test と unsigned native worker verification のみを行い、Secret を参照しない。`pull_request` workflow に Secret を渡さず、Supabase の Secret 配布は native Sync が担うため、GitHub Actions と Infisical 間に machine identity を設定しない。信頼済み GitHub deployment consumer を追加する場合は、Infisical OIDC で Project / environment / path を限定し、untrusted PR から実行できない境界を維持する。

GitHub repository に残る Secret は workflow 上で参照されない限り legacy configuration とする。削除前に workflow / script の参照がないことと、Infisical runtime path の動作を確認する。
