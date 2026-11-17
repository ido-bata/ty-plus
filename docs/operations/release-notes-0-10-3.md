# ty-plus v0.10.3

v0.10.2 以降に報告・検出されたローカルコア停止系の不具合と、更新インストール経路の安全性を修正した **Stable** 修正リリースです。無料・アカウント不要で、ローカル機能はオフラインで動作します。

## この版について

- 配布channel: **Stable**（`v0.10.3`、GitHub `prerelease=false`）
- CEP数値版: `0.10.3` / 配布版: `0.10.3`
- 更新元: 本リポジトリのGitHub Releases（アプリ内の Settings → Updates から確認できます）

## 変更内容

### 不具合修正

- Cloud Gateway 未起動・ネットワーク未接続の状態で、プリセットのドラッグ＆ドロップ配置・グループ作成・パネル操作が失敗し、パネル全体が表示不能になることがあった問題を修正。ローカルコア機能はオンライン基盤なしで動作します
- オンライン未実装機能を示唆する dead UI（Preset Library を開く導線など）を整理
- DirectoryBrowser の右クリックメニューで共通操作（Move to panel 等）が失われていた問題を修正
- Easing / Align 等のポインタ操作の退行を修復
- DirectoryBrowser の画像プレビューで `file:` / `data:` URL が正しく扱われず空表示になることがあった問題を修正
- Windows パスの画像 URL 解釈の不具合を修正

### 更新インストールの安全性

- アプリ内アップデートのインストール処理で、排他制御の自己競合・ロールバック失敗・pending 復旧の抜けを修正
- 配布物の整合性検証（サイズ・件数・SHA-256・パス検査）と、失敗種別に応じたエラーメッセージを改善
- 既存ユーザーデータ（settings / workspace / widgets / presets）は更新で上書きされません

### その他

- Storybook の操作状態 story を拡充し、開発時の視覚回帰検出基盤を改善（利用者向けの動作変更はありません）

## 対応OS

| platform | 状態 | 備考 |
| --- | --- | --- |
| Windows (x64) | **配布** | workerはADR-0003によりAuthenticode未署名。SmartScreenの警告が出る場合があり、**Smart App Control有効環境では起動しません** |
| macOS | **配布** | Developer ID Application署名済み・未公証（ADR-0003 Amendment 1）。`spctl`で未公証と判定されますが、拡張の内部workerは通常ブラウザ経由の隔離を受けません |

## インストール

利用中のOSに対応する `ty-plus-v0.10.3-<platform>.zxp` を取得し、ZXP対応インストーラで導入してAfter Effectsを再起動します。**Window > Extensions** から ty-plus を開きます。

- `platform` は `windows` / `macos`
- ZIPは手動設置・検証用です。ZIP内のCEP拡張はZXP署名の恩恵を受けないため、環境によってはCEP開発者モードが必要です。通常の利用にはZXPを推奨します。

## 既知の制約

- 署名済みZXPは継続利用する自己署名証明書で署名しています（発行者表示は検証されません）。更新でも同じ主体を維持します（`docs/operations/zxp-signing-identity.md`）。
- Windows版は未署名workerのため、Smart App Control 有効環境では動作しません。
- macOS版はDeveloper ID署名・未公証です（ADR-0003 Amendment 1）。`xattr -w com.apple.quarantine` 等で隔離された場合や、macOSのポリシー変更時には初回起動が拒否され得ます。
- 自動更新は行いません。更新確認はGitHub Releases APIへの読み取りのみで、ダウンロード・インストールは手動です。
- オンライン機能（preset library・通知 feed・更新確認）は R0 では dormant です。コア機能はオフラインで動作します。

## 検証

成果物のSHA-256、署名、`sourceCommit`、チャンネル整合は `docs/verification/release-candidate-0-10-3.md` に記載しています。実機確認の範囲と未検証事項もそこに明記しています。
