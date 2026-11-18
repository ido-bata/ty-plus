# 機能インベントリ

ユーザーが触れる surface・機能・操作経路の棚卸し。`use-case-matrix.md` の UC がこの表を根拠に網羅性を主張する。対象 build: `release-0-10-2`（dev flavor は `app.ty-plus.dev`、ADR-0005）。

## 1. Surface 一覧

### パネル（5 面、同一 entry `panel.tsx`）

| Surface | Extension ID（dev / release） | CDP port（dev / release） | 役割 |
| --- | --- | --- | --- |
| panel-1 | `*.panel1` | 9170 / 8970 | 主 workspace + StatusBar（Undo/Redo/Snapshot/各 dialog 起動）|
| panel-2..5 | `*.panel2`〜`*.panel5` | 9171-9174 / 8971-8974 | workspace grid のみ |

### Modeless dialog（共有 entry `modeless/index.html`）

| Surface ID | 役割 | CDP port（dev） |
| --- | --- | --- |
| `dialog` | modeless 共通 shell | 9175 |
| `dialog-preset-add` + `-2`〜`-8` | カタログプリセット追加（パス指定、pool で最大8面）| 9176-9183 |
| `dialog-preset-add-folder` | グループプリセット作成 | （pool 内）|
| `dialog-animation-preset` | `.ffx` アニメーションプリセット作成 | 同上 |
| `dialog-layer-comp-preset` | レイヤー/コンポプリセット作成 | 同上 |
| `dialog-code-preset` | コード（Script/Expression）プリセット作成 | 同上 |
| `dialog-preset-create` | 汎用プリセット authoring | 同上 |
| `dialog-footage-preset` | フッテージプリセット作成 | 同上 |
| `dialog-import-preset` | インポートプリセット作成 | 同上 |
| `dialog-preset-edit` | プリセット編集/削除 | 9184 |
| `dialog-messages` | 通知センター | 9188 |
| `dialog-settings` | 設定ダイアログ | 9189 |
| `dialog-widget-selector` | Add Widget ピッカー | 9190 |
| `dialog-background-panel` | ワークスペース背景エディタ | 9191 |
| `dialog-probe` | 診断プローブ（dev 用）| — |
| `debug-console` | 集約デバッグコンソール | 9185 |
| `dialog-presets` | プリセット一覧 | 9186 |

ポートは `dist/<flavor>/.debug` の `Host Port` が正本。release は 8970 起点で同じ並び。

## 2. 機能エリア別の操作と効果

### 2.1 オンボーディング（`src/function/onboarding/`）

10 ステップ: `intro → language → support → subfolders → presets → scripts → plugins → workspace → adding-presets → finish`。

- 言語選択、サポートルート選択（`ty-plus-init.json` locator が managed root の唯一の権威）、サブフォルダ生成、プリセット/スクリプト/プラグインフォルダ取込、初期 layout・widget・preset record の生成
- `completeOnboardingStorage()` が settings + layouts + widget records + presets.json + groups を一括永続化し、shell message で全 surface へ通知

### 2.2 ワークスペース（`src/management/workspace/`）

- **タイル操作**: 追加（toolbar の Local/Group/Animation/Layer-Comp/Code Preset、Add Widget、preset catalog からの drag&drop）、移動・リサイズ（grid gesture）、削除・複製（context menu `ty.ctx.*`）
- **永続化**: `workspaces/workspace-N.json`（gridCells）、`settings/app.json` の `workspacePanels`（preset 配置 roster）、`workspaces/background/background-N.json`、`workspaces/history/snapshots.json`（全パネル共有、最大10）
- **グリッド設定**: `settings.workspace.grid {cellSize,gap,radius}` → theme.css token `--ty-ws-*` → 全パネル live 反映（#95）
- **スナップショット**: 保存・復元（全パネル一括）・削除、Undo/Redo、StatusBar dropdown
- **背景**: `dialog-background-panel` で color/pattern(dots/grid/lines)/image のレイヤー編集 → `workspaceBg/N.json`
- **ControlPanel**: collapse/展開・向き・位置 → `panels/panel-N.json`
- **Layout Lock widget**: 1x1 の編集ロック
- **context menu**: `ty.ctx.*` 系（タイル、preset、group、背景、easing label 色サブメニュー）

