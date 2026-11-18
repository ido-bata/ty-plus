# ADR-0006: managed root 永続化ロックと所有パネル merge 契約

- Status: Accepted（#200 再設計。Issue #200 の旧確定契約を本書で置き換える）
- Date: 2026-11-18
- 正本: Issue #200 / `docs/architecture/storage/ownership-map.md` / `docs/architecture/storage-policy.md`

## Context

CEP の各 panel / modeless dialog は別 JS コンテキスト（別プロセス）であり、同一の managed root（`<…>/ty-plus/`）配下のファイルを共有する。`workspacePersistChain` のような context ローカルの Promise 直列化では、プロセス間の read-modify-write を保護できず、次の lost update が起きる。

- `persistSurfaceState` / `persistSurfaceStateAwaitable`（`hook.ts`）: `workspace-N.json`・`widgets.json`・`settings/ui.json`・`background-N.json` を書く
- `persistTargetLayout`（`placement/cross-panel-write.ts`）: 対象パネルの `workspace-N.json` を read→merge→write
- `tryPersistAppendPresetFromDialog` / `tryPersistRemovePresetFromDialog` / `persistAppendWidgetFromDialog`（`placement/*-from-dialog-disk.ts`）: dialog コンテキストから対象パネル layout を RMW。**追加だけでなく削除もある**（preset/group 削除時の tile 除去、`remove-preset-from-dialog-disk.ts`）
- `applyInterPanelMove`（`placement/inter-panel-move.ts`）: target layout → read-back → source `settings.json` → source layout の多段書込と preimage rollback
- `settings/app.json` の `workspacePanels` / `presetIds` を触る経路（move・group merge・reset）と、全 panel 共有の `workspaces/history/snapshots.json` の read-modify-write

Issue #200 の旧確定契約は「外部 writer は tile を追加するのみ」と仮定していたが、`remove-preset-from-dialog-disk.ts` と `applyInterPanelMove` の source 側除去がこれを否定する。また、旧 lock 実装（PR #201 時点）には次の競合リスクがあった。

- stale 判定が lock dir の mtime（= 取得時刻）に依存し、長時間 transaction を誤って stale とみなす。heartbeat がない
- stale-break の rename 先が contender ごとの token 入りで、複数 breaker が同時に別名へ rename し得る（最初の 1 つだけ成功するが、敗者側の再試行順序が不定）
- release が `readFile(owner)→rm(dir)` の check-then-act で、検証と削除の間に steal + 再取得が挟まると他人の lock dir を消し得る
- `loadAsyncLocalStorage` が `window` 大域を直接参照し、window を持たない実行環境で ALS が常に無効になる

## Decision

### 1. 保存境界と直列化

managed root 配下の共有ファイルへの **全ての multi-file / read-modify-write トランザクション** を `withPersistenceLock`（`src/management/storage/lock/persistence-lock.ts`）配下で実行する。lock は `<root>/locks/persistence.lock/` の `fs.mkdir` による atomic acquire で、critical section はミリ秒級のファイル I/O のみ。

lock の対象は「読んでから書く」経路に限定する。単一ファイルの全置換 write（`settings/control-panel.json`、`cache/*`、widget state 等）は read を伴わないため lock 不要とし、atomic write（後述）だけで保護する。

lock root の解決（`resolvePersistenceLockRoot`）は fail closed である。`ty-plus-init.json` が**存在しない**（pre-onboarding・eval context 非搭載のテスト環境）場合のみ「root 無し」として lock を bypass し、write 側の `resolveWriteManagedRoot` が同じく fail するため実害はない。locator が**存在するのに読めない / parse できない**場合、および probe 後の managed-root 解決が一時エラーで失敗した場合は `PersistenceLockUnavailableError`（または元エラー）を投げ、`fn` を lock 無しで実行しない — 解決失敗を握り潰して unlocked 実行する fail-open 経路は存在しない。

### 2. Lock protocol

- **Acquire**: `mkdir(lockDir)`。EEXIST = 保持中。成功後に `owner.json`（`{token, pid, acquiredAtMs}`）を書く
- **Heartbeat**: 保持中は `heartbeatMs`（既定 1000ms）ごとに `owner.json` の mtime を `utimes` で更新する。stale 判定は dir mtime ではなく `owner.json` mtime（= 最終 heartbeat）で行う。`utimes` が ENOENT なら lock 喪失とみなし、保持側は以後の release で他人の lock を消さない
- **Heartbeat ownership 検査**: 各 beat は `utimes` の前に `owner.json` を読み直し、token が取得時の token と一致することを確認する。stale-break → 他者再取得の後に復帰した旧保持者が新しい owner の heartbeat を更新し続ける事故を防ぐためで、一致しない（foreign token / parse 不能 / ファイル消失）場合はその場で heartbeat を停止し「lock 喪失」として記録する。喪失後も `fn` は最後まで実行されるが、release は従来通り foreign dir を復元するだけで削除しない
- **Stale break**: `age > staleMs`（既定 15000ms）の lock を、`rename(lockDir, lockDir + ".break-" + token)` で回収する。rename は atomic なので同時 breaker は 1 つだけ成功する。回収後に trash 内の `owner.json` を再検査し、heartbeat が復活していれば `rename` で元に戻して待機を続ける（check-then-act の隙間を rename 後の再検査で閉じる）
- **Release**: `rename(lockDir, lockDir + ".release-" + token)` でまず排他的に取り出し、trash 内の owner token を検査する。自分の token なら trash を削除。**他人の token なら lock は既に奪取・再取得されている**ので、trash を `lockDir` へ戻す（短期 retry）。戻せない場合は quarantine 名へ退避して error log を出し、絶対に削除しない。rename-aside 自体が失敗した場合、「lock が存在しない」とみなせるのは ENOENT / ENOTDIR のみで、それ以外（EACCES・EPERM・EBUSY 等）は実エラーとして error log に記録し lock dir をその場に残す（停止済み heartbeat により stale 回収が後で拾う）。release は `finally` から呼ばれるため `fn` の結果を覆さない
- **Timeout**: `timeoutMs`（既定 30000ms）で `PersistenceLockTimeoutError`。deadlock も破壊も起きない

