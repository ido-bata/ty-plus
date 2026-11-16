# インストール・更新・アンインストール

**公開中のStable版:** [ty-plus GitHub Releases](https://github.com/ido-bata/ty-plus/releases/latest)  
ty-plusは無料・アカウント不要で、ローカルの主要機能をオフラインで利用できます。

## 動作環境と注意事項

| 項目 | 状態 |
| --- | --- |
| ホスト | Adobe After Effects（CEP拡張） |
| 配布OS | Windows x64 / macOS |
| 初期動作確認 | AE 2026の開発ビルドでスモーク検証。公開済み`v0.10.1`のZXP実機E2Eは[Issue #10](https://github.com/ido-bata/ty-plus/issues/10)で継続 |
| Windows | native workerはAuthenticode未署名。**Smart App Controlが有効な環境では起動がブロックされます** |
| macOS | Developer IDでworkerを署名済みですが、`v0.10.1`は**未公証**です。隔離属性やmacOSポリシーによって起動できない場合があります |
| ZXP | 継続利用する自己署名のCEP証明書で署名。macOS workerの公証とは独立 |
| ネットワーク | 更新確認時のみ必要。オフラインで主要機能を利用可能 |

インストールのためにWindowsやmacOSの保護機能を無効化しないでください。ブロックされる場合は、OS・AEのバージョンと状況を[Issues](https://github.com/ido-bata/ty-plus/issues/new/choose)へ報告してください。

## 公式ZXPをインストール

1. **[最新のStableリリース](https://github.com/ido-bata/ty-plus/releases/latest)**を開きます。
2. Windowsなら`ty-plus-<tag>-windows.zxp`、macOSなら`ty-plus-<tag>-macos.zxp`を取得します。対応するZIPと`-release-manifest.json`もリリースに含まれます。
3. CEP対応のZXPインストーラを使って導入します。初回起動時にはOSのセキュリティ設定によって拒否される場合があります。
4. After Effectsを再起動し、**Window → Extensions → ty-plus** を開きます。

正常に開けない場合、[トラブルシューティング](../troubleshooting/index.md)を参照してください。

## 手動ZIP導入（開発・検証用）

署名済みZXPが使えない場合は、同じリリースのZIPを展開し、`app.ty-plus/`フォルダを以下へ配置できます。

- Windows: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\app.ty-plus`
- macOS: `/Library/Application Support/Adobe/CEP/extensions/app.ty-plus`

**ZIPの直接配置ではZXPの署名を利用できません。** CEP開発者モードが必要になる環境があるため、通常の利用にはZXPを推奨します。

## 更新チャンネル

Settings → Updatesで更新チャンネルを変更できます。

| チャンネル | 受信対象 |
| --- | --- |
| Stable | 通常の安定版リリースのみ |
| Beta | StableとBeta |
| Insider | Stable、Beta、Insiderのすべて |

アプリは公開GitHub Releasesの最新版を読み取り、リリースページを開きます。**自動ダウンロードや自動インストールは行いません**。チャンネルを変更しても自動的に旧版へ戻しません。

## アンインストールとデータ

CEP拡張`app.ty-plus/`をアンインストールしてAfter Effectsを再起動します。ローカルの設定・ワークスペース情報はサポートルートに残る場合があります。場所はSettings → Pathsを参照してください。削除前に必要なデータをバックアップしてください。

## 不具合・セキュリティ報告

- 通常の不具合や改善提案：[GitHub Issues](https://github.com/ido-bata/ty-plus/issues/new/choose)
- 未公開の脆弱性：[Private vulnerability reporting](https://github.com/ido-bata/ty-plus/security/advisories/new)（公開Issueでは報告しない）

不具合報告にはOS・AE・ty-plusのバージョン、再現手順、期待値/実結果、エラーがあればログを添えてください。認証情報、個人データ、機密ファイルは公開しないでください。
