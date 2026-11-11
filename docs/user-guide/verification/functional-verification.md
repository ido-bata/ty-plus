# 機能検証ログ

検証日: 2026-06-03  
対象 ZXP: `/Users/samuido/Desktop/ty-plus.zxp`  
再検証 ZXP: `/Users/samuido/Desktop/ty-plus-fixed.zxp`  
Modeless 修正再検証 ZXP: `/Users/samuido/Desktop/ty-plus-modeless-fixed.zxp`  
対象ホスト: Adobe After Effects 2026 / CEP 12

## 現在の到達範囲

このログは、全機能の完了報告ではありません。実施済みの枝だけを記録しています。未実施を含む全体表は `docs/user-guide/verification/verification-matrix.md` を参照してください。

特に、保存済み `.aep` を前提にした Layer / Composition 保存、Easing の成功適用、背景設定、追加パネル、全右クリックアクション、マニュアルリンクのブラウザ起動、全種プリセットと拡張子対応は未完了です。

## 参照した CEP 仕様

- `reference/Adobe-CEP/Getting-Started-guides/Package Distribute Install/readme.md`
  - ZXP は署名済みパッケージとして配布・インストールする。
  - `ZXPSignCmd -verify` は署名を検証するが、拡張の中身までは検証しない。
  - `ExManCmd --install <zxpPath>` はインストール手段の 1 つだが、今回は ZXP Installer の UI を優先した。
- `reference/Adobe-CEP/CEP-Resources/CEP_12.x/Documentation/CEP 12 HTML Extension Cookbook.md`
  - CEP/CSXS 拡張は `CSXS/manifest.xml` の `MainPath` と `ScriptPath` を起点に読み込まれる。
  - CEPHtmlEngine のログは `~/Library/Logs/CSXS` に出る。
- `reference/Adobe-CEP/CEP-Resources/ZXPSignCMD/KnownIssue2024.md`
  - 2024 年以降の ZXP 署名・シンボリックリンク由来の blank panel 問題を既知リスクとして扱う。

## 分岐型チェック

### 1. ZXP を ZXP Installer で読み込めるか

結果: 合格

証拠:

- `docs/user-guide/installation/screenshots/install-01-zxp-installer-confirm.png`
- `docs/user-guide/installation/screenshots/install-02-zxp-installer-success.png`
- `docs/user-guide/installation/screenshots/install-03-zxp-installer-installed-list.png`

確認内容:

- ZXP Installer に `ty-plus (0.9.1)` と表示された。
- `Install` 実行後、`ty-plus was successfully installed` と表示された。

### 2. インストール前後で CEP extensions 配置を比較できるか

結果: 合格

確認対象:

```text
/Library/Application Support/Adobe/CEP/extensions
/Users/samuido/Library/Application Support/Adobe/CEP/extensions
```

結果:

- システム側: `/Library/Application Support/Adobe/CEP/extensions/ty-plus` が更新された。
- ユーザー側: ty-plus / app.ty-plus は作成されなかった。

注意:

- ZXP 内の `ExtensionBundleId` は `app.ty-plus` だが、ZXP Installer の展開フォルダは `ty-plus` だった。
- インストール中の ZXP Installer ログでは `Uninstallation of app.ty-plus (-406)` のあと、既存 `ty-plus` の削除と再インストールが実行された。

### 3. After Effects の Window > Extensions に表示されるか

結果: 合格

証拠:

- `docs/user-guide/main-screen/screenshots/main-01-window-extensions-ty-plus.png`

確認内容:

- `Window > Extensions > ty-plus`
- `ty-plus panel 2`
- `ty-plus panel 3`
- `ty-plus panel 4`
- `ty-plus panel 5`

### 4. 主パネルを開くと初回オンボーディングが視認できるか

結果: 基準 ZXP は不合格、修正 ZXP は合格

証拠:

- `docs/user-guide/main-screen/screenshots/main-02-ty-plus-panel-black.png`
- `docs/user-guide/verification/panel-dom-evidence.json`
- `docs/user-guide/installation/screenshots/install-04-fixed-zxp-installer-confirm.png`
- `docs/user-guide/installation/screenshots/install-05-fixed-zxp-installer-success.png`
- `docs/user-guide/installation/screenshots/install-06-fixed-zxp-installer-installed-list.png`
- `docs/user-guide/main-screen/screenshots/main-05-fixed-zxp-onboarding-visible.png`
- `docs/user-guide/verification/fixed-zxp-panel-runtime.json`