### 3. 再入（ALS）

`AsyncLocalStorage` で同一 async context・同一 managed root の入れ子呼出を外側の保持へ join させる（`applyInterPanelMove` → `persistSourceLayout` → `persistSurfaceStateAwaitable` 等）。ALS が使えない環境では入れ子呼出は acquire timeout で失敗する。ALS の解決は `win` 経由の `cep_node.require` → `node:async_hooks` の順で、window 大域への直接依存をやめる。

### 4. Owner panel の merge 規則（`workspace-N.json`）

所有 panel の persist は lock 内で `workspace-N.json` を読み直し、3 者（disk 現在値 / `lastPersistedTileIds` / 現在の state）で merge してから書く。

- `adopted` = disk にあり `lastPersistedTileIds` にも state にも無い tile → **外部追加**として採用し、書込対象と state の両方へ反映する
- `externallyRemoved` = `lastPersistedTileIds` にあり disk に無い tile → **外部削除**（preset/group 削除・panel 間 move の source 側除去・外部 restore）。state に残っていれば書込対象から外し、state からも除去する
- それ以外は state が正（所有 panel の tile 幾何・集合は state が権威）
- persist 成功後に `lastPersistedTileIds` を実際に書いた id 集合へ更新し、採用/除去した tile を state へ commit して反映する（selection index は既存の `remapSurfaceSelectionByPreservedTileIds` で補正）

外部 writer は「追加のみ」ではなく「追加・削除・移動」を行うため、merge は tile id 単位の双方向差分として定義する。disk が読めない（corrupt）場合は persist を失敗させ、上書きで証拠を消さない（Issue #204 と同じ原則）。

### 5. 外部 writer の契約

`persistTargetLayout`・`tryPersistAppendPresetFromDialog`・`tryPersistRemovePresetFromDialog`・`persistAppendWidgetFromDialog` は、**lock 内で対象ファイルを読み直してから差分を書き込む**。lock 取得前の read を write の根拠にしない。dialog / placement 経路が組み立てに使う catalog（`presets/presets.json`・`groups/groups.json`）は lock 取得前に読んではならず、`persistTargetLayout` は caller 供給の catalog に lock 内で読み直した disk catalog を補完 union してから tile 分類・merge に使う（caller 行優先・disk 行で補完。disk read の一時失敗は caller catalog を維持して続行する）。`applyInterPanelMove` は caller の catalog を `persistTargetLayout` 経由で同じ補完を受ける`persistAppendWidgetFromDialog` の 2 ファイル transaction（layout + `widgets.json`）と preimage rollback は 1 つの lock 保持に収め、rollback が他者の書込を消す経路を構造的に閉じる。

`applyInterPanelMove` は全手順（preimage 取得 → target 書込 → read-back → source `settings.json` → `persistSourceLayout` → 失敗時 rollback）を **1 つの lock 保持**で実行する。直列化されるため preimage rollback は他 context の書込を巻き戻さない。

`settings/app.json` の read-modify-write は全て同じ lock に載せる。対象は workspacePanels/presetIds を触る経路（move・group merge・resetWorkspace）に加え、settings dialog の `saveSettingsToStorage`（owned keys の read→merge→write）と `persistSettingsPaths` の settings 部分である。共有 `workspaces/history/snapshots.json` の read-modify-write（save/delete snapshot）も同じ lock に載せる。

catalog 系も同じ契約に含める。`groups/groups.json` の全 RMW（`group-catalog.ts` の upsert/remove/merge/reorder/removePresetFromGroup）、`presets/presets.json` の RMW（`repository/shared.ts` の upsert/remove/seed write-back。`local-catalog`・`catalog-root-pinned`・`workspace/services` の 3 経路全てに `withLock` を注入）、`widgets/state/*.json` の instance upsert（`widget-state-store.ts`）、`clipboard/clipboard.json` の read→mutate→write（`clipboard-store.ts`）、`settings/ui.json` の locale merge（`i18n/preference/storage.ts`）、`panels/panel-N.json` の controlPanel merge（`panel/persistence/chrome-store.ts`）、および settings dialog の backup restore（`WorkspaceBackupSection` の全ファイル書換）を lock 配下に置く。

