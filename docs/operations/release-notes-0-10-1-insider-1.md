# ty-plus v0.10.1 Insider 1

初回の **Insider** ビルドです。無料・アカウント不要で、ローカル機能はオフラインで動作します。

## この版について

- 配布channel: **Insider**（`v0.10.1-insider.1`、GitHub `prerelease=true`）
- CEP数値版: `0.10.1` / 配布版: `0.10.1-insider.1`
- 更新元: 本リポジトリのGitHub Releases（アプリ内の Settings → Updates から確認できます）

## 変更内容

- GitHub Releasesを更新・配布の正本とする更新経路（Stable / Beta / Insider）。Insiderは同一数値版の連番（`insider.1` → `insider.2`）も更新として検出します
- 設定画面に更新channelの選択を追加（選択はローカル設定に保存）
- 設定保存時にワークスペースのレイアウト・スナップショットが失われないよう修正
- リリース成果物の監査をfail-closed化（署名証拠・版・channel・同梱物の不一致を公開前に拒否）

## 対応OS

- **macOS**: Developer ID署名 + 公証済み
- **Windows**: R0の方針により worker はAuthenticode未署名。SmartScreenの警告が表示される場合があり、**Smart App Controlが有効な環境では起動がブロックされます**（`docs/architecture/distribution.md`）。

実際に実機検証した範囲のみを対応OSとして記載しています。詳細は下記の検証記録を参照してください。

## インストール

1. このリリースの `ty-plus-v0.10.1-insider.1-<platform>.zxp` を取得します（`platform` は `macos` または `windows`）。
2. ZXP対応インストーラで導入し、After Effectsを再起動します。
3. **Window > Extensions** から ty-plus を開きます。

ZIPは手動設置・検証用です。ZIP内のCEP拡張はZXP署名の恩恵を受けないため、環境によってはCEP開発者モードが必要です。通常の利用にはZXPを推奨します。

## 既知の制約

- 署名済みZXPは継続利用する自己署名証明書で署名しています（発行者表示は検証されません）。将来の更新でも同じ主体を維持します。
- Windows版は未署名workerのため、Smart App Control有効環境では動作しません。
- 自動更新は行いません。更新確認はGitHub Releases APIへの読み取りのみで、ダウンロード・インストールは手動です。

## 検証

成果物のSHA-256、署名・公証、`sourceCommit`、チャンネル整合は `docs/verification/` の検証記録に記載しています。
