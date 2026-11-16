# 更新・通知の取得契約

- Status: Accepted（更新はGitHub Releases / 通知は当面静的JSON）
- Date: 2026-11-12
- 正本: #55、`docs/adr/ADR-0004-github-release-channels.md`（更新）/ #8（通知）

## 更新（GitHub Releases）

R0の更新情報と配布物の正本は**同一リポジトリのGitHub Releases**。以前の`ty-plus.update-feed/1`と`https://ty-plus.app/feeds/update.json`は**更新には使用しない**。通知feedはこの変更に含めない。

クライアント: `src/management/online/update/feed.ts`。

- API: `GET https://api.github.com/repos/ido-bata/ty-plus/releases?per_page=100`（公開リポジトリでは匿名・read-only）。
- GitHubの`draft=false`、`prerelease`の整合、正式なSemVerタグ、配布アセットの存在を検証して候補を選ぶ。
- Stable = `vX.Y.Z`（`prerelease=false`）、Beta = `vX.Y.Z-beta.N`、Insider = `vX.Y.Z-insider.N`（どちらも`prerelease=true`）。
- Stable購読者はStableのみ、Beta購読者はStable/Beta、Insider購読者は全チャンネルを受信する。単なるリリース日時ではなくSemVerに基づいて更新の有無を判定し、チャンネル切り替えでも自動ダウングレードしない。
- リリースのasset命名規則: `ty-plus-<tag>-<platform>.zip`、`ty-plus-<tag>-<platform>.zxp`、`ty-plus-<tag>-<platform>-release-manifest.json`（`platform` = `windows` / `macos`）。`digest: sha256:<64hex>`が確認できないアセットは更新対象にしない。
- CEP `ExtensionBundleVersion`は常に数値の`X.Y.Z`。アップデータで比較する`releaseVersion`は`TY_PLUS_RELEASE_VERSION`で別途ビルドへ注入し、同一数値コアの`beta.1`→`beta.2`などを認識する。`TY_PLUS_RELEASE_CHANNEL`は一致するchannelでなければrelease manifest生成を拒否する。
- URLは`github.com/ido-bata/ty-plus/releases/tag/<tag>`の公式リリースページに限定する。Issue #135以降、Settingsの「アップデートをインストール」はplatform別`.zip`アセットを`update.install`操作経由でインストールできる（後述）。インストールを実行しない従来経路（リリースノート/ブラウザ導線）は引き続き有効。
- Settingsの選択値は既存のfile-backed settingsに保存し、旧形式のsettingsは初期channelへ移行する。
- ネットワーク不達、GitHub APIの制限、invalid releaseは更新チェックだけ`unavailable`になり、ローカル機能は使い続けられる。HTTPキャッシュを利用し、起動ごとの連続ポーリングをしない。
- GitHubはreleaseを**作成日時順**で返すため、古い版のhotfixが新しい版より前に来る。クライアントは最新候補が更新対象より新しくなるまで、またはpageが満杯でなくなるまでページを進める。匿名APIのrate limitを守るため**最大5ページ**で打ち切る。6ページ目以降にしか存在しない最新版は検出しない（既知の制約。`docs/architecture/feeds.md`）。
- 本repoは2026-11-12にPublic化され、初回Stable `v0.10.1` を公開済み。匿名GitHub Releases APIが更新の正規経路であり、CEPコードやconfigへGitHubアクセストークンを埋め込まない。Private時代の404検証は履歴証拠として保持する。
- 後日の別インストール経路は配布先アダプタの追加で対応する。チャンネルは配布先を意味しない。

## アプリ内インストール（`update.install`、Issue #135）

更新の取得・検証・配置はRust operation worker内で完結し、panelには汎用fetchやfilesystem primitiveを公開しない。

- ワイヤ: canonical method `update.install`（idempotency forbidden / retry non-idempotent / cancellable）。payloadは`{release_version, tag, asset:{url, file_name, sha256}}`。
- worker側の検証: URLが`https://github.com/ido-bata/ty-plus/releases/download/`始まりで対象file_nameで終わること、file_nameが`ty-plus-<tag>-<platform>.zip`と一致すること、tagが`v<release_versionの数値コア>`と一致すること、sha256が64hexであること。不正なrequestはnetworkアクセス前に拒否する。
- 手順: HTTPS GET → sha256照合（feedの`digest:`由来。不一致は`integrity_mismatch`相当で中断し既存installを触らない）→ ZIP展開（`app.ty-plus/`単一root必須、traversal拒否、件数/展開量上限）→ staged appの`CSXS/manifest.xml` bundle version・`jsx/ty-plus-host.jsx`・`worker/manifest.json`・`LICENSE`・`THIRD-PARTY-NOTICES.md`を検査 → install lease（排他）下で`extensions/app.ty-plus`をsibling renameでswap。旧installは`.ty-plus-backup/`へ退避し、旧`worker/versions/<sha256>/`は新treeへ複製して、起動中の旧panelがcontent-addressed binaryを解決し続けられるようにする。
- 失敗時: swapのrenameに失敗した場合は旧installへrollbackしてmarker（`.ty-plus-update-pending.json`）を残し、次回worker spawn時に`apply_pending_update`が再試行する。pending適用も失敗し続ける場合はmarkerを保持したまま次回へ委ねる。
- `manual_required`: extensions rootが書き込み不可（例: `/Library`や`Program Files`配下）ならdownload前にprobeで検出し、手動ZXP導線をUIへ返す。
- 信頼モデル: ZIPは署名されないため真正性はHTTPS+GitHub Releaseに依存する（手動ZXP経路と同じ前提）。sha256は同一Releases API応答由来でintegrity証明であり、publisher identityの証明ではない。ADR-0004の改訂として記録する。
- UI状態: `installed`（再起動要）/ `pending`（次回起動時適用）/ `manual_required` / 失敗。`restart_required`は常にtrueで、swap完了を「インストール成功」とは表示しない。

## 通知（当面は独立した静的feed）

- 通知は従来の`ty-plus.notification-feed/1`を継続し、GitHub Releases更新とは独立。
- 任意の静的ホストがCORSを送る契約。取得はpanel側から直接行い、workerの可用性へ依存しない。
- 不達/破損時はローカル機能を阻害しない。既読情報はローカルに保存する。

## 通知フィード（notification feed）

```json
{
  "schema": "ty-plus.notification-feed/1",
  "items": [
    {
      "id": "2026-11-maintenance",
      "title": "メンテナンスのお知らせ",
      "summary": "…",
      "url": "https://…/detail",
      "severity": "info",
      "publishedAt": "2026-11-15T00:00:00Z",
      "expiresAt": "2026-12-15T00:00:00Z"
    }
  ]
}
```

- `severity` は `info` / `warning` / `critical`。
- `expiresAt` を過ぎた項目は表示しない（フィード側の削除替わり）。
- 既読管理はクライアント側のキャッシュ（`cache/notifications.json` の `readAtById`）で行い、同一idの既読通知を毎起動に再表示しない。
- 不正な項目（id欠落・title欠落・severity不正）は項目単位で捨て、フィード全体は落とさない。