観測:

- 基準 ZXP では After Effects 上の ty-plus パネル領域が黒く見えた。
- CEPHtmlEngine ログには起動失敗の例外は出ていない。
- DevTools Protocol で DOM を見ると、オンボーディング本文 `1. ようこそ / 1 / 10` は存在する。
- 基準 ZXP の `panel.entry.cjs` には `appearance-boot` の `cep-shell.bundle.css` 注入コードが含まれていなかった。
- 修正 ZXP では `cep-shell.bundle.css` が読み込まれ、オンボーディングが After Effects 上で視認できた。

判定:

- 基準 ZXP の問題は「読み込み失敗」ではなく、シェル CSS 読み込み経路不足による初回オンボーディングの視認不能として扱う。
- 修正 ZXP では ZXP Installer 経由の再インストール後、OS スクリーンショットでもオンボーディングが表示された。

### 5. オンボーディングを完了できるか

結果: 合格

証拠:

- `docs/user-guide/installation/screenshots/onboarding-02-language.png`
- `docs/user-guide/installation/screenshots/onboarding-03-after-effects-folder-auto-detected.png`
- `docs/user-guide/installation/screenshots/onboarding-05-presets-folder-candidates.png`
- `docs/user-guide/installation/screenshots/onboarding-05-presets-folder-selected.png`
- `docs/user-guide/installation/screenshots/onboarding-06-scripts-candidates.png`
- `docs/user-guide/installation/screenshots/onboarding-07-plugin-candidates.png`
- `docs/user-guide/main-screen/screenshots/onboarding-08-workspace-basics.png`
- `docs/user-guide/presets/screenshots/onboarding-09-adding-presets.png`
- `docs/user-guide/installation/screenshots/onboarding-10-ready-to-finish.png`
- `docs/user-guide/main-screen/screenshots/main-06-after-onboarding-workspace.png`

分岐:

1. 言語: 日本語のまま次へ進めた。
2. After Effects フォルダ: `/Applications/Adobe After Effects 2026/` が自動検出された。
3. 自動検出成功により、サブフォルダ設定ステップはスキップされ、プリセット選択へ進んだ。
4. Presets: `/Applications/Adobe After Effects 2026/Presets/Adobe Express` を選択した。
5. Scripts / Plug-ins: 候補一覧は出るが、今回は未選択で進めた。
6. Finish 後、ワークスペースへ戻った。

完了後の生成ファイル:

```text
/Applications/Adobe After Effects 2026/ty-plus/data/settings.json
/Applications/Adobe After Effects 2026/ty-plus/groups/groups.json
/Applications/Adobe After Effects 2026/ty-plus/presets/presets.json
/Applications/Adobe After Effects 2026/ty-plus/settings/paths.json
/Applications/Adobe After Effects 2026/ty-plus/widgets/widgets.json
/Applications/Adobe After Effects 2026/ty-plus/workspaces/workspace-1.json
```

確認結果:

- `presets.json` に Adobe Express の `.ffx` が 27 件登録された。
- `groups.json` に `Adobe Express` グループが作成された。
- `workspace-1.json` に `Adobe Express` グループが配置された。
- パネル下部に `FFX 27` のグループタイルが表示された。

### 6. 取り込んだ `.ffx` プリセットを実レイヤーへ適用できるか

結果: 合格

証拠:

- `docs/user-guide/presets/screenshots/presets-01-group-opened.png`
- `docs/user-guide/presets/screenshots/presets-02-apply-without-target-error.png`
- `docs/user-guide/presets/screenshots/presets-03-ae-target-created.png`
- `docs/user-guide/presets/screenshots/presets-04-ffx-applied.png`
- `docs/user-guide/presets/screenshots/presets-05-ae-state-after-ffx.json`

分岐:

1. アクティブコンポジションなしでイージングの Apply を押すと、`Select keyframes in an active composition` が表示された。
2. 検証用コンポジション、テキストレイヤー、位置キーフレームを作成した。
3. Adobe Express グループ内の `.ffx` タイルをダブルクリックすると、Effect Controls に `Duration`、`Intensity`、`(Transform)` が追加された。

