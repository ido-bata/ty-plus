# 公式WebサイトのCloudflare Workersデプロイ

`apps/web`（TanStack Start）の **Cloudflare CLI (`cf`)** による Workers + Static Assets デプロイの正本。方針は [ADR-0007](../../adr/ADR-0007-official-web-platform.md)、費用は [cost-gate.md](../cost-gate.md)、秘密値は [secrets.md](secrets.md) に従う。

## 構成

| 項目 | 契約 |
| --- | --- |
| Framework | TanStack Start（`@tanstack/react-start`） |
| Build | Vite 8 + `@cloudflare/vite-plugin` v2 RC（`viteEnvironment.name = "ssr"`） |
| Deployment CLI | Cloudflare `cf` 1.0 RC。Wrangler deploy は使用しない |
| Worker config | `apps/web/cloudflare.config.ts`。entrypoint は `@tanstack/react-start/server-entry` |
| Build Output | `apps/web/.cloudflare/output/v1/`（`cf build` で生成） |
| Static assets | Vite client build + prerendered HTML。assets directory を config に手動指定しない |
| Origin | 当面 `workers.dev`。独自ドメインなし |
| Release permissions | previewは独立Worker。production初回公開・変更は明示的な承認が必要 |

`cf` は **Node.jsランタイム** で実行する。Bunは依存関係導入・Viteビルド用として利用できるが、`bun --bun cf` のようにCLI本体をBunで実行しない。repository内のバージョンを使うため `npm exec --no -- cf ...` とする。

## 環境

| 対象 | モード | Worker name | 公開 |
| --- | --- | --- | --- |
| local | `development` | `ty-plus-web` | Vite/workerdのみ |
| preview | `preview` | `ty-plus-web-preview` | 別 `workers.dev` Worker |
| production | `production` | `ty-plus-web` | 正式な `workers.dev` Worker |

`cf` の `--mode` は旧 Wrangler の `--env` と異なる。`cloudflare.config.ts` はモードごとに独立した完全設定を返す。既存Worker名・互換日付・`nodejs_compat` を変更する際は別Issueで判断する。

## ローカル再現（認証不要）

repository root で、Node.js のサポート対象LTS版と Bun 1.3.10 を用意する。

```bash
bun install --frozen-lockfile --ignore-scripts
bunx panda codegen --silent
bunx panda cssgen --silent
bunx panda codegen --config panda.config.ts --cwd apps/web --silent
bunx panda cssgen --config panda.config.ts --cwd apps/web --silent
cd apps/web
npm exec --no -- vite build --mode production
npm exec --no -- cf deploy --prebuilt --mode production --dry-run
npm exec --no -- vite build --mode preview
npm exec --no -- cf deploy --prebuilt --mode preview --dry-run
bun run preview
```

現行 `cf` RC の `cf build --mode` が Vite 8 のモード対応を誤判定する環境があるため、モード指定で Vite build を実行して Build Output v1 を生成し、`cf deploy --prebuilt` で Cloudflare CLI に渡す。生成先 `.cloudflare/output/v1/` と SSR Worker、static assets、6ページのprerenderを確認すること。dry-run はリモートへアップロードせず、公開成功の証拠ではない。既存の `apps/web/wrangler.jsonc` を `cf` の設定として扱わない。

## Deploy（認証・承認が必要）

GitHub Actions `.github/workflows/web-deploy.yml` の `workflow_dispatch` から `preview` または `production` を明示選択する。productionは `main` 由来の承認済みコミットのみ許す。`pull_request` はビルドとdry-runに限定し、Cloudflare秘密値を渡さない。

**GitHub Environment** `web-preview` / `web-production` を事前に設定する。`web-production` は必要な承認者を指定する。各Environmentに以下を設定する。

- Secret `CLOUDFLARE_API_TOKEN`: 対象アカウントのWorkerデプロイに限定したAPI token（Infisical正本から同期）
- Variable `CLOUDFLARE_ACCOUNT_ID`: 対象CloudflareアカウントID
- Workflow input `site_origin`: 発行されるWorkers URLと一致する `https://<worker>.<subdomain>.workers.dev`。previewでは `ty-plus-web-preview`、productionでは `ty-plus-web` を指定する

`site_origin` はビルド時に `VITE_TY_PLUS_SITE_ORIGIN` として渡され、`SITE.url` / canonical / sitemap / OG metadata を揃える。既定の `https://ty-plus.app` を workers.dev として誤公開しないこと。

Workflowは`vite build --mode <target>`→`cf deploy --prebuilt --mode <target> --dry-run`→承認/環境認証→`cf deploy --prebuilt --mode <target>`→実URLのHTTP smoke順。デプロイが失敗したら公開成功と記録せず、前バージョンのWorker Deploymentへ戻す（`cf workers deployments` のAPI契約に従い、旧version IDと配信比率を確認してから操作する）。

手動時は同じ`cf`を使用できる。`cf auth login` は対話端末用であり、CIでは使わない。CIからは`CLOUDFLARE_API_TOKEN`と`CLOUDFLARE_ACCOUNT_ID`のみを注入する。

## 費用・秘密値・観測

- Workers Freeを前提とする。Workerの実行時間・リクエストと配信コストは [cost-gate.md](../cost-gate.md) の停止条件を正本とし、課金プラン変更を自動で行わない。
- GitHub Releases APIは匿名GET。取得失敗時はbundled snapshotへfallbackする。実公開後のChangelogを`live` / fallback両経路で確認する。
- Cloudflare認証値はGitHub Repository、Issue、PR、ログ、生成物に出さず、Infisicalを正本にする。プレビュー・PRには本番tokenを渡さない。
- 公開後はsource SHA、Worker Version、workers.dev URL、6 route・sitemap・静的画像・404応答を証跡として残す。

## 実装・受入状況

- 旧Wrangler経路の `build`/`preview`/`deploy --dry-run` は #261 で確認されたが、**実公開は確認されていない**。
- `cf` 移行のbuild / dry-run / 実deploy / origin smokeは Issue #358 で追跡する。CI・実結果で判定し、未実施なら明示する。
