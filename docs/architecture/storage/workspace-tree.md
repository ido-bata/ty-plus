# Workspace Tree

この文書は、正規の support root と workspace tree 構造を定義する。

## 正規の定義元

root contract は Rust の storage crate が定義する。既存の TypeScript の
persistence モジュールは、storage 操作が runtime gateway の背後へ移行される
までの間、managed tree の現行利用者として残る。

| 役割 | パス |
| --- | --- |
| session root の型と選択 | `rust/crates/storage/src/root.rs` |
| managed root 相対パスの検証 | `rust/crates/storage/src/path.rs` |
| React から Rust への storage boundary | `src/management/storage/runtime-gateway.ts` |
| Persistence API（registry + I/O） | `src/management/storage/persistence/` |
| managed root の解決（`ty-plus-init.json` から） | `src/management/storage/persistence/managed-root.ts` |
| パス生成（managed root 配下） | `src/management/storage/persistence/paths.ts` |
| 実際のファイル I/O（read/write） | `src/management/storage/persistence/io.ts` |
| storage 実装（panel/widget/catalog/settings） | `src/management/storage/` |

移行によって TypeScript の persistence path が削除されるまで、その JSON 操作は
`PATHS` registry を key とする `readJson` / `readJsonText` / `writeJson` を
使い続ける。新しい呼び出し元は `src/management/storage/runtime-gateway.ts` を
迂回して、別の root resolver や直接のファイル I/O path を持ち込まない。

## Session Root Contract

接続された After Effects session はいずれも、2 つの異なる絶対パスを供給する。

- `SessionAppRoot` は、ExtendScript 側で取得した実行中 host の
  `Folder.appPackage.fsName` の
  値である。Rust はこれを session context として受け取り、自ら探索しない。
- `SessionSupportRoot` は、同じ host session とともに供給される書き込み可能な
  既定の support root である。

Rust は、レジストリ、環境変数、`Applications`、CEP の `userData`、
ハードコードされた OS パスの走査によって、これらの値のいずれかを
置き換えてはならない。root 入力が欠落、相対パス、空、または曖昧である場合は
エラーであり、fallback となる root は存在しない。`SessionSupportRoot` を
供給する ExtendScript adapter はまだ実装されていないが、その代わりに別の
探索機構を追加してはならない。

After Effects のバージョンは、root の型、選択、storage key のいずれにも
含まれない。したがって同時に実行されている AE アプリケーションは、
ユーザーが明示的に同じ共有 browse root を選択しない限り、供給された
session root からそれぞれ独立に解決される。

## Thumbnail cache

`<managedRoot>/thumbnails/` 配下に directory browser の file entry 用 thumbnail
cache を所有する。定義元と所有者、生成パイプライン、cache key は
[`../runtime/thumbnails.md`](../runtime/thumbnails.md) を参照。

## Managed Root の選択

`rust/crates/storage/src/root.rs` の `ManagedRootSelection` は、
次の 2 つの選択肢のみを持つ。

| 選択 | Locator | Managed root |
| --- | --- | --- |
| `SessionDefault` | `<sessionSupportRoot>/ty-plus-init.json` | `<sessionSupportRoot>/ty-plus/` |
| `ExplicitShared` | `<sessionSupportRoot>/ty-plus-init.json` | `<explicitBrowseRoot>/ty-plus/` |

既定の動作は、別の AE インストールや別の session の設定を探索しない。
共有は明示的な browse root の選択によってのみ発生する。参加する各 AE session は、
自身の support root 配下に自身の locator を保持する。locator は共有 managed root
へ移動しない。

`rust/crates/storage/src/path.rs` の `ManagedRelativePath` は、解決済みの
managed root へ結合する前に、空、絶対パス、カレントディレクトリ、
親ディレクトリ遡上の入力を拒否する。これは字句上の boundary のみである。
symlink および Windows の reparse point による脱出の防止はファイルシステム
I/O 実装の責務であり、まだ実装されていない。それが存在し、Windows と macOS
の両方でテストされるまで、いかなる storage 操作もその強い保証を主張してはならない。

