# インストール

- Status: GitHub Releases更新経路へ移行（#55）。公開配布物の実証と本人承認は別途必要
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

## GitHub Releasesからのインストール（公開後）

公式配布先: https://github.com/ido-bata/ty-plus/releases

1. ReleaseのタグでStable（`vX.Y.Z`）/ Beta（`vX.Y.Z-beta.N`）/ Insider（`vX.Y.Z-insider.N`）を確認する。
2. 利用中のOSに対応する `ty-plus-<tag>-<platform>.zxp` を取得する（`platform` = `windows` / `macos`）。GitHub Releaseの添付manifestで対応版・checksumを確認できる。
3. ZXP対応インストーラで拡張を導入し、After Effectsを再起動する。Windows workerはR0ではAuthenticode未署名のため、WindowsのSmart App Controlが有効な環境では起動がブロックされる場合がある。
4. `Window > Extensions` からty-plusを開く。

ZIPは手動設置・検証用に同梱する。**ZIP内のCEP拡張はZXP署名の恩恵を受けないため、未署名拡張の起動にはCEP開発者モードが必要になる環境がある。** 通常の利用には署名済みZXPを推奨する。

## 更新

1. Settings → Updates で**Stable / Beta / Insider**を選ぶ（選択内容はローカル設定に保存される）。
   - Stable：安定版のみ。
   - Beta：安定版＋ベータ版。
   - Insider：すべてのリリース。
2. `Check now` で手動確認する。新しいリリースがあれば`Release notes and download`から該当GitHub Releaseを開く。
3. 同じ数値版のPreviewでも、`-beta.1`→`-beta.2`や`-insider.1`→`-insider.2`は別の更新として判定する。
4. ダウンロードしたZXPを再インストールする。自動ダウンロード・自動更新はしない。チャンネルを変更しても旧版へ自動的に戻さない。

公式リポジトリがprivateの間は匿名のGitHub Releases APIへアクセスできないため、更新確認は「利用不可」と表示される。オフライン・API制限時もローカル機能と保存データには影響しない。

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
