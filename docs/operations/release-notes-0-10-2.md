# ty-plus v0.10.2

v0.10.1 で報告された実機不具合の修正を中心とした **Stable** リリースです。無料・アカウント不要で、ローカル機能はオフラインで動作します。

## この版について

- 配布channel: **Stable**（`v0.10.2`、GitHub `prerelease=false`）
- CEP数値版: `0.10.2` / 配布版: `0.10.2`
- 更新元: 本リポジトリのGitHub Releases（アプリ内の Settings → Updates から確認できます）

## 変更内容

### 不具合修正

- 選択済みタイルの端をドラッグしてもリサイズではなく移動になっていた問題を修正
- CEP経由の operation worker が macOS で失敗していた問題を修正（appRoot の解決誤り。サムネイル・plugin scan 等の worker 機能が動作します）
- ExtendScript 側の `alert()` がモーダルダイアログで After Effects 全体をブロックしていた問題を修正。失敗は構造化エラーと非モーダル通知で表示されます
- preset 実行に失敗した際にユーザーへ何も表示されなかった問題を修正（エラー通知を表示）
- Quick Actions / Quick Bar から preset を実行できなかった問題を修正
- 設定画面で言語を英語に切り替えても `documentElement.lang` が日本語のまま残ることがあった問題を修正
- theme.css への設定書き込みがパネル・ダイアログ間で競合し、外観設定が失われることがあった問題を修正
- ホストバンドルの異常終了後に自己修復が効かない・無限リトライになることがあった問題を修正
- 設定（言語・外観・グリッド・レイアウト）の保存が失敗した際にダイアログへ通知されない問題を修正
- マウスのみのドラッグ操作（ペン以外の入力デバイス）に対応。easing エディタのハンドル表示・グリッド行揃えも修正
- フィードバック送信が実際には GitHub issue を開くように修正

### その他

- E2E 受入体系（全機能インベントリ・ユースケース対応表・自動ハーネス）を整備し、macOS / Windows 実機での検証記録を蓄積

## 対応OS

| platform | 状態 | 備考 |
| --- | --- | --- |
| Windows (x64) | **配布** | workerはADR-0003によりAuthenticode未署名。SmartScreenの警告が出る場合があり、**Smart App Control有効環境では起動しません** |
| macOS | **配布** | Developer ID Application署名済み・未公証（ADR-0003 Amendment 1）。`spctl`で未公証と判定されますが、拡張の内部workerは通常ブラウザ経由の隔離を受けません |

## インストール

利用中のOSに対応する `ty-plus-v0.10.2-<platform>.zxp` を取得し、ZXP対応インストーラで導入してAfter Effectsを再起動します。**Window > Extensions** から ty-plus を開きます。

- `platform` は `windows` / `macos`
- ZIPは手動設置・検証用です。ZIP内のCEP拡張はZXP署名の恩恵を受けないため、環境によってはCEP開発者モードが必要です。通常の利用にはZXPを推奨します。

## 既知の制約

- 署名済みZXPは継続利用する自己署名証明書で署名しています（発行者表示は検証されません）。更新でも同じ主体を維持します（`docs/operations/zxp-signing-identity.md`）。
- Windows版は未署名workerのため、Smart App Control 有効環境では動作しません。
- macOS版はDeveloper ID署名・未公証です（ADR-0003 Amendment 1）。`xattr -w com.apple.quarantine` 等で隔離された場合や、macOSのポリシー変更時には初回起動が拒否され得ます。
- 自動更新は行いません。更新確認はGitHub Releases APIへの読み取りのみで、ダウンロード・インストールは手動です。
- オンライン機能（preset library・通知 feed・更新確認）は R0 では dormant です。コア機能はオフラインで動作します。

## 検証

成果物のSHA-256、署名、`sourceCommit`、チャンネル整合は `docs/verification/release-candidate-0-10-2.md` に記載しています。実機確認の範囲と未検証事項もそこに明記しています。