### 6. 原子的 file write

`writeJsonFileText` を tmp file + `rename` による atomic publish に変更し、書込途中の crash で torn file を残さない。tmp は同一 dir の sibling（`<name>.tmp-*`）に置き rename で atomic に置き換える。**`rename` は必須**であり、CEP Node `fs` が `rename`（sync 経路では `renameSync`）を提供しない host では write 自体を fail closed で拒否する — 直接 `writeFile` への非 atomic fallback は持たない（ADR-0006 の torn-write 防止を fail-open で骨抜きにしないため）。`fs.watch` は dir watch が rename を捕捉し、tmp 名は監視対象 filename に一致しないため、既存の外部変更検知と両立する（`sync-watch.test.ts` で tmp 単独 write が発火せず rename で発火することを検証済み）。

### 7. 残存リスク（別途記録・対象外）

以下は検討の結果、lock 対象外として受け入れる。

- **onboarding の初期化 write**（`ensureStorageInitialized`・`initializePresetStorage`・`completeOnboardingStorage`）: workspace panel の persist は layout restore 分類まで write gate で閉じており、onboarding 中は catalog/settings の writer が onboarding dialog 1 context に限られる。初回起動の単一 writer 段階なので lock 不要
- **`cache/*`**（notifications・remote-presets・public-links・candidates manifest/chunk）: 全て単一ファイルの全置換 write で read を伴わない。sync job が唯一の writer であり、atomic rename（§6）で torn write は起きない。last-writer-wins は cache の契約として許容
- **`settings/paths.json`・`settings/control-panel.json`**: 単一ファイルの全置換 write で RMW を伴わない。`settings/ui.json` は persistSurfaceState が transaction 内で全置換し、i18n locale の merge write（`savePreferenceToFile`）は同じ lock に載せ済み。paths.json を触る `persistSettingsPaths` の settings.json 側 RMW は lock 済み
- **`workspaces/background/background-N.json` の dialog save**: background dialog は開いた時点の全状態を保持し、save で全置換する。owner panel の persist も同ファイルを書くため last-writer-wins の authority 競合は残るが、これは RMW の lost update ではなく UI 上の上書き競合であり、lock では解決しない（dialog は shell message で panel に反映を通知する既存経路を持つ）
- **`cache/layout-undo/<panelId>/stack.json`**: panel 単位の session cache で、その panel context のみが writer。cache 契約として lock 対象外
- **`tool-handoff/<extensionId>.json`**: read→consume（null 書戻し）の mailbox semantics。二重 consume は同一 payload の重複配送に留まり、lost update ではない
- **`styles/theme.css`**: 別機構で保護済み。`enqueueThemeWrite` の per-window queue + ExtendScript shared store の cross-surface mutex（Issue #106）が全 context の theme RMW を直列化する。backup restore は persistence lock 内から `enqueueThemeWrite` を呼ぶため二重に安全
- **presets.json の legacy prefix 正規化 write**（`repository/shared.ts` の `shared.read()` 内、`local-catalog.ts`・`catalog-root-pinned.ts`・`services.ts`）: 一度きりの id prefix 移行で、read 直後の全行正規化を書き戻すだけ。mutation 経路では lock 内の read に含まれるため保護され、`list()` 経路の窓は移行済みファイルでは発火しない
- persistence gateway（Rust storage）が未配線のため、gateway 経路の lock 意味論は未定義。本番は CEP Node `fs/promises` 直接 I/O が実経路
- stale-break + 再取得 + release restore が重なる極端な凍結→復帰シナリオでは残存する理論上の split-brain 窓がある。heartbeat + rename 検査で実用上は閉じ、発生時は quarantine 保存 + error log で観測可能にする

## Consequences

- `workspacePersistChain` は同一 context 内の順序付けとして残るが、正しさは lock + merge が担う。persist job は lock 内で **最新の state を読み直して** serialize するため、queue に残った古い snapshot が move 済み tile を復活させることがない
- `persistSurfaceStateAwaitable` は chain に乗せず、lock 内で最新 state を書く。`applyInterPanelMove` の保持へ ALS join するため step (4) は move の critical section に含まれる
- 旧「外部 tile は追加のみ merge」契約は削除を扱えないため破棄し、本書の双方向 merge に置き換える
- PR #201 は本契約の実装と検証が揃うまで Draft を維持する

## 検証

- lock protocol: 単体 test（同一 process の複数 async context）+ **独立プロセス**（bun 子 process の実 fs）で競合・stale 回収・release の foreign 保護を検証する。単一 Vitest process 内の Promise 並列化だけでは保証済みにしない
- merge: disk/state/lastPersisted の組合せを pure function test で網羅し、実 fs を使う配置経路 test で往復を確認する
- 障害注入: transaction 途中の write 失敗で preimage / 他ファイルが守られることを検証する
