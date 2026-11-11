# Storage Ownership Map

この文書は、解決後の `<managedRoot>` 配下で各データ群がどのファイルに
所有されるかを対応付ける。データ shape は所有元の source module 側の定義に
留まり、この文書では再定義しない。

## 所有テーブル

| データ群 | 所有ファイル | 備考 |
|------------|------------|-------|
| `core.supportRoot` | `settings/paths.json` | support root の locator |
| `onboarding path roots` | `settings/paths.json` | onboarding の workspace path |
| `global app preferences` | `settings/app.json` | アプリ全体の設定 |
| `locale/theme/shell UI preferences` | `settings/ui.json` | UI 設定 |
| `controlPanel` | `settings/control-panel.json` | control panel の状態 |
| `workspace.workspacePanels.panelN` | `workspaces/workspace-N.json` | workspace panel のレイアウト |
| `workspaceBackground` | `workspaces/background/background-N.json` | workspace ごとの背景 |
| `workspace.snapshots.panelN` | `workspaces/history/snapshots.json` | 共有 undo snapshot（全 panel で 1 ファイル） |
| `preset catalog` | `presets/presets.json` | preset レコード |
| `group catalog` | `groups/groups.json` | group レコード |
| `widget catalog / widget instances` | `widgets/widgets.json` | widget レコード |
| `workspaceEasing*` | `widgets/state/easing.json` | easing widget の状態 |
| `workspaceFileBrowser*` | `widgets/state/file-browser.json` | file browser widget の状態 |
| `noteContent` | `widgets/state/note.json` | note widget の内容 |
| `workspaceYoutubeVideoId` | `widgets/state/youtube.json` | YouTube widget の状態 |
| `notification cache/read state` | `cache/notifications.json` | 通知キャッシュ |
| `remote preset cache` | `cache/remote-presets.json` | リモート preset キャッシュ |

## 主要な所在

| 項目 | パス | 定義 / 使用元 |
|------|------|------|
| session ごとの locator | `<sessionSupportRoot>/ty-plus-init.json` | root contract: `rust/crates/storage/src/root.rs`、移行期の読み取り: `src/management/storage/persistence/managed-root.ts` |
| 既定の managed root | `<sessionSupportRoot>/ty-plus/` | `rust/crates/storage/src/root.rs` の `ManagedRootSelection::SessionDefault` |
| 明示指定の共有 managed root | `<explicitBrowseRoot>/ty-plus/` | `rust/crates/storage/src/root.rs` の `ManagedRootSelection::ExplicitShared` |

`sessionSupportRoot` は接続中の AE session から供給される。AE のバージョンから
導出されることはなく、Rust が探索することもない。`explicitBrowseRoot` は
ユーザーが明示的に選択した後にのみ存在し、複数の AE session が
`<managedRoot>` を共有する唯一の方法は同じ選択を使うことである。