判定:

- `.ffx` タイルのダブルクリック適用は成功した。
- イージングの Apply と `.ffx` タイル適用は UI 上で近くにあるが、実行条件が異なるため、ガイドでは分けて説明する。

### 7. Settings / Online Preset Library の modeless ダイアログを開けるか

結果: 基準修正 ZXP は不合格、modeless 修正 ZXP は合格

証拠:

- `docs/user-guide/online-presets/screenshots/online-presets-01-floating-window-black.png`
- `docs/user-guide/installation/screenshots/install-07-modeless-fixed-zxp-success.png`
- `docs/user-guide/settings/screenshots/settings-01-dialog-visible.png`
- `docs/user-guide/online-presets/screenshots/online-presets-02-library-visible.png`

観測:

- `ty-plus-fixed.zxp` では Online Preset 操作で modeless ウィンドウが黒く表示された。
- インストール済み `modeless/index.html` の `data-styles` に `../cep-shell.bundle.css` が含まれていなかった。
- `scripts/utils/vite-plugin-strip-cep-dev-redirect.js` を修正し、panel / modeless の `data-styles` に `../cep-shell.bundle.css` を追加した。
- `/Users/samuido/Desktop/ty-plus-modeless-fixed.zxp` を ZXP Installer で再インストール後、Settings と Online Preset Library が視認できた。

### 8. オンラインプリセットをダウンロードできるか

結果: 不合格

証拠:

- `docs/user-guide/online-presets/screenshots/online-presets-02-library-visible.png`
- `docs/user-guide/online-presets/screenshots/online-presets-03-download-complete-alert.png`

観測:

- Online Preset Library は 17 件を表示した。
- 先頭の `all-exp-clear` で Download を実行すると、`Download this preset?` の確認後に `Download complete.` が表示された。
- しかし、期待される保存先候補に実ファイルは作成されなかった。
- `presets.json` には `downloaded_PRESET-15` が追加され、件数が 27 から 28 になった。
- 検証後、`downloaded_PRESET-15` を削除して 27 件に戻した。

原因候補:

- `writeBytesToFile` が ExtendScript の戻り値を検証していない。
- `buildWriteBase64FileScript` は Base64 をデコードせず文字列として書く。
- 親ディレクトリ作成が一階層のみで、`Presets/ty-plus/downloads` のような未作成の多段階パスに弱い。
- 登録時の `filePath` が `all-exp-clear.ffx` の basename だけになり、実保存先と結びつかない。

### 9. Settings の Paths 表示、Cancel、Save、Reset は期待通りか

結果: 一部不合格

証拠:

- `docs/user-guide/settings/screenshots/settings-02-paths-expanded.png`
- `docs/user-guide/settings/screenshots/settings-03-reset-click-no-confirm.png`

事前状態:

```text
/Applications/Adobe After Effects 2026/ty-plus/data/settings.json
/Applications/Adobe After Effects 2026/ty-plus/settings/paths.json
```

表示確認:

- Paths セクションには `Support Root`、`Preset Root`、`Script Root`、`Plugin Root` が表示された。
- 表示値は `data/settings.json` と `settings/paths.json` の内容と一致した。

Cancel 分岐:

1. `Support Root` 入力欄を `/tmp/ty-plus-verification-cancel` に変更した。
2. `Cancel` を押した。
3. `data/settings.json` と `settings/paths.json` は変更されなかった。

Save 分岐:

1. 元の値のまま `Save` を押した。
2. `data/settings.json` と `settings/paths.json` は内容・mtime とも変更されなかった。

Reset 分岐:

1. `Reset` を押した。
2. 確認ダイアログは表示されなかった。
3. `settings/paths.json` は変更されなかった。
4. `data/settings.json` は即時変更され、`core.paths.supportRoot` / `presetRoot` / `scriptRoot` / `pluginRoot` が空文字になった。
5. 検証後、`data/settings.json` は事前バックアップから復元した。

判定:

- Paths 表示、Cancel、同値 Save は合格。
- Reset は確認なしで重要なパスを空にするため不合格。Windows から移行したユーザーにとって、設定を失いやすい高リスク操作として扱う。

### 10. Messages modeless を表示できるか

結果: 合格

証拠:

- `docs/user-guide/messages/screenshots/messages-01-list-visible.png`

