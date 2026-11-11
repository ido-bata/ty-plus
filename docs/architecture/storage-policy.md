# Storage Policy

本文書は ty-plus におけるデータ永続化の storage tier、許可される用途、禁止される用途を定義する。

## Storage Tiers

### Tier 1: Managed Storage (Workspace Files)
**配置:** `{supportRoot}/ty-plus/`

アプリケーションが管理する永続化 workspace ファイル。データは再起動後も残り、workspace 単位のスコープを持つ。

| 種別 | パス | 目的 |
|------|------|---------|
| アプリ設定 | `{supportRoot}/ty-plus/settings/app.json` | アプリ全体の設定 |
| パス設定 | `{supportRoot}/ty-plus/settings/paths.json` | support root、onboarding のパスルート |
| UI 設定 | `{supportRoot}/ty-plus/settings/ui.json` | ロケール、テーマ、shell UI の設定 |
| Control panel | `{supportRoot}/ty-plus/settings/control-panel.json` | control panel の状態 |
| Workspace | `{supportRoot}/ty-plus/workspaces/workspace-N.json` | workspace panel のレイアウト |
| Workspace 背景 | `{supportRoot}/ty-plus/workspaces/workspace-N-background.json` | workspace ごとの背景 |
| Preset | `{supportRoot}/ty-plus/presets/presets.json` | preset カタログ |
| Preset asset | `{supportRoot}/ty-plus/presets/assets/` | preset の asset ファイル |
| Group | `{supportRoot}/ty-plus/groups/groups.json` | group カタログ |
| Widget | `{supportRoot}/ty-plus/widgets/widgets.json` | widget カタログとインスタンス |
| Widget state | `{supportRoot}/ty-plus/widgets/state/*.json` | widget ごとの状態 (easing, file-browser, note, youtube) |
| 履歴 | `{supportRoot}/ty-plus/workspaces/history/snapshots.json` | workspace 共有の undo スナップショット (1 ファイルに全 panel 分) |
| 通知キャッシュ | `{supportRoot}/ty-plus/cache/notifications.json` | 通知キャッシュと既読状態 |
| リモート preset キャッシュ | `{supportRoot}/ty-plus/cache/remote-presets.json` | キャッシュ済みのリモート preset |
| テーマ CSS | `{supportRoot}/ty-plus/styles/theme.css` | ユーザーテーマ CSS |
| Workspace CSS | `{supportRoot}/ty-plus/styles/workspaces/workspace-N.css` | workspace ごとのスタイル |
| ログ | `{supportRoot}/ty-plus/logs/ty-plus.log` | アプリケーションログ |

**アクセス手段:** `src/management/storage/persistence/` (PATHS registry、`readJson` / `readJsonText` / `writeJson`)

---

### Tier 2: Runtime Memory Storage (Transient IPC Only)
**配置:** `src/management/storage/runtime-memory-storage.ts` のインメモリ `Map`

JS コンテキスト間の IPC 通信のための一時データ。**panel の再読み込みや再起動でデータは失われる。**

| 許可される用途 | 根拠 |
|-------------|------|
| IPC surface のハンドシェイクデータ | 設計上一時的である |
| 単一セッション内の一時的な状態 | 永続化の要件がない |

**アクセス手段:** `readRuntimeJson`、`writeRuntimeJson`、`readRuntimeStorage`、`writeRuntimeStorage`

---

### Tier 3: Browser/CEP localStorage (Forbidden)
**配置:** ブラウザの `localStorage`、`sessionStorage`、CEP の `window.localStorage`

**アプリケーション状態には使用禁止。** これらの API は一部の CEP コンテキストで利用できず、workspace のマルチ panel 構成にも対応しない。

| 禁止される用途 | 理由 |
|--------------|------|
| 設定の永続化 | Managed Storage と重複し、CEP では信頼できない |
| Preset レコード | panel の再読み込みを跨いで保持する必要があり、Managed Storage に属する |
| UI 状態 (位置、折りたたみ) | セッションを跨いで永続化する必要がある |
| 通知キャッシュ | panel の再読み込みを跨いで保持する必要がある |

---

## 許可される用途と禁止される用途の対照表

| データ種別 | 許可される保存先 | 禁止される保存先 | 誤った Tier を使っているファイル |
|-----------|-----------------|-------------------|------------------------|
| 設定 | Managed Storage (`settings/*.json`) | Runtime Memory、localStorage | `SettingsContext.tsx` |
| Control panel の状態 | Managed Storage または CEP shared | Runtime Memory | `control-state.ts` |
| Undo スナップショット | Managed Storage (`history/*.json`) | Runtime Memory | `history.ts` |
| 通知キャッシュ | Managed Storage (`cache/notifications.json`) | Runtime Memory | `notifications.ts` |
| ロケール設定 | Managed Storage (`settings/ui.json`) | Runtime Memory | `config.ts` |

---

## 現在の違反

次のファイルは、**Managed Storage** に置くべきデータに **Runtime Memory Storage** を使っている。

### 1. `src/management/setting/SettingsContext.tsx`
- **事象:** 設定 (`ty-plus.settings.v2`) が runtime memory に書かれている
- **問題:** panel の再読み込みで設定が失われる。`settings/app.json` に永続化すべきである
- **使用すべき手段:** `src/management/storage/persistence/` の `writeJson(win, "app", ...)`

### 2. `src/management/panel/control/control-state.ts`
- **事象:** control panel の状態 (`ty-plus-cep-control-panel-v1`) が runtime memory に書かれている
- **問題:** 再読み込みで panel の位置と向きが失われる
- **使用すべき手段:** `settings/control-panel.json`

### 3. `src/management/online/notification/notifications.ts`
- **事象:** 通知キャッシュと既読状態が runtime memory に書かれている
- **問題:** panel の読み込みごとに通知を再取得している
- **使用すべき手段:** `{supportRoot}/ty-plus/cache/notifications.json` の Managed Storage

### 4. `src/management/i18n/config.ts`
- **事象:** ロケール設定のキーが runtime memory から読み書きされている
- **問題:** 再読み込みで言語設定が失われる
- **補足:** `locale-storage.ts` は既にファイルベースの storage へ移行済み。`config.ts` は fallback chain で引き続き runtime を使っている

### 5. `src/management/workspace/undo/history.ts`
- **事象:** スナップショットを runtime memory に保存している
- **使用すべき手段:** `{supportRoot}/ty-plus/workspaces/history/snapshots.json`