## 正規の Managed Tree

この tree が正規である。実装はこれに従う。共有レイアウトファイル
(`layout.json`) は使用しない。snapshot は全 panel で共有される単一ファイルに
保存する。

```text
<supportRoot>/
├─ ty-plus-init.json
└─ ty-plus/
   ├─ settings/
   │  ├─ app.json
   │  ├─ paths.json
   │  ├─ ui.json
   │  └─ control-panel.json
   ├─ workspaces/
   │  ├─ workspace-1.json
   │  ├─ workspace-2.json
   │  ├─ workspace-3.json
   │  ├─ workspace-4.json
   │  ├─ workspace-5.json
   │  ├─ background/
   │  │  ├─ background-1.json
   │  │  ├─ background-2.json
   │  │  ├─ background-3.json
   │  │  ├─ background-4.json
   │  │  └─ background-5.json
   │  └─ history/
   │     └─ snapshots.json
   ├─ presets/
   │  ├─ presets.json
   │  └─ assets/
   ├─ groups/
   │  └─ groups.json
   ├─ widgets/
   │  ├─ widgets.json
   │  └─ state/
   │     ├─ easing.json
   │     ├─ file-browser.json
   │     ├─ note.json
   │     └─ youtube.json
   ├─ cache/
   │  ├─ notifications.json
   │  └─ remote-presets.json
   ├─ control/
   │  └─ operation.lock
   ├─ styles/
   │  ├─ theme.css
   │  └─ workspaces/
   │     ├─ workspace-1.css
   │     ├─ workspace-2.css
   │     ├─ workspace-3.css
   │     ├─ workspace-4.css
   │     └─ workspace-5.css
   └─ logs/
      └─ ty-plus.log
```

## 書き込み権限

`ty-plus-init.json` は、永続化された root 選択に対する session ごとの
bootstrap authority である。commit 済みの Rust の型は、検証済みの session
入力と、default / shared の選択後の結果をモデル化している。Rust による
locator の read/write と symlink-safe なファイルシステム I/O は未完了である。

移行期間中、TypeScript の persistence モジュールの `resolveWriteManagedRoot`
は、locator が欠落、不完全、または support root が空であると報告した場合に
throw し続ける。runtime readiness flag、移行 fallback、ExtendScript write
fallback は存在しない。onboarding 前の書き込みは例外として表面化し、
読み取りは null を返す。

## 永続データと OS の一時領域

再起動やオフライン利用をまたいで残らなければならない product state は、
すべて可視の managed tree に属する。これには設定、workspace state、
操作履歴、asset、ログ、永続キャッシュが含まれる。検索キャッシュは永続で
あり、アプリケーションが終了したという理由だけで削除されることはない。
その正確な所有パスは、storage 実装が導入された時点でこの正規 tree に
追加しなければならない。

OS 標準の一時ファイル領域は、消失しても product state を変えず、履歴を
失わず、再設定を要求せず、要求された操作の完了を妨げない、破棄可能な
キャッシュのバイト列に限り許可される。OS の一時領域は、support root の
fallback、locator の置き場所、永続キャッシュ層、永続データの受け渡し機構
のいずれにもならない。プラットフォーム固有の一時パスはここにハードコード
しない。

`control/operation.lock` は 1 invocation の worker が managed root の共有書き込みを
直列化するための OS lock の対象である。lock は process crash で解放されるが、file
entry が残ることは許容し、次回の recovery または managed folder の reset で扱う。
endpoint、process identity、heartbeat はこの tree に永続化しない。

履歴、snapshot、worker log の保持数は storage-owned policy が所有する。時間ベースの
TTL は導入しない。値と data shape は `rust/crates/storage/src/` の定義元と使用元を
参照し、この文書では再定義しない。OS 標準の一時ファイル領域は、1 operation の完了後
に不要となる disposable cache / scratch bytes に限り許可し、成功・失敗後に削除する。
