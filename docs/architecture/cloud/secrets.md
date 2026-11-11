# Secrets Management

本repoのsecret方針は `docs/architecture/cost-gate.md` のsecret排除契約に従う。クライアント・公開成果物にsecretを含めない。

## 現状（2026-11-11時点）

- 旧repoのInfisical binding（`.infisical.json`）は移植対象から除外された。`scripts/infisical/` のwrapper scriptは残存するが、binding fileがないため `bun run secrets:doctor` / `secrets:run` は動作しない。必要になった時点でbindingを再構築する。
- Supabase / Notion 関連のsecret（`NOTION_TOKEN` / `SYNC_TOKEN` / `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`）は本repoには該当する実装が存在しない（[supabase.md](supabase.md)）。再移植時にschemaへ追加する。

## 現在必要なsecret

| Name | 種別 | 必須 | 用途 / consumer |
| --- | --- | --- | --- |
| `ZXP_CERT_PASSWORD` | Secret | Optional (#32のみ) | ZXP証明書の署名。`sign-zxp.ts`。Infisical等のsecret managerで管理し、クライアントに配信しない |
| `GITHUB_TOKEN` | CI managed | workflow内のみ | CIの `contents: read` に最小化済み（`docs/architecture/cost-gate.md`） |

## 排除契約

- `.env` はdocumentation-onlyで実値を持たない（#5でschema縮小済み）。
- 公開成果物への混入検査は `docs/decisions/rights-inventory.md` のシークレットスキャンをリリース前に再実行する（#32のrelease flowへの自動組み込みが作業項目）。
- 管理トークンをCIへ渡す場合は最小権限に限定し、`pull_request` workflowにsecretを渡さない。

## Setup

`bun run setup` は `bun install --frozen-lockfile --ignore-scripts` とgit hooks導入、およびInfisical系の `secrets:setup` を呼ぶ。binding fileが無い現状ではInfisical部分は失敗する。installだけ必要な場合は `bun install --frozen-lockfile --ignore-scripts` を直接実行すること。
