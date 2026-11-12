# 無料運用のコスト / secretゲート（Issue #11）

- Status: Accepted（配信先の最終確定は公開承認と合わせて本人判断）
- Date: 2026-11-11
- 正本: `rebuildup/ty-plus#227`（旧正本）/ 本repo #11 / 製品charter `docs/architecture/project.md` / feed契約 `docs/architecture/feeds.md`

## 最小構成と費用試算

R0の公式配布・通知・更新は、次の常時課金ゼロの構成を前提とする。

| 機能 | 構成 | 無料枠 | 費用 |
| --- | --- | --- | --- |
| 配布（成果物の保管と取得） | GitHub Releases（本repoがpublic化された後） | リポジトリあたり2GB（artifact）、Release assetは個別2GB / 総量上限なし（fair use） | 0円 |
| 更新 | GitHub Releases API（公開repo・匿名GET） | 匿名APIレート制限あり。起動時1回・手動再確認のみ | 0円 |
| 通知フィード | 静的JSON（従来どおり） | 静的ホストの容量・転送上限に依存 | 0円 |
| CI / ビルド | GitHub Actions（private間は無料枠2,000分/月、public化後は無制限） | 2,000分/月（private） | 0円 |
| secret管理 | 個人のInfisical（self-host / free tier） | 既存運用に従う | 0円 |

月額コスト予測: **0円**。更新情報・更新先はGitHub Releasesを正本とし、将来別経路へ移す場合はproviderの追加として扱う（ADR-0004）。通知feedは独立して残す。

## 上限と劣化 / 停止挙動

| 資源 | 上限 | 超過時の挙動 |
| --- | --- | --- |
| Release asset容量 | 2GB/ファイル | 配布zipは20MB程度であり、問題になり得ない。超過する場合は成果物の分割を見直す |
| 更新用GitHub API | 匿名アクセスのレート制限 | 更新確認をfail-softにし、手動再試行できる。トークンをCEPに埋め込まない |
| 通知feed | 静的ホスト依存 | 通知だけ取得失敗。更新はGitHub Releasesから引き続き取得 |
| Actions分 | 月2,000分（private） | internal build / release gateは実行頻度制御（PRではnative jobsをskip済み）。枯渇時はdispatch実行に限定する |
| フィード不達 | - | クライアントはfail-soft（`unavailable` 表示）。ローカル機能は無影響（#7/#8の契約） |

## 監視

- Actions / Releases / Pagesの使用量はGitHubのUIで確認できる。自動監視は導入しない（無料運用の範囲で、停止条件は人の確認を前提にする）。
- フィードの死活はクライアントの「取得失敗」表示と、リリース前の手動確認（#10のD-13〜15）で検出する。

## secret / 管理トークンの排除

- クライアント・公開成果物にsecretを含めない。`.env.example` はdocumentation-onlyで実値を持たない（#5でschema縮小済み）。
- 公開成果物への混入検査: `docs/decisions/rights-inventory.md` のシークレットスキャン（パターン検査）を、リリース前に再実行する（#6のrelease-trustビルド実装時に自動化する）。
- ZXP署名パスワード（`ZXP_CERT_PASSWORD`）・証明書はInfisical管理。クライアントに配信されない。
- 管理トークン（GitHub token等）はCIの `GITHUB_TOKEN`（`contents: read` に最小化済み）のみ。

## サービス障害 / 復旧

| 障害 | ユーザー向け表示 | 復旧手順 |
| --- | --- | --- |
| GitHub Releases API停止・制限 | 更新のみ「取得失敗」表示。ローカル機能は通常どおり | GitHub復旧・レート制限解除を待つ。通知は独立して動作 |
| 通知feed配信停止 | 通知が「取得失敗」。更新とローカル機能は利用可能 | 静的通知ホストを復旧する |
| Release asset削除・破損 | 更新導線の先でダウンロードが失敗する | 誤った成果物を非公開または撤回し、Release asset digest/manifestと一致する成果物を検証して再発行する |
| GitHub全体の障害 | 更新・通知が取得失敗。ローカル機能は無影響 | 復旧を待つ（常時接続前提の機能が存在しないため致命傷にならない） |

## 非目標

ユーザー投稿の大容量保存、有料プラン、セルフホスト実装。