観測:

- ControlPanel の `Messages` から modeless ウィンドウが開いた。
- `cep-shell.bundle.css` が読み込まれ、黒画面にならず表示された。
- 表示内容は 3 件で、タイトル、本文、日時を確認できた。

### 11. Local Preset 追加ダイアログを表示し、Cancel できるか

結果: 合格

証拠:

- `docs/user-guide/presets/screenshots/presets-06-local-preset-dialog-visible.png`

観測:

- ControlPanel の `Local Preset` から `Add catalog preset from path` が開いた。
- File Path は DOM 上では `/Applications/Adobe After Effects 2026/Presets` と保持されていた。
- 画面上では入力欄の左端が詰まり、先頭の `/` が見えづらい。
- `Cancel` 後、`presets.json` は 27 件のままで、`downloaded_PRESET-15` も残っていなかった。

### 12. Group / Animation / Layer/Comp / Code Preset 追加ダイアログを表示し、Cancel できるか

結果: 合格

証拠:

- `docs/user-guide/presets/screenshots/presets-07-group-preset-dialog-visible.png`
- `docs/user-guide/presets/screenshots/presets-08-animation-preset-dialog-visible.png`
- `docs/user-guide/presets/screenshots/presets-09-layer-comp-preset-dialog-visible.png`
- `docs/user-guide/presets/screenshots/presets-10-code-preset-dialog-visible.png`

事前状態:

```text
presets.json: 27 件 / sha256 0f6aee3078146bb7b1ba6908c2f86ebfc0c3ca35c9d260a3d243083d9fdedd54
widgets.json: 7 件 / sha256 250da9f8cb4433e8c2f650308ee20980b9655d2faaf71c2b1da78cfb8e897384
groups.json: 1 件 / sha256 5b715451fb65b882002a8d0a57ad646ad9b82d09586346afffeb872c795da6f2
workspace-1.json: sha256 741270cf3bd23fa859119a2fd9f0c0c963d023ed9c8c7e110c000982c0db3cac
```

観測:

- Group Preset は Presets / Scripts / Plug-ins / Other の切り替えとフォルダ候補を表示した。
- Animation Preset は After Effects で選択して保存する 3 ステップの UI を表示した。
- Layer/Comp Preset は Layer / Composition の切り替えを表示した。
- Code Preset は Script / Expression の切り替えとコード入力欄を表示した。
- 各ダイアログは `cep-shell.bundle.css` を読み込み、黒画面にならず表示された。
- 各ダイアログを `Cancel` / `キャンセル` で閉じた後、上記 4 ファイルの sha256 は事前状態と一致した。

注意:

- Layer/Comp Preset と Code Preset の保存先は、DOM 上では `/Applications/...` の placeholder として保持されていた。
- 画面上では先頭の `/` が詰まって見え、macOS 移行ユーザーにはパスが相対パスに見える可能性がある。

### 13. Add Widget ダイアログを表示し、Cancel できるか

結果: 合格

証拠:

- `docs/user-guide/widgets/screenshots/widgets-01-add-widget-dialog-visible.png`

観測:

- ControlPanel の `Add Widget` から `Add widget` が開いた。
- 追加先は `panel-1` と表示された。
- Core / Utility の 9 種のウィジェットが一覧表示された。
- `Add` は有効で、初期選択がある状態だった。
- `Cancel` 後、`presets.json`、`widgets.json`、`groups.json`、`workspace-1.json` の sha256 は事前状態と一致した。

### 14. 保存済み AEP を用意して Easing Apply を成功実行できるか

結果: 合格

証拠:

- `/Users/samuido/Desktop/ty-plus-verification/ty-plus-functional-verification.aep`
- `docs/user-guide/presets/screenshots/presets-11-easing-applied-to-saved-aep.png`
- `docs/user-guide/presets/screenshots/presets-12-easing-before-after.json`

手順:

1. After Effects に検証用コンポ `ty-plus saved verification comp` を作成した。
2. テキストレイヤー `ty-plus verification text` を作成した。
3. Position に 2 点のキーフレームを設定した。
4. `/Users/samuido/Desktop/ty-plus-verification/ty-plus-functional-verification.aep` として保存した。
5. Position の 2 キーフレームを選択し、Easing ウィジェットの `適用` を押した。

