# 公式WebサイトのCloudflare Workersデプロイ

`apps/web`（TanStack Start）をCloudflare Workers + Static Assetsとして配備する経路の正本。決定の背景は [ADR-0007](../../adr/ADR-0007-official-web-platform.md)、費用・secretの枠組みは [cost-gate.md](../cost-gate.md) と [secrets.md](secrets.md) に従う。

## 構成

| 項目 | 内容 |
| --- | --- |
| Framework | TanStack Start 1.x（`@tanstack/react-start`） |
| Workers接続 | `@cloudflare/vite-plugin`（`apps/web/vite.config.ts` の先頭plugin） |
| 設定 | `apps/web/wrangler.jsonc`（input config。build成果物の `dist/server/wrangler.json` がdeploy時の実効config） |
| Worker entry | `@tanstack/react-start/server-entry` |
| Static Assets | client build + prerender済みHTMLを `@cloudflare/vite-plugin` が自動配線（`assets.directory` は手書きしない） |
| 公開先 | `workers.dev` のみ。独自ドメインは購入しない（ADR-0007） |

サーバー側処理は `apps/web/src/server/` のServer Functionsに限定する。`src/lib/` はisomorphicな契約・pure helperで、将来の公開API（CEP・第三者クライアント向け）と共有する境界。公開APIの実装はR1以降のIssueで別途設計する。

## 環境分離

| 環境 | コマンド | 実行基盤 | 備考 |
| --- | --- | --- | --- |
| 開発 | `bun run --filter @ty-plus/web dev` | Vite dev + workerd | portは `.worktree.env` の `TY_PLUS_WEB_PORT` |
| プレビュー | `bun run --filter @ty-plus/web preview` | `vite preview`（workerd/miniflare） | portは `TY_PLUS_PREVIEW_PORT`。deploy前のローカル検証用 |
| preview deploy | `bun run --filter @ty-plus/web deploy:preview` | `wrangler deploy --env preview` | `ty-plus-web-preview.workers.dev`。外部公開を伴うため実施は承認制 |
| 本番 deploy | `bun run --filter @ty-plus/web deploy` | `wrangler deploy` | `ty-plus-web.workers.dev`。**release-class操作。明示的承認なしに実行しない** |

## 再現手順

```bash
cd apps/web
bun install --frozen-lockfile
bun run build          # vite build（client + SSR + prerender + sitemap）
bun run preview        # workerdでローカルpreview（全route 200を確認）
bunx wrangler deploy --dry-run   # bundle + assetsを認証なしで検証
bun run deploy         # 本番deploy（要承認）
```

`wrangler types`（`cf-typegen`）でWorker型を再生成できる。現状Worker側で使うbinding・型は最小限のため必須ではない。

## Secrets

- 現状のサイトはsecretを必要としない。GitHub Releases APIは匿名GETで、server functionが実行時にfetchする。
- 将来bindingやtokenが必要になった場合は [secrets.md](secrets.md) の契約に従い、Infisicalを正本として `wrangler secret put` または環境変数で注入する。`.env` に実値を置かず、公開成果物・PR・Issueへsecret値を書かない。
- `pull_request` workflowへsecretを渡さない既存契約を維持する。

## 無料枠・コスト

- Workers Free: 10万req/日、CPU 10ms/req。Static Assetsの配信はWorkersを経由しないため実質無料。
- GitHub Releases APIの匿名rate limitは60req/時/IP。server functionは10分TTLのin-memory cacheを持ち、超過時は `src/server/releases.snapshot.json` の静的snapshotへfallbackする（`snapshot:releases` scriptで再生成）。
- 上限超過・課金発生の停止条件は [cost-gate.md](../cost-gate.md) に従い、人の確認を前提とする。自動監視は導入しない。

## 検証状況

- `bun run --filter @ty-plus/web build`: client/SSR build + 6ページprerender + sitemap生成がworkerd上で成功。
- `bun run --filter @ty-plus/web preview`: 全公開routeが200（307はtrailing-slash正規化）。
- `bunx wrangler deploy --dry-run`: Worker bundle + Static Assetsのupload対象を認証なしで検証済み。
- `workers.dev` への実deployは未実施（承認待ち）。
