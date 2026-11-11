# Supabase

この文書は本repoにおけるSupabase実装の現状を定義する。

## 現状（2026-11-11時点）

**本repoにSupabase実装は存在しない。** 旧repo（`rebuildup/ty-plus`、読み取り専用）にあった次の資産は、移植基準ツリーへの取り込み時に除外された（`docs/migration/porting-ledger.md` の #17 除外リスト）。

- `supabase/`（migrations、Edge Function `typlus`）
- `src/` 側の Supabase gateway client（`createSupabaseGateway`、`SUPABASE_URL` 等の環境変数契約）

参照が必要な場合は旧repoの当該commitを参照すること。本repoへの再移植は、オンラインプリセット配信の製品方針が確定してから行う（判断事項は製品方針Issueに集約）。

## 本repoの実際のオンラインsurface

- **更新・通知フィード**: 静的JSON（`docs/architecture/feeds.md`）。R0の公式配信契約。バックエンド不要。
- **cloud gateway（dormant）**: `src/management/online/catalog/runtime-cloud-gateway.ts` に `createFixtureCloudGateway` / `createRuntimeCloudGateway` が存在する。fixture modeは空カタログを返し、remote modeはruntime port経由でのみ成立する。R0ではバックエンドを持たないdormant状態であり、起動失敗・不達はローカルコアを妨げない（`docs/architecture/offline-core.md`）。

## 再移植時の前提

Supabase実装を戻す場合に確認する事項:

- secret schema（`NOTION_TOKEN` / `SYNC_TOKEN` / Supabase keys）は `docs/architecture/cloud/secrets.md` と `docs/architecture/cost-gate.md` のsecret排除契約に再適合させる。
- Edge Functionのエンドポイント契約は旧repo実装が参照元。fixture mode（DB未設定でin-memory fixture）の挙動も旧実装に準拠する。
- 配信・課金の方針（無料/有料の境界、aescripts連携の要否）が確定してから着手する。

## Scope of This Document

- 本repoに存在するコード surface と、再移植の前提だけを記載する。
- 製品の約束は [`../project.md`](../project.md)、online/offline挙動は [connectivity.md](connectivity.md)。