比較:

| key | before | after |
| --- | --- | --- |
| 1 | outType `6612`, outInfluence `16.666666667`, outSpeed `640` | outType `6613`, outInfluence `40`, outSpeed `0` |
| 2 | inType `6612`, inInfluence `16.666666667`, inSpeed `640` | inType `6613`, inInfluence `40`, inSpeed `0` |

判定:

- 保存済み AEP と選択キーフレームがある状態では Easing Apply は成功した。
- 「アクティブコンポジションなし」のエラー分岐とは別に、成功分岐をガイドへ記載できる。

### 15. 保存済み AEP で Layer Preset を作成できるか

結果: 不合格

証拠:

- `docs/user-guide/presets/screenshots/presets-13-layer-preset-created.png`

事前状態:

```text
presets.json: 27 件
/Applications/Adobe After Effects 2026/Scripts/ty-plus/layer-presets: 存在しない
/Applications/Adobe After Effects 2026/Scripts/ty-plus/comp-presets: 存在しない
```

手順:

1. 保存済み AEP を開いた。
2. テキストレイヤーを選択した。
3. ControlPanel の `Layer/Comp Preset` を開いた。
4. Layer のまま `Create Layer Preset` を押した。
5. その後、ダイアログ下部の `作成` を押した。

観測:

- After Effects の通知で `Ty Plus could not complete the action. Could not create folder: /Applications/Adobe After Effects 2026/Scripts/ty-plus/layer-presets` が表示された。
- しかし `presets.json` は 27 件から 28 件に増えた。
- 追加された項目は `type: "script"`、`title: "Layer/Comp Preset"`、`filePath: "/Applications/Adobe After Effects 2026/Scripts/ty-plus/layer-presets"` だった。
- 実ファイルまたは保存先ディレクトリ `/Applications/Adobe After Effects 2026/Scripts/ty-plus/layer-presets` は作成されていなかった。
- ワークスペース上にも `LAYER` タイルが追加された。

判定:

- Layer Preset 作成は、保存処理失敗後に実行不能なプリセット登録とタイル追加が残るため不合格。
- 検証後、追加された preset ID `36ca6aea-1493-413c-b9b2-52f3218f185d` を `presets.json` と `workspace-1.json` から削除してリセットした。

### 16. 背景ダイアログを開いて色背景を保存できるか

結果: 合格

証拠:

- `docs/user-guide/appearance/screenshots/appearance-01-background-dialog-visible.png`
- `docs/user-guide/appearance/screenshots/appearance-02-background-saved.png`

事前状態:

```text
/Applications/Adobe After Effects 2026/ty-plus/workspaces/background/background-1.json: null
/Applications/Adobe After Effects 2026/ty-plus/workspaces/background/background-2.json: null
/Applications/Adobe After Effects 2026/ty-plus/workspaces/background/background-3.json: null
/Applications/Adobe After Effects 2026/ty-plus/workspaces/background/background-4.json: null
/Applications/Adobe After Effects 2026/ty-plus/workspaces/background/background-5.json: null
```

手順:

1. Menu ウィジェットを開いた。
2. `背景...` を押した。
3. `背景レイヤー - パネル 1` ダイアログを確認した。
4. 初期の単色レイヤー `#1e1e1e` をそのまま `保存` した。

観測:

- `background-1.json` に color layer が保存された。
- `background-2.json` から `background-5.json` は `null` のままだった。
- 検証後、`background-1.json` は `null` に戻した。

判定:

- 背景ダイアログの表示と色背景保存は合格。
- パターン、画像、レイヤー順序変更、右クリック操作は未実施。

### 17. panel 2 / panel 3 / panel 4 / panel 5 を開けるか

結果: 一部不合格

証拠:

- `docs/user-guide/main-screen/screenshots/main-09-panels-2-5-opened.png`

手順:

1. 主パネルから CEP の `requestOpenExtension` を使い、次を開いた。
   - `app.ty-plus.panel2`
   - `app.ty-plus.panel3`
   - `app.ty-plus.panel4`
   - `app.ty-plus.panel5`
2. CDP ポート 8971、8972、8973、8974 が起動したことを確認した。
3. 各パネルの DOM と stylesheet を確認した。

観測:

