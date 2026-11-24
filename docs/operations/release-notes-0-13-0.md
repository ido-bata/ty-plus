# ty-plus v0.13.0

v0.12.0 以降の変更を含むリリースです。無料・アカウント不要で、ローカル機能はオフラインで動作します。

## この版について

- 配布channel: **Stable**（`v0.13.0`、GitHub `prerelease=false`）
- CEP数値版: `0.13.0` / 配布版: `0.13.0`
- 更新元: 本リポジトリのGitHub Releases（アプリ内の Settings → Updates から確認できます）

## 変更内容

### Widget チュートリアル

- Widget ごとの使い方を説明するチュートリアル（ステップツアー・初回ヒント）を追加しました
- Settings → Tips からチュートリアルの再表示・リセットができます

### Loop widget

- サイクリックモーションを編集する Loop widget を新規追加しました

### 多言語対応

- アプリと公式Webサイトを10言語に対応しました（英語・日本語・ドイツ語・スペイン語・フランス語・イタリア語・韓国語・ポルトガル語ほか）
- 言語切替は Settings → General から行え、選択は再起動後も維持されます

### アップデート導線の修正

- Settings ダイアログからのアップデートインストールが正しく実行されるようになりました（これまで `manual_required` にフォールバックしていました）
- Settings ダイアログ起動時の `Uncaught [object Event]` エラーを修正しました

### プリセット・UI の修正

- プリセットリストでアイコンが正しく左に表示されないレイアウト崩れを修正しました
- プリセットアイコンエディタのプレビュータイルが初期状態で潰れる問題を修正しました
- Easing widget に分離済みの「ループ」モードが誤って表示される問題を修正しました
- パネル内のボタン・ダイアログを共有UIコンポーネントへ統一し、見た目と操作感を全体で揃えました

### 保存・整合性

- managed-root への永続化にロックを導入し、複数 surface からの同時書き込みによる破損を防ぎます

## 対応OS

| platform | 状態 | 備考 |
| --- | --- | --- |
| Windows (x64) | **配布** | workerはADR-0003によりAuthenticode未署名。SmartScreenの警告が出る場合があり、**Smart App Control有効環境では起動しません** |
| macOS | **配布** | Developer ID Application署名済み・未公証（ADR-0003 Amendment 1）。`spctl`で未公証と判定されますが、拡張の内部workerは通常ブラウザ経由の隔離を受けません |

## インストール

利用中のOSに対応する `ty-plus-v0.13.0-<platform>.zxp` を取得し、ZXP対応インストーラで導入してAfter Effectsを再起動します。**Window > Extensions** から ty-plus を開きます。

- `platform` は `windows` / `macos`
- ZIPは手動設置・検証用です。ZIP内のCEP拡張はZXP署名の恩恵を受けないため、環境によってはCEP開発者モードが必要です。通常の利用にはZXPを推奨します。

## 既知の制約

- 署名済みZXPは継続利用する自己署名証明書で署名しています。証明書の詳細と信頼モデルは `docs/architecture/distribution.md` を参照してください
- macOS worker は未公証のため、初回起動時に Gatekeeper の警告が出る場合があります
- Windows worker は未署名のため、SmartScreen の警告が出ます
- 一部の自動 E2E 受入ケース（preset 実行・settings dialog 起動まわり）で未解決の失敗が観測されています。詳細は `docs/verification/e2e-acceptance/results/2026-11-24-device-macos-ae2027-dev.md` を参照してください