### 2.3 プリセット（`src/management/preset/`, `src/function/preset/`）

- **カタログモデル**: `presets/presets.json`、`Preset{id,type:"preset"|"script"|"plugin"|"footage",title,filePath,...,parentId?}`
- **作成 dialog**: local(path) / folder group（走査深さ・icon rules・advanced）/ animation(`.ffx` + AE native save dialog handoff) / layer-comp / code(Script|Expression, Monaco) / footage / import / easing(カーブ→`.jsx`) / generic authoring
- **編集**: `dialog-preset-edit`（名前・Load from file・メンバー行 run/edit/delete・missing-member 表示）
- **カタログ browser**: `dialog-presets`（list/icon 表示、検索、group 展開、hover Run/Edit/Delete）
- **実行 pipeline**: preset→`getPresetOperation(type)`→HostAdapter。`.ffx`→`applyPreset`、`.jsx`→`runScriptFile`、footage→`addFootage`（PNG sequence 対応）、`.aex`→`applyEffectByMatchName`
- **asset verification**: 保存前 `verifyPresetAsset` + 起動時 stale record 検査（Issue #130）

### 2.4 ウィジェット（`src/function/widget/`, `src/management/widget/`）

9 種: `quick-actions, menu, info, easing, align, anchor-point, directory-browser, layout-lock, font-viewer`。

- **Add Widget dialog**: 検索・カテゴリ（Core/Utility/Media/Experimental）・list/icon 切替 → `widgets/widgets.json` + layout reload broadcast
- **easing**: カーブ編集（multi-point/loop/target mode）、AE 選択キーフレームへの apply（bezier influence/speed 書込）、label colors 1-16、clipboard（`clipboard/clipboard.json`）、preset 化（`prepareEasingPresetScript`→`.jsx`）
- **align**: `host.alignLayers` で選択レイヤー整列/分布
- **anchor-point**: 9 方向 + apply all/active comp → `host.setAnchorPoint`（位置補償つき）
- **info**: comp/project 情報表示、**font-viewer**: `getFontBrowserEntries` + `writeSelectedTextLayers`/`readSelectedTextLayers`（ADBE Text Properties）
- **directory-browser**: panel 内ファイルブラウザ（遷移・filter・選択・サムネイル）
- **widget state**: `widgets/state/<name>.json`（align/background/directory-browser/easing/info/menu/quick-actions/selection）

### 2.5 設定（`src/management/setting/dialog/`）

| Section | 操作 | 効果 |
| --- | --- | --- |
| Language | locale 選択（UI 8択、資産は10言語）| `settings/ui.json` locale + `documentElement.lang`、全 surface 即時反映 |
| Style | accent/text/widget/panel 色・opacity | `settings.ui.*` → theme.css projection（#94）→ `themeLive` broadcast |
| Grid | cell/gap/radius | `workspace.grid` + `--ty-ws-*` → 実レイアウト反映（#95）|
| Tokens | デザイントークン編集（色/文字/opacity/数値）| theme.css merge 書込、Apply/Export/Import/reset |
| Paths | Support/Preset/Script/Plugin Root | `settings/app.json core.paths`、support 変更時 relocation/copy/delete 確認 + 全パネル reload |
| WorkspaceBackup | export/import JSON bundle | settings/presets/theme/5 layouts/5 backgrounds を一括退避・復元 |
| Background | panel 選択→背景エディタ起動 | `background-N.json` 参照 |
| Update | channel（stable/beta/insider）・check now | GitHub Releases 参照、手動 install のみ |
| Feedback | category/subject/description | GitHub issue URL を事前入力で開く（自動送信なし）|
| Inputs | anchor-point/alignment gesture toggle | settings 永続化 |
| Preview 系 | Component/Buttons/DirectoryBrowser/Inputs preview | dev/QA 用 live preview |

Save 失敗は `role="alert"` バナーで表示（#96）。Reset は確認なし（既知の注意点）。

### 2.6 オンライン/通知/更新（`src/management/online/`）

提供面は静的 feed のみ（#193 で未提供面を構造撤去。`docs/architecture/offline-core.md` 参照）。

- **Messages**（`dialog-messages`）: 通知 list↔detail、既読/未読、refresh（公式静的 notification feed）
- **Update**: Settings → UpdateSection（channel・check now・release notes リンク。GitHub Releases feed）
- feed 取得失敗時は status 表示のみで core を妨げない（offline-core 契約）

