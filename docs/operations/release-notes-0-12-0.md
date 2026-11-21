# ty-plus v0.12.0

v0.10.3 以降の変更を含むリリースです。無料・アカウント不要で、ローカル機能はオフラインで動作します。

## この版について

- 配布channel: **Stable**（`v0.12.0`、GitHub `prerelease=false`）
- CEP数値版: `0.12.0` / 配布版: `0.12.0`
- 更新元: 本リポジトリのGitHub Releases（アプリ内の Settings → Updates から確認できます）

## 変更内容

### 公式Webサイトの公開

- 製品サイトを新設しました。トップページは実際のプリセットタイルとInfo Widgetを再現した**動作する製品デモ**で、ホバー・選択（Ctrl/Cmd+クリック）・複数選択・適用の操作感をブラウザ上で確認できます
- Featuresページは実製品の画面キャプチャを使い、「操作 → 状態 → 結果」の対応を視覚的に説明します
- ChangelogページはGitHub Releasesと連動し、各リリースのユーザー向け変更を優先して表示します
- Download / Docs / Supportページを整備し、導入手順と既知の制約をまとめています

### 製品UIの共有コンポーネント化

- プリセットタイル・グリフ描画・Info cardなどのUI実装をホスト非依存の共有コンポーネントへ整理し、WebサイトとAfter Effectsパネルで**同一の実装**を使う構成にしました
- この整理に伴い、パネル側の内部実装をリファクタリングしています。プリセットの選択・実行・情報表示の動作契約は維持しています

### UI基盤と品質ゲート

- 共有UIプリミティブ（Button / Surface / Badge / Notice）とデザイントークンを `packages/ui` として整備しました
- Webサイトのデザイン規約を機械的に検査する lint（`check-web-design`）を追加し、共有UIの迂回を防ぎます

## 対応OS

| platform | 状態 | 備考 |
| --- | --- | --- |
| Windows (x64) | **配布** | workerはADR-0003によりAuthenticode未署名。SmartScreenの警告が出る場合があり、**Smart App Control有効環境では起動しません** |
| macOS | **配布** | Developer ID Application署名済み・未公証（ADR-0003 Amendment 1）。`spctl`で未公証と判定されますが、拡張の内部workerは通常ブラウザ経由の隔離を受けません |

## インストール

利用中のOSに対応する `ty-plus-v0.12.0-<platform>.zxp` を取得し、ZXP対応インストーラで導入してAfter Effectsを再起動します。**Window > Extensions** から ty-plus を開きます。

- `platform` は `windows` / `macos`
- ZIPは手動設置・検証用です。ZIP内のCEP拡張はZXP署名の恩恵を受けないため、環境によってはCEP開発者モードが必要です。通常の利用にはZXPを推奨します。

## 既知の制約

- 署名済みZXPは継続利用する自己署名証明書で署名しています（発行者表示は検証されません）。更新でも同じ主体を維持します（`docs/operations/zxp-signing-identity.md`）。
- Windows版は未署名workerのため、Smart App Control 有効環境では動作しません。
- macOS版はDeveloper ID署名・未公証です（ADR-0003 Amendment 1）。`xattr -w com.apple.quarantine` 等で隔離された場合や、macOSのポリシー変更時には初回起動が拒否され得ます。
- 自動更新は行いません。更新確認はGitHub Releases APIへの読み取りのみで、ダウンロード・インストールは手動です。
- Webサイト上の製品デモはブラウザ内のローカル状態です。実際のプリセット適用はAfter Effectsパネルで行われます。

## 検証

成果物のSHA-256、署名、`sourceCommit`、チャンネル整合は `docs/verification/release-candidate-0-12-0.md` に記載しています。実機確認の範囲と未検証事項もそこに明記しています。
