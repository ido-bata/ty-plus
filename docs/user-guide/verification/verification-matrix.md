# 機能検証表

検証日: 2026-06-03  
対象: Adobe After Effects 2026 / CEP 12 / ZXP Installer 経由インストール

この表は、実施済みと未実施を混ぜないための管理表です。未実施の項目は、ユーザーガイド本文で「確認済み」として扱いません。

## 導入と初期化

| ID | 分岐 | 状態 | 証拠 | メモ |
| --- | --- | --- | --- | --- |
| I-01 | ZXP Installer で `.zxp` を読み込む | 合格 | `installation/screenshots/install-01-zxp-installer-confirm.png` | `/Users/samuido/Desktop/ty-plus.zxp` から開始 |
| I-02 | インストール後の配置確認 | 合格 | `functional-verification.md` | system 側のみ `ty-plus`、user 側なし |
| I-03 | After Effects の Window > Extensions 表示 | 合格 | `main-screen/screenshots/main-01-window-extensions-ty-plus.png` | panel 2-5 も表示 |
| I-04 | 初回オンボーディング視認 | 一部不合格 | `main-screen/screenshots/main-02-ty-plus-panel-black.png` | 基準 ZXP は黒画面 |
| I-05 | 10 ステップオンボーディング完了 | 合格 | `installation/screenshots/onboarding-*.png` | Presets のみ選択 |
| I-06 | オンボーディングの複数回実行とリセット | 未実施 | - | 再実行前後の全 JSON 比較が必要 |

## AEP / AE 実作業前提

| ID | 分岐 | 状態 | 証拠 | メモ |
| --- | --- | --- | --- | --- |
| AE-01 | `.aep` を開いた状態で主パネルを使う | 未実施 | - | 現在は Untitled Project |
| AE-02 | 検証用 `.aep` を保存してから各機能を使う | 合格 | `/Users/samuido/Desktop/ty-plus-verification/ty-plus-functional-verification.aep` | 保存済み project、comp、text layer、position keyframes を作成 |
| AE-03 | Easing Apply を実キーフレームへ適用 | 合格 | `presets/screenshots/presets-11-easing-applied-to-saved-aep.png` / `presets/screenshots/presets-12-easing-before-after.json` | interpolation と influence の変化を確認 |
| AE-04 | Align を実レイヤーへ適用 | 不合格 | `widgets/screenshots/widgets-03-align-disabled-with-selected-layer.png` | 保存済み AEP と選択レイヤーありでも Align / Distribute 実行ボタンが無効 |
| AE-05 | Anchor Point を実レイヤーへ適用 | 未実施 | - | 9 点すべて |
| AE-06 | Info ウィジェットが実コンポ情報を表示 | 未実施 | - | comp サイズ、fps、選択数など |

## プリセット実行

