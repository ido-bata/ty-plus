# インストール

- Status: Draft（公開配布の部分は #32 の確定待ち。確定まで公開しない）
- Date: 2026-11-11
- 正本: 本repo #9 / `rebuildup/ty-plus#225`（旧正本）

## 要件

| 項目 | 要件 |
| --- | --- |
| ホスト | Adobe After Effects（検証対象: AE 2026 / CEP 12。他バージョンは未検証） |
| OS | Windows 10/11 または macOS |
| ネットワーク | 不要（ローカル機能はオフラインで完全動作する） |
| アカウント | 不要 |

## インストール（手動zip形式 — 現行の内部検証ビルド）

1. 配布zip（`ty-plus-internal-<version>-<platform>-<commit>.zip`）を取得する。
2. zipを展開し、中の `app.ty-plus/` フォルダを次の拡張フォルダへ置く:
   - Windows: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\app.ty-plus`
   - macOS: `/Library/Application Support/Adobe/CEP/extensions/app.ty-plus`
3. After Effectsを起動（起動中の場合は再起動）し、**Window > Extensions** から ty-plus を開く。

> **この手順は現時点では内部検証用**である。第三者への配布には署名済みZXPが必要で、署名主体・証明書が確定するまで公開しない（#32 / 公開ブロッカー）。

## インストール（署名済みZXP — #32確定後に記述）

未確定。ZXP Installer経由の手順を、配布成果物と署名の確定後に追記する。

## 更新

1. パネルの **Settings → 更新** を開く。
2. 「新しいバージョンあり」と表示された場合、**Release notes and download** をクリックして公式の配布ページへ移動する。
3. 自動インストールは行われない。新しいzipを同じ手順で上書き配置する。

更新確認は起動時に1回だけ行われ、オフライン・フィード不達時は「取得失敗」と表示されるだけで、他の機能に影響しない。

## アンインストール

拡張フォルダから `app.ty-plus/` を削除し、After Effectsを再起動する。ユーザーデータ（レイアウト・プリセットキャッシュ）は管理ルート配下に残る。完全に消す場合は削除する（場所は Settings > Paths で確認できる）。

## 不具合報告

1. 公式リポジトリのIssuesから報告する（URLは公開時に案内する。現時点ではrepo自体がPrivate）。
2. 報告に含めるもの:
   - OSとバージョン、After Effectsのバージョン
   - インストールしたビルドのバージョン（Settings > 更新 または manifestのversion）
   - 再現手順と、期待した結果 / 実際の結果
   - Debug Consoleに表示されたエラー（あれば）
3. クラッシュ（AE全体が落ちる）の場合: OSのcrash reportのファイル名を添える。

> Settings の Feedback セクションは現状、入力内容を送信しない（バックエンドはR0で削除済み）。報告はリポジトリのIssuesへ直接行う。

## 既知の未検証 / 既知の問題

- macOSでのAE 2026クラッシュ（旧#209 / #214、原因未確定）— 実機検証（#10）で観察する。
- 実機検証の進捗は `docs/verification/r0-device-gate.md` の状態列が正本である。
