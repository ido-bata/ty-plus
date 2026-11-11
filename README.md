# ty-plus

After Effects向け拡張 ty-plus の無料OSS再構築リポジトリ。

現在はR0（public beta公開に向けた再構築フェーズ）の作業用Privateリポジトリである。権利監査と公開承認を経るまでPrivateを維持し、公開の可否と時期は `rebuildup/ty-plus#218` の判定に従う。

## 現在の状態

- 旧 `rebuildup/ty-plus` からはGit履歴を引き継いでいない。監査済み資産のみを移植する（`rebuildup/ty-plus#230`）。
- 実装の移植は `docs/migration/porting-ledger.md` の台帳に基づいて進める。
- ライセンスは権利監査の確定まで未定。

## ドキュメント

- `AGENTS.md` — 開発の入口。正本へのroutingと境界
- `docs/adr/` — 決定記録
- `docs/migration/porting-ledger.md` — 旧実装からの移植台帳

## 開発

```sh
mise install
mise run check:skills
```
