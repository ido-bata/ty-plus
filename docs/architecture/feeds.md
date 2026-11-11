# Feed契約（更新 / 通知）

- Status: Accepted（R0の静的JSON feed）
- Date: 2026-11-11
- 正本: `rebuildup/ty-plus#223`（更新）/ `rebuildup/ty-plus#224`（通知）/ 本repo #7 / #8

## 共通原則

- 配布形式は **静的JSON**。配信元は任意の静的ホスト（GitHub Pages / Object Storage等）でよく、ty-plus専用APIを前提にしない。
- クライアントは起動ごとの高頻度ポーリングをしない。HTTPキャッシュ（`Cache-Control` / `ETag`）を利用し、再取得は手動再読込または起動時の1回まで。
- 取得に失敗してもローカル機能を妨げない。フィード系の失敗は状態表示に現れるだけで、例外をUIの外へ投げない。
- バイナリの自動実行・自動インストールは行わない。更新は公式配布ページへの導線を示すだけ。

## 更新フィード（update feed）

URL: 既定値を `src/management/online/update/feed.ts` の `DEFAULT_UPDATE_FEED_URL` に定数として持つ。隠蔽せず、別ホストへの差し替えを契約として許容する。

```json
{
  "schema": "ty-plus.update-feed/1",
  "channel": "stable",
  "version": "0.10.1",
  "publishedAt": "2026-11-20T00:00:00Z",
  "releaseNotesUrl": "https://…/release-notes/0.10.1",
  "assets": [
    { "platform": "windows", "url": "https://…/ty-plus-0.10.1-windows.zip", "sha256": "<64hex>" },
    { "platform": "macos", "url": "https://…/ty-plus-0.10.1-macos.zip", "sha256": "<64hex>" }
  ]
}
```

- `schema` が `ty-plus.update-feed/1` でないもの、必須field欠落、sha256が64hexでないものは **不正なフィード** として扱う（表示は「取得失敗」）。
- `version` は `MAJOR.MINOR.PATCH`。クライアントは自バージョンと比較し、「新しいバージョンあり / 最新」を判定する。フィードが自バージョン以下（ダウングレード）なら「最新」扱い。
- `assets[].url` と `sha256` は公開リリース成果物と一致しなければならない（#6のrelease manifestと同じ値）。

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