### 2.7 デバッグコンソール（`src/management/debug/`）

`debug-console` surface: 全 surface のログ集約、level/source/session filter、auto-scroll、Clear（cross-surface 同期）、右クリック copy、**JavaScript eval 入力**。再 open で replay。

### 2.8 ホスト/AE 連携（`src/management/ae/`）

- `HostAdapter` メソッド群（contract.ts が正本）: `getHostContext, ping, runScriptFile, applyPreset, addFootage, verifyPresetAsset, scanPluginEffectRoots, applyEffectByMatchName, applyEasing, applyLoopEasing, setAnchorPoint, captureEasingCurve, captureKeyframeValues, getEasingClipboardPath, pasteKeyframeValues, getLabelColorNames, getFontBrowserEntries, writeSelectedTextLayers, readSelectedTextLayers, prepareAnimationPresetTarget, openAnimationPresetSaveDialog, prepareLayerCompPresetScript, prepareCodePresetScript, prepareEasingPresetScript, getSelectionCount, getEasingSelectionCount, alignLayers`
- host bundle `jsx/ty-plus-host.jsx`（`HOST_BUNDLE_VERSION = workspace-preset-scriptui-panel-v4`）、resident 判定 + self-heal（#104）
- 書込/実行は allowed roots（ae-support / user-data / extension）に限定（`classifyAllowedRoot`, `assertAllowedFilePath`, `authorizePayloadSaveDir`）
- operation worker（Rust）: spawn→accept→progress→final→EOF/exit を panel から verify（`verify-operation-worker-cep.ts`）
- ExtendScript `alert()` は CEP 経由操作では構造化エラー＋非モーダル通知（#72）

### 2.9 永続化ファイル一覧（managed root = `<supportRoot>/ty-plus/`）

| ファイル | 内容 |
| --- | --- |
| `ty-plus-init.json`（app root、managed root 外）| managed root 権威 locator |
| `settings/app.json` | Settings v2（paths/ui/workspace.grid/workspace.background/gestures + workspacePanels legacy keys）|
| `settings/paths.json` | browse root 補助 |
| `settings/ui.json` | locale 等 UI prefs |
| `settings/control-panel.json` | 旧 ControlPanel 状態（fallback）|
| `workspaces/workspace-N.json` (1-5) | layout `{gridCells[]}` |
| `workspaces/background/background-N.json` | 背景レイヤー |
| `workspaces/history/snapshots.json` | スナップショット（最大10）|
| `presets/presets.json` | preset catalog |
| `groups/groups.json` | group（manual/folder-sync）|
| `widgets/widgets.json` | widget records |
| `widgets/state/<name>.json` | widget 別 state |
| `panels/panel-N.json` | ControlPanel chrome |
| `styles/theme.css` | theme override（全 token）|
| `styles/workspaces/workspace-N.css` | per-workspace style |
| `clipboard/clipboard.json` | easing clipboard |
| `tool-handoff/<extensionId>.json` | dialog 起動 handoff |
| `cache/{notifications,candidates*}.json` | notification cache / preset candidates |
| `logs/ty-plus.log` | app log |

## 3. 機能間連携フロー（UC の複合対象）

1. 初回起動 → onboarding → roots/取込 → 初期 layout/widget/preset → workspace 表示
2. preset 作成 → `presets.json` + tile 配置 → Run → HostAdapter → AE 状態変化 → 保存 → reload → 再実行
3. settings 変更（Style/Grid/Tokens/Language）→ app.json/theme.css 書込 → `themeLive`/locale broadcast → 全 surface 反映 → reload 後維持
4. workspace backup export → import → settings/presets/theme/5 layout/5 background を一括復元
5. support root 変更 → relocation 確認 → persistence → 全パネル layout reload
6. widget 追加 → disk record → layout reload → tile 描画 → widget 操作 → AE 反映
7. debug console → 全 surface ログ集約 → filter/eval/clear/replay
8. notification feed / update feed 取得 → status 表示（失敗時も core 継続）
9. background editor → `background-N.json` → panel 背景再描画
10. modeless opener handoff → `preset-tool-handoff` + `openerSurfaceId` → 正しい `panel-N` へ書戻し
