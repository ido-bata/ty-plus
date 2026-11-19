# ty-plus v0.11.0

v0.10.3 以降のシステム品質再構成（Issue #189）を含むリリースです。無料・アカウント不要で、ローカル機能はオフラインで動作します。

## この版について

- 配布channel: **Stable**（`v0.11.0`、GitHub `prerelease=false`）
- CEP数値版: `0.11.0` / 配布版: `0.11.0`
- 更新元: 本リポジトリのGitHub Releases（アプリ内の Settings → Updates から確認できます）

## 変更内容

### オフラインコアの確立

- 未提供のオンライン機能（Preset Library、cloud catalog、public link、cloud gateway、sync、download、Rust `online` crate、`online.*` wire method）を構造ごと撤去。到達不能な dormant 層・fixture・dead UI 導線を残さない構成へ再編しました
- 提供するオンライン面は公式の静的 feed（更新確認・通知）のみです。ローカルコアは完全にオフラインで動作します

### 保存基盤（ADR-0006）

- CEP の複数実行コンテキスト（panel / dialog / worker）が managed root 配下の共有ファイルを読み書きする際の lost-update を、managed-root persistence lock（mkdir + owner token + heartbeat + atomic stale-break + 再入可能）で解消しました
- workspace layout、widgets、settings、groups、presets、clipboard、i18n、panel chrome、snapshot、backup restore、cross-panel move 等の RMW を lock 内 transaction へ移行し、JSON 書き込みは temp + same-directory rename の atomic 公開です
- 既存ユーザーデータ（settings / workspace / widgets / presets / groups）は形式を変更せず、更新で上書きされません

### Preset 取込・icon 解決の単一 owner 化

- フォルダ走査の preset 収集を type 非依存の単一経路へ統一し、group preset の script/plugin 等の全 type に対応しました
- preset icon 解決を単一 owner へ集約し、sibling 画像の導出値とユーザー設定の永続化 icon を分離しました。workspace tile・catalog・info card で同一の解決経路を使います

### UI 操作モデルの再構成と品質契約

- IconEditor・preset list・DirectoryBrowser・Dialog・Workspace・主要 Widget を product-model の操作単位で再監査し、portal 配置の共通 primitive（`AnchoredPopover`）で popover/overlay のクリップ・重なりを構造的に排除しました
- Storybook に実 DOM の layout / 操作状態 assertion 層を導入し、hover/focus/selected/drag・複数 viewport・長い文字列・空状態・エラー状態を機械判定可能にしました（最終的な視覚受入は人間の確認が前提です）

## 対応OS

| platform | 状態 | 備考 |
| --- | --- | --- |
| Windows (x64) | **配布** | workerはADR-0003によりAuthenticode未署名。SmartScreenの警告が出る場合があり、**Smart App Control有効環境では起動しません** |
| macOS | **配布** | Developer ID Application署名済み・未公証（ADR-0003 Amendment 1）。`spctl`で未公証と判定されますが、拡張の内部workerは通常ブラウザ経由の隔離を受けません |

## インストール

利用中のOSに対応する `ty-plus-v0.11.0-<platform>.zxp` を取得し、ZXP対応インストーラで導入してAfter Effectsを再起動します。**Window > Extensions** から ty-plus を開きます。

- `platform` は `windows` / `macos`
- ZIPは手動設置・検証用です。ZIP内のCEP拡張はZXP署名の恩恵を受けないため、環境によってはCEP開発者モードが必要です。通常の利用にはZXPを推奨します。

## 既知の制約

- 署名済みZXPは継続利用する自己署名証明書で署名しています（発行者表示は検証されません）。更新でも同じ主体を維持します（`docs/operations/zxp-signing-identity.md`）。
- Windows版は未署名workerのため、Smart App Control 有効環境では動作しません。
- macOS版はDeveloper ID署名・未公証です（ADR-0003 Amendment 1）。`xattr -w com.apple.quarantine` 等で隔離された場合や、macOSのポリシー変更時には初回起動が拒否され得ます。
- 自動更新は行いません。更新確認はGitHub Releases APIへの読み取りのみで、ダウンロード・インストールは手動です。
- Control Panel の右クリックメニューは座標アンカーの imperative 実装のままです（`AnchoredPopover` 未移行、別Issue候補として記録済み）。
- 実機AEでの包括受入は RC freeze 後の検証で実施します。

## 検証

成果物のSHA-256、署名、`sourceCommit`、チャンネル整合は `docs/verification/release-candidate-0-11-0.md` に記載しています。実機確認の範囲と未検証事項もそこに明記しています。