- 4 パネルとも `panel/index.html` を読み込み、`cep-shell.bundle.css` も読み込んでいた。
- DOM には `data-ty-workspace-panel-root="true"` と空の `data-workspace-grid` が存在した。
- 主パネルのような Easing / Align / `FFX 27` は表示されなかった。
- ControlPanel は丸い最小状態のみ表示され、本文テキストは空だった。

判定:

- 追加パネルの起動自体は合格。
- 主パネルと同じオンボーディング済みワークスペース内容が表示されないため、実用挙動は一部不合格。

### 18. Add Widget を実追加できるか

結果: 合格

証拠:

- `docs/user-guide/widgets/screenshots/widgets-02-add-widget-added.png`

事前状態:

```text
widgets.json: 7 件
workspace-1.json: 8 gridCells
```

手順:

1. ControlPanel の `Add Widget` を開いた。
2. 初期選択状態の `クイックアクション` のまま `Add` を押した。
3. `widgets.json` と `workspace-1.json` を比較した。

観測:

- `widgets.json` は 7 件から 8 件に増えた。
- 追加された widget は `id: 70eeefe3-b718-492e-85bb-25020010d0c0`、`type: "quick-actions"` だった。
- `workspace-1.json` は 8 gridCells から 9 gridCells に増え、同じ ID が `x: 1, y: 9, width: 4, height: 1` で追加された。
- 検証後、追加 ID を `widgets.json` と `workspace-1.json` から削除してリセットした。

判定:

- Add Widget の実追加は合格。
- 重複追加、削除 UI、Undo / Redo は未実施。

### 19. Code Preset を作成できるか

結果: 不合格

証拠:

- `docs/user-guide/presets/screenshots/presets-14-code-preset-create-result.png`

事前状態:

```text
presets.json: 27 件
workspace-1.json: 8 gridCells
/Applications/Adobe After Effects 2026/Scripts/ty-plus/code-presets: 存在しない
```

手順:

1. ControlPanel の `Code Preset` を開いた。
2. デフォルトの Script モード、デフォルト名 `Code Preset` のまま `作成` を押した。

観測:

- After Effects の通知で `Ty Plus could not complete the action. Could not create folder: /Applications/Adobe After Effects 2026/Scripts/ty-plus/code-presets` が表示された。
- ダイアログ上は `保存中...` の表示になった。
- `presets.json` は 27 件のままだった。
- `workspace-1.json` は 8 gridCells のままだった。
- `/Applications/Adobe After Effects 2026/Scripts/ty-plus/code-presets` は作成されなかった。

判定:

- Code Preset 作成は不合格。
- Layer Preset と違い、失敗後に壊れた登録は残らなかった。

### 20. Animation Preset を作成できるか

結果: 不合格

証拠:

- `docs/user-guide/presets/screenshots/presets-15-animation-preset-create-result.png`

事前状態:

```text
presets.json: 27 件
workspace-1.json: 8 gridCells
/Applications/Adobe After Effects 2026/Presets/ty-plus/presets: 存在しない
```

手順:

1. 保存済み AEP と選択レイヤーがある状態で `Animation Preset` を開いた。
2. `Save Animation Preset` を押した。
3. その後の状態と JSON を確認した。

観測:

- After Effects の通知で `Ty Plus could not complete the action. Could not create folder: /Applications/Adobe After Effects 2026/Presets/ty-plus/presets` が表示された。
- ダイアログ上は `Detecting...` / `保存中...` の状態になった。
- `presets.json` は 27 件のままだった。
- `workspace-1.json` は 8 gridCells のままだった。
- `/Applications/Adobe After Effects 2026/Presets/ty-plus/presets` は作成されなかった。

判定:

- Animation Preset 作成は不合格。
- 失敗後に壊れた登録は残らなかった。

### 21. Comp Preset を作成できるか

結果: 不合格

証拠:

- `docs/user-guide/presets/screenshots/presets-16-comp-preset-create-result.png`

手順:

1. 保存済み AEP で `Layer/Comp Preset` を開いた。
2. `Composition` に切り替えた。
3. `Create Comp Preset` を押した。
4. その後、`作成` を押した。

観測:

