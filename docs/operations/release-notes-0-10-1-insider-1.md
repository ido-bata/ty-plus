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
- 配布パッケージに他platformのworkerが混入しないよう修正

## 対応OS

この版で**実際に release-trust 成果物を生成・監査できた**のは次の範囲です。それ以外は配布しません。

| platform | 状態 | 備考 |
| --- | --- | --- |
| Windows (x64) | **配布候補あり** | workerはADR-0003によりAuthenticode未署名。SmartScreenの警告が出る場合があり、**Smart App Control有効環境では起動しません** |
| macOS | **この版では配布しない** | 公証資格情報が未設定のため、release-trustビルドがfail-closedで停止します（`docs/operations/signing-setup.md`）。Developer ID署名自体は成功しています |

対応OSを「両方」と書かないのは、macOSの成果物が存在しないためです。macOSは公証設定の完了後に別releaseとして出します。

## インストール（Windows）

1. `ty-plus-v0.10.1-insider.1-windows.zxp` を取得します。
2. ZXP対応インストーラで導入し、After Effectsを再起動します。
3. **Window > Extensions** から ty-plus を開きます。

ZIPは手動設置・検証用です。ZIP内のCEP拡張はZXP署名の恩恵を受けないため、環境によってはCEP開発者モードが必要です。通常の利用にはZXPを推奨します。

## 既知の制約

- 署名済みZXPは継続利用する自己署名証明書で署名しています（発行者表示は検証されません）。将来の更新でも同じ主体を維持します（`docs/operations/zxp-signing-identity.md`）。
- Windows版は未署名workerのため、Smart App Control 有効環境では動作しません。
- **Windows実機での起動確認は未実施です**（ビルド・監査・署名検証は完了しています）。不具合があれば `docs/user-guide/` の不具合報告手順で知らせてください。
- macOS版は本リリースに含みません（公証未設定）。
- 自動更新は行いません。更新確認はGitHub Releases APIへの読み取りのみで、ダウンロード・インストールは手動です。

## 検証

成果物のSHA-256、署名、`sourceCommit`、チャンネル整合は `docs/verification/release-candidate-0-10-1-insider-1.md` に記載しています。実機確認の範囲もそこに明記しています。