| ID | 分岐 | 状態 | 証拠 | メモ |
| --- | --- | --- | --- | --- |
| PR-01 | オンボーディング取り込み `.ffx` を実レイヤーへ適用 | 合格 | `presets/screenshots/presets-04-ffx-applied.png` | Effect Controls 追加を確認 |
| PR-02 | Animation Preset を作成して登録 | 不合格 | `presets/screenshots/presets-15-animation-preset-create-result.png` | `Presets/ty-plus/presets` フォルダ作成失敗。登録は残らない |
| PR-03 | Layer Preset を作成して登録 | 不合格 | `presets/screenshots/presets-13-layer-preset-created.png` | 保存先フォルダ作成失敗通知後、実体なしの script preset が登録された |
| PR-04 | Comp Preset を作成して登録 | 不合格 | `presets/screenshots/presets-16-comp-preset-create-result.png` | `comp-presets` フォルダ作成失敗後、実体なし script preset が登録された。検証後削除 |
| PR-05 | Code Preset を作成して登録 | 不合格 | `presets/screenshots/presets-14-code-preset-create-result.png` | `code-presets` フォルダ作成失敗。Layer と違い登録は残らない |
| PR-06 | Footage Preset を作成して登録 | 不合格 | `presets/screenshots/presets-19-footage-created.png` | 右クリック相当のダイアログは開くが、作成後 `保存中...` で停止し、登録なし |
| PR-07 | Import Preset を作成して登録 | 合格 | `presets/screenshots/presets-21-import-create-result.png` | `footage` 型として登録され、workspace にも追加。検証後削除 |
| PR-08 | Text Style Preset を作成して登録 | 不合格 | `presets/screenshots/presets-23-text-style-created.png` | ダイアログは閉じるが `presets.json` / workspace に登録が残らない |
| PR-09 | Easing Preset を作成して登録 | 不合格 | `presets/screenshots/presets-26-easing-create-result.png` | `Scripts/ty-plus/easing` が作成されず、登録も残らない |
| PR-10 | Group Preset を作成して登録 | 未実施 | - | Cancel 表示のみ確認済み |
| PR-11 | 作成済み全種プリセットを実行 | 未実施 | - | `preset` / `script` / `plugin` / `footage` |
| PR-12 | 編集、複製、削除、グループ化、グループ解除 | 未実施 | - | 右クリック全アクション |

## ファイル拡張子対応

| ID | 分岐 | 状態 | 証拠 | メモ |
| --- | --- | --- | --- | --- |
| EX-01 | `.ffx` | 一部合格 | `presets/screenshots/presets-04-ffx-applied.png` | Directory Browser 経由は未実施 |
| EX-02 | `.jsx` | 未実施 | - | 実行と副作用確認 |
| EX-03 | `.jsxbin` | 未実施 | - | 実行可否確認 |
| EX-04 | `.aep` | 未実施 | - | import / open の仕様確認が必要 |
| EX-05 | `.aepx` | 未実施 | - | Directory Browser 表示と操作 |
| EX-06 | `.aex` / `.plugin` | 未実施 | - | applyEffectByMatchName 分岐 |
| EX-07 | 画像 / 動画 / 音声 | 未実施 | - | addFootage 分岐 |
| EX-08 | `.mogrt` / `.json` / text / unknown | 未実施 | - | UI 表示と操作可否 |

## ダイアログと追加パネル

| ID | 分岐 | 状態 | 証拠 | メモ |
| --- | --- | --- | --- | --- |
| D-01 | Settings modeless | 一部不合格 | `settings/screenshots/settings-*.png` | Reset が危険 |
| D-02 | Online Preset Library modeless | 一部不合格 | `online-presets/screenshots/online-presets-*.png` | Download が実体保存失敗 |
| D-03 | Messages modeless | 合格 | `messages/screenshots/messages-01-list-visible.png` | 表示のみ |
| D-04 | Local Preset ダイアログ | 合格 | `presets/screenshots/presets-06-local-preset-dialog-visible.png` | Cancel のみ |
| D-05 | Group / Animation / Layer/Comp / Code ダイアログ | 合格 | `presets/screenshots/presets-07-*.png` | Cancel のみ |
| D-06 | Footage / Import / Text Style / Easing ダイアログ | 一部不合格 | `presets/screenshots/presets-17-footage-dialog-visible.png` / `presets/screenshots/presets-20-import-dialog-visible.png` / `presets/screenshots/presets-22-text-style-dialog-visible.png` / `presets/screenshots/presets-25-easing-create-dialog-visible.png` | ハンドオフ付きの右クリック相当起動で表示。保存結果は種別により差あり |
| D-07 | Background ダイアログ | 未実施 | - | 背景保存と反映 |
| D-08 | Debug console | 未実施 | - | 開閉、ログ表示 |
| D-09 | panel 2 / panel 3 / panel 4 / panel 5 | 一部不合格 | `main-screen/screenshots/main-09-panels-2-5-opened.png` | 起動はするが、本文グリッドは空で主パネル内容は同期表示されない |

## 右クリックアクション

