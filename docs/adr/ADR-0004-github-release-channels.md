# ADR-0004: GitHub Releasesによる更新チャネルと配布

- Status: Accepted（2026-11-12 ユーザー決定）
- 正本: 本文 / Issue #55 / `docs/architecture/feeds.md`（更新契約） / `docs/operations/release-runbook.md`
- 対象: R0以降のGitHub配布とアプリ内の更新確認。通知feedの移行は対象外。

## Decision

当面、公開パッケージと更新情報の唯一の正本を`ido-bata/ty-plus`の**公開済みGitHub Releases**とする。更新専用API、GitHub Pages等への更新用静的JSONの二重発行はしない。

| Channel | GitHub tag | prerelease | 受信対象 |
| --- | --- | --- | --- |
| stable | `vMAJOR.MINOR.PATCH` | false | stable |
| beta | `vMAJOR.MINOR.PATCH-beta.N` | true | stable + beta |
| insider | `vMAJOR.MINOR.PATCH-insider.N` | true | stable + beta + insider |

- Draft・削除済み・tagと`prerelease`の意味が一致しないrelease、配布用アセットがないreleaseは候補から除く。
- GitHub APIの`/repos/ido-bata/ty-plus/releases`を使用する。チャネルによる候補選定はクライアントで行う。`/releases/latest`だけではbeta/insiderを取得できない。
- バージョンはSemVerとして比較し、同一コア版での`beta.1`→`beta.2`、`insider.1`→`insider.2`を見逃さない。チャンネル変更は自動ダウングレードを行わない。正式安定版が同じコア版のプレリリースより新しいのはSemVerの規則どおり。
- `package.json.version`とCEP `ExtensionBundleVersion`は数値版（例: `0.11.0`）を保ち、GitHub releaseのタグ・更新比較は別の`releaseVersion`（例: `0.11.0-beta.2`）をビルド時に埋め込む。整合しない組合せをrelease前に拒否する。
- GitHub Releaseに`ty-plus-<tag>-<platform>.zxp`と`ty-plus-<tag>-<platform>.zip`、各platformのrelease manifestを添付する。asset名は一意で、tagと版が一致する。GitHubのアセット`digest`（sha256）とローカルmanifestの値を照合する。
- アプリはリリースノート・配布ページを標準ブラウザーで開くだけ。自動ダウンロード・自動インストールはしない。利用者のローカルデータは従来の管理rootに残す。
- ユーザーが設定画面でchannelを変更でき、選択を既存のfile-backed settingsに保存する。既定はstable。ただし明示されたpreviewビルドはそのビルドのchannelを初期値とする。
- APIエラー、匿名rate limit、オフライン時は更新チェックだけが失敗する。core起動・保存・プリセット操作には影響させない。

## Trust and publication

- 公開Repositoryなら匿名GitHub REST APIで取得可能。現在のPrivate repoには匿名APIでアクセスできないため、実機テストはfixture / private成果物の手動投入を使い、**CEPバンドルにGitHubトークンを埋め込まない**。
- GitHub APIレスポンスのsha256はダウンロードの整合性確認の情報であり、発行主体の追加の暗号署名ではない。ZXP署名とmacOS worker公証、Windows未署名workerに関するADR-0003の要件は維持する。
- GitHub Releaseの`draft`→`published`変更、リポジトリの公開、GitHub Releaseへの実アップロードは公開操作であり、本人の明示的な許可なしには実行しない。開発用insiderにも同じ原則が適用される。
- 将来の他インストーラ・配布サイトは`update provider / channel / release asset`の契約から追加できる。R0では移行用の抽象化を過剰に先行実装しない。

## Rejected

- stable/beta/insiderに別GitHub repoを用意する：同一ソースと配布物の追跡が複雑になる。
- beta/insiderをGitHubの`prerelease` flagのみで識別する：GitHubにその二者を区別する標準fieldがない。
- 固定の更新用JSONをReleaseとは別に発行する：更新正本を重複させ、公開手順を増やす。
- 通知feedまで同時に置換する：今回の更新経路の決定範囲を超える。
