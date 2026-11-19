# Insider 実機 updater 受入記録 — v0.11.0-insider.8 → .9（#135, #245）

実施日: 2026-11-19 / ホスト: macOS (Apple Silicon) / AE: After Effects 2027 / channel: insider

## 公開した Insider リリース

| tag | sourceCommit | 備考 |
| --- | --- | --- |
| `v0.11.0-insider.8` | `fab3e9aabcf925d881aa283674a84c94e25f9107` | #245/#246（install relay 修正）を含む最初の連番。両 platform 6 asset、prerelease=true / non-latest、GitHub API digest とローカル生成バイト全一致 |
| `v0.11.0-insider.9` | 同上（同一製品ソースの連番） | insider.8 からの UI 経由更新の更新先 |

insider.8 macOS ZIP sha256: `313a0d535aaba85da1ef9952b74845b357811bcfdf3aa4b9dd30bfc5c2f3864d`
insider.8 macOS ZXP sha256: `d144fef3227be6da27f3c0aa262458906f17dd35091263655421daa96d4230d4`
insider.8 Windows ZIP sha256: `d5165ecc35c436a7d9b271ad5b06d37dafe61990c920853fa0b24cfec2d2fa1e`
insider.8 Windows ZXP sha256: `118c9b3b2909696c980546f8818077b081d7eb67784efbdca909fed570c9a7ee`
（Windows worker は未署名 = R0 の正当な形、ZXP は TSA 無し署名 #233、macOS worker は Developer ID 署名・未公証 ADR-0003 Amendment 1）

## 発見した製品欠陥と修正

- **#245**: Settings dialog の `install-relay` が `sourceSurfaceId="ty-plus-surface"` を使い、transport の `SURFACE_ID_PATTERN` に一致せず envelope が silent drop。panel responder 未到達 → relay 180 秒 timeout → UI に「ダウンロードに失敗」と誤表示（insider.5/.6/.7 で3回再現）。worker 直接実行は正常（実 swap 成功）だったため relay 経路に限定した欠陥。
- **修正**: PR #246（`resolveDialogSurfaceId()` を fallback に使用）。unit test 追加、CI 全緑、`fab3e9aa` で release branch 統合済み。

## 実機 UI E2E（insider.8 → insider.9、全工程実測）

環境: `app.ty-plus` を insider.8 macOS ZIP の実ディレクトリとして手動インストール（更新元）。ユーザーデータは `~/Library/Application Support/ty-plus{,-e2e}` を事前スナップショット。

| 工程 | 結果 | 証跡 |
| --- | --- | --- |
| 更新検出 | Settings → 更新チャンネル=インサイダー版、インストール済み `0.11.0-insider.8`、「新しいバージョンがあります: 0.11.0-insider.9」表示 | CDP 実測 |
| install ボタン | 「アップデートをインストール」描画（#241 修正の実機確認） | CDP 実測 |
| ユーザー操作 | ボタン click → 状態 `インストール中…` | CDP 実測 |
| relay | Settings → panel-1 へ `com.typlus.workspace.updates` request（insider.9 公式 ZIP URL + sha256） | #245 修正により envelope が validator を通過（修正前は drop を実測済み） |
| worker 実行 | panel1.log: `operation attempt started` → manifest validated → binary resolved → child spawned → handshake → request sent → response received → `operation complete`（15:05:01.4–15:05:04.0） | `~/Library/Logs/CSXS/CEPHtmlEngine12-AEFT-27.0-app.ty-plus.panel1.log` |
| swap | `app.ty-plus` が insider.9 tree に置換。worker versions に新版 `5506c353…` と旧版 `97ebf013…` を併存保持、旧 install は `.ty-plus-backup` へ退避、staging 空 | 実ディレクトリ検査 |
| 状態通知 | dialog に「インストールしました。After Effectsを再起動すると反映されます。」表示 | CDP 実測 |
| AE 再起動 | quit → relaunch → panel 再オープン | — |
| 新版表示 | Settings のインストール済みリリース = **`0.11.0-insider.9`**、更新状態 = **最新です** | CDP 実測 |
| データ保持 | `ty-plus` / `ty-plus-e2e` 配下 10 ファイルの sha256 が更新前後で**完全一致** | `/tmp` スナップショット diff |

**判定: UI 経由 updater E2E PASS（macOS / AE 2027 / insider channel）**

補足: dialog surface は worker composition を持たず `getUpdateInstaller()` が null のため、実行経路は必ず `requestPanelUpdateInstall`（relay）— panel の `installUpdateBusResponder` → `operationWorker.composition.installUpdate`。今回の成功は #245 修正の実機検証である。

## 環境復元

- 検証用実ディレクトリは `app.ty-plus.insider9.bak` に退避（削除していない）
- `app.ty-plus` / `app.ty-plus.dev` を `dist/cep-dev` への symlink として復元（`/tmp/cep-symlinks-bak/` の退避 symlink と同じ参照先）
- `bun run build:cep:dev` で dev bundle 再生成後、AE 2027 で panel boot initialized・host bundle loaded を確認
- `/tmp/cep-symlinks-bak/` は残置（失われていない）

## 未検証・残件

- **pending / rollback の実機経路**: 今回は直接 swap 成功。pending-swap・manual-required は sandbox harness（6/6）で契約証明済みだが実機未経由
- **Windows 実機**: 未検証（環境なし）
- **AE 2026**: window 非生成の環境問題で未検証（#71 参照）
- **Stable**: merge/tag/公開は未実施・明示承認待ち
- relay timeout のエラーメッセージが「ダウンロードに失敗」にマップされる点は誤解を招く（#245 に残課題として記録、別途検討）