| ID | 分岐 | 状態 | 証拠 | メモ |
| --- | --- | --- | --- | --- |
| RC-01 | Workspace 空白右クリック | 合格 | `main-screen/screenshots/main-12-context-menu-captures.json` / `main-screen/screenshots/main-13-context-menu-summary.json` | Undo/Redo/Layout/Add Widget/Create Preset が登録される |
| RC-02 | Preset タイル右クリック | 合格 | `main-screen/screenshots/main-13-context-menu-summary.json` | Open/Edit/Move/Delete/Release Group が登録される |
| RC-03 | Group タイル右クリック | 一部合格 | `main-screen/screenshots/main-13-context-menu-summary.json` | Adobe Express group tile で Preset タイルメニューを確認。グループ内部専用メニューは未実行 |
| RC-04 | Widget 右クリック | 合格 | `main-screen/screenshots/main-13-context-menu-summary.json` | Move to panel/Delete を quick/info widget で確認 |
| RC-05 | Easing Widget 右クリック | 合格 | `main-screen/screenshots/main-13-context-menu-summary.json` | Apply/Copy/Reverse/Preset/Background/Apply Mode/Label Color/Move/Delete を確認 |
| RC-06 | Directory Browser 右クリック | 未実施 | - | refresh/go up/select/open/import |
| RC-07 | Background Dialog 右クリック | 未実施 | - | layer type/order/checkable |
| RC-08 | Align / Anchor widget 右クリック | 合格 | `main-screen/screenshots/main-13-context-menu-summary.json` | Align は全アクション項目表示、Anchor は 9 点と適用範囲を表示 |

## 外部連携

| ID | 分岐 | 状態 | 証拠 | メモ |
| --- | --- | --- | --- | --- |
| L-01 | マニュアルリンクから既定ブラウザが開く | 一部合格 | `installation/screenshots/install-08-manual-link-browser-opened.png` | CEP から Notion manual URL を開くと Chrome が前面化。通常画面のメニューには manual 項目なし |
| L-02 | SetupRequired の外部リンク | 一部合格 | `installation/screenshots/install-08-manual-link-browser-opened.png` | 同一 Notion URL のブラウザ起動を確認。オンボーディング画面のボタン再表示は未実施 |
| L-03 | オンラインカタログ検索 | 未実施 | - | 表示のみ確認済み |
| L-04 | オンライン重複ダウンロード | 未実施 | - | 失敗時ロールバック含む |

## 背景とレイアウト

| ID | 分岐 | 状態 | 証拠 | メモ |
| --- | --- | --- | --- | --- |
| BG-01 | 背景ダイアログを開く | 合格 | `appearance/screenshots/appearance-01-background-dialog-visible.png` | Menu の `背景...` から `dialog-background-panel` を表示 |
| BG-02 | 色背景の追加/保存/反映 | 合格 | `appearance/screenshots/appearance-02-background-saved.png` | `workspaces/background/background-1.json` に color layer が保存された。検証後 `null` にリセット |
| BG-03 | パターン背景の追加/保存/反映 | 未実施 | - | dot / grid |
| BG-04 | 画像背景の追加/保存/反映 | 未実施 | - | パス参照 |
| BG-05 | 背景レイヤー削除/順序変更 | 未実施 | - | 右クリック含む |
| LY-01 | Add Widget 実追加 | 合格 | `widgets/screenshots/widgets-02-add-widget-added.png` | `quick-actions` が widgets.json と workspace-1.json に追加された。検証後削除 |
| LY-04 | Add Widget で Directory Browser を選択して追加 | 不合格 | `widgets/screenshots/widgets-04-directory-browser-added.png` | Directory Browser をクリック後に Add しても `quick-actions` が追加された。追加IDは削除済み |
| LY-02 | レイアウト保存スナップショット | 未実施 | - | Save layout snapshot |
| LY-03 | Undo / Redo | 未実施 | - | 状態比較 |
| LY-05 | Lock Layout | 未実施 | - | 移動可否比較 |