- After Effects の通知で `Ty Plus could not complete the action. Could not create folder: /Applications/Adobe After Effects 2026/Scripts/ty-plus/comp-presets` が表示された。
- しかし `presets.json` は 27 件から 28 件に増えた。
- 追加された項目は `type: "script"`、`filePath: "/Applications/Adobe After Effects 2026/Scripts/ty-plus/comp-presets"` だった。
- 実ファイルまたは保存先ディレクトリは作成されなかった。
- `workspace-1.json` にも同じ ID のタイルが追加された。

判定:

- Comp Preset 作成は不合格。
- Layer Preset と同じく、失敗後に実行不能な登録が残る。
- 検証後、追加 ID `22c538d0-2121-4950-9a1c-c5f92253b946` を `presets.json` と `workspace-1.json` から削除した。

### 22. Footage Preset を作成できるか

結果: 不合格

証拠:

- `docs/user-guide/presets/screenshots/presets-17-footage-dialog-visible.png`
- `docs/user-guide/presets/screenshots/presets-19-footage-created.png`

手順:

1. 右クリック相当の起動パラメータで `dialog-footage-preset` を開いた。
2. 検証用画像 `/Users/samuido/Desktop/ty-plus-verification/assets/footage-red.png` を指定した。
3. `作成` を押し、`presets.json` と `workspace-1.json` を比較した。

観測:

- Footage Preset ダイアログは表示された。
- `作成` 後、ダイアログは `保存中...` のまま停止した。
- `presets.json` は 27 件のままだった。
- `workspace-1.json` は 8 gridCells のままだった。

判定:

- Footage Preset 作成は不合格。
- Import Preset と似た入力構造だが、Footage 側は登録まで進まない。

### 23. Import Preset を作成できるか

結果: 合格

証拠:

- `docs/user-guide/presets/screenshots/presets-20-import-dialog-visible.png`
- `docs/user-guide/presets/screenshots/presets-21-import-create-result.png`

手順:

1. 右クリック相当の起動パラメータで `dialog-import-preset` を開いた。
2. 検証用画像 `/Users/samuido/Desktop/ty-plus-verification/assets/footage-red.png` を指定した。
3. `作成` を押し、追加された JSON を確認した。

観測:

- `presets.json` は 27 件から 28 件に増えた。
- 追加された ID は `8e9c5130-56f5-43d2-a23b-b089a18ddcab`。
- 追加データは `type: "footage"`、`filePath` は検証用画像、`data.importStrategy` は `auto` だった。
- `workspace-1.json` は 8 gridCells から 9 gridCells に増え、同じ ID のタイルが追加された。

判定:

- Import Preset 作成は合格。
- 検証後、追加 ID を `presets.json` と `workspace-1.json` から削除した。

### 24. Text Style Preset を作成できるか

結果: 不合格

証拠:

- `docs/user-guide/presets/screenshots/presets-22-text-style-dialog-visible.png`
- `docs/user-guide/presets/screenshots/presets-23-text-style-created.png`

観測:

- Text Style Preset ダイアログは表示された。
- ダイアログ本文に `Text style presets are deprecated. Use the font viewer widget instead.` と表示された。
- `作成` 後、ダイアログは閉じた。
- しかし `presets.json` と `workspace-1.json` に `Verification Text Style Preset` は追加されなかった。

判定:

- Text Style Preset 作成は不合格。
- ユーザーから見ると保存完了に見えるが、登録結果が残らない。

### 25. Easing Preset を作成できるか

結果: 不合格

証拠:

- `docs/user-guide/presets/screenshots/presets-24-easing-create-dialog-visible.png`
- `docs/user-guide/presets/screenshots/presets-25-easing-create-dialog-visible.png`
- `docs/user-guide/presets/screenshots/presets-26-easing-create-result.png`

観測:

- `presetTemplate: "easing"` なしで `dialog-preset-create` を開くと空白表示になった。
- 右クリック相当の `presetTemplate: "easing"` を渡すと、Easing 作成ダイアログは表示された。
- 保存先は `/Applications/Adobe After Effects 2026/Scripts/ty-plus/easing/ローカルプリセット.jsx` と表示された。
- `作成` 後、`/Applications/Adobe After Effects 2026/Scripts/ty-plus/easing` は作成されなかった。
- `presets.json` と `workspace-1.json` に登録は残らなかった。

判定:

- Easing Preset 作成は不合格。
- Easing の「適用」自体は合格だが、Easing Preset として保存する枝は失敗する。

### 26. 右クリックメニューの対象別項目

結果: 一部合格

証拠:

- `docs/user-guide/main-screen/screenshots/main-12-context-menu-captures.json`
- `docs/user-guide/main-screen/screenshots/main-13-context-menu-summary.json`

手順:

1. CEP の `CSInterface.setContextMenu` / `setContextMenuByJSON` を一時的に記録した。
2. workspace 空白、Adobe Express プリセットタイル、quick widget、Easing widget、Align widget、Anchor widget、Info widget、Menu button に `contextmenu` イベントを送った。
3. 生成された CEP メニュー XML を保存し、ID とラベルを要約した。

観測:

- workspace 空白では Undo / Redo / Layout / Add Widget / Create Preset が登録された。
- プリセットタイルでは Open / Edit / Move to panel / Delete / Release Group が登録された。
- widget では Move to panel / Delete が登録された。
- Easing widget では Apply / Copy from selection / Reverse / Preset / Background / Apply Mode / Label Color / Move to panel / Delete が登録された。
- Align widget では Align / Distribute / Spacing / Time / target selection が登録された。
- Anchor widget では Reset / selected layers / active comp / 9 点位置が登録された。

判定:

- 右クリックメニューの表示項目生成は対象別に確認できた。
- 破壊的な Delete / Reset Workspace は実行していない。
- Directory Browser と Background Dialog 内の右クリックは未実施。

### 27. マニュアルリンクとブラウザ起動

結果: 一部合格

証拠:

- `docs/user-guide/installation/screenshots/install-08-manual-link-browser-opened.png`

観測:

- CEP の `openURLInDefaultBrowser` でオンボーディングの `User Manual` と同じ Notion URL を開くと、Google Chrome が前面になった。
- Chrome のアクティブタブ URL は `https://pebble-profit-9dc.notion.site/User-Manual-2e5261498b3a8071bb69e2a309221982` だった。
- 通常ワークスペースの右クリックメニューには Manual / Docs 項目は表示されなかった。
- ソース上の `ty.ctx.open-docs` は存在するが、遷移先は `https://github.com/` で、現在のメニューには出ていない。

判定:

- CEP から既定ブラウザを開く経路は合格。
- ユーザーが通常画面からマニュアルへ到達する導線は未確認または不足。

### 28. Align Widget を実レイヤーへ適用できるか

結果: 不合格

証拠:

- `docs/user-guide/widgets/screenshots/widgets-03-align-disabled-with-selected-layer.png`

観測:

- 保存済み AEP、アクティブコンポジション、選択テキストレイヤーがある。
- しかし Align / Distribute の各ボタンは `opacity-40 cursor-not-allowed pointer-events-none` で無効表示だった。
- 右クリックメニュー上は Align / Distribute / Spacing / Time のアクション項目が生成される。

判定:

- 実レイヤーに対する Align 適用は不合格。
- メニュー項目は出るが、通常ボタン側が実行可能状態にならない。

### 29. Add Widget から Directory Browser を追加できるか

結果: 不合格

証拠:

- `docs/user-guide/widgets/screenshots/widgets-04-directory-browser-added.png`

手順:

1. ControlPanel の `Add Widget` を開いた。
2. 一覧内の `ディレクトリブラウザ` をクリックした。
3. `Add` を押し、`widgets.json` と `workspace-1.json` を比較した。

観測:

- `widgets.json` は 7 件から 8 件に増えた。
- 追加された ID は `f8a1ba95-8d82-440d-85fe-18302f248b60`。
- しかし追加された widget type は `directory-browser` ではなく `quick-actions` だった。
- `workspace-1.json` にも同じ ID の quick-actions タイルが追加された。

判定:

- Directory Browser を Add Widget から追加する操作は不合格。
- 拡張子別実行の Directory Browser 経由検証は、入口の時点でブロックされた。
- 検証後、追加 ID を `widgets.json` と `workspace-1.json` から削除した。

残る検証分岐:

1. Add Widget の重複追加、削除、レイアウト保存。
2. 背景のパターン/画像/順序変更、Background Dialog 右クリック。
3. Directory Browser の選択追加不具合が解消された後の拡張子別実行。
4. オンラインダウンロード修正後の再検証、重複ダウンロード、失敗時ロールバック。
