# Debug Console

`runtime/debug-console.md` は、AE パネル内 debug console の capture / broadcast / 永続化 / セッション境界の最終状態を定義する。

## 読む順番

1. [entrypoints.md](entrypoints.md) — debug console は workspace panel および modeless dialog の両方の入口から到達する
2. [host-boundary.md](host-boundary.md) — CEP 共有 storage との境界
3. 本ファイル
4. [operation-worker.md](operation-worker.md) / [cep-ime.md](cep-ime.md) — 関連する AE 境界

## Surface

- workspace panel に同居する `panel-1 ... panel-5` のそれぞれは、起動時に独自の JS コンテキストで interceptor をロードする
- modeless dialog `debug-console`（extensionId `app.ty-plus.debug-console`）は別個の CEP 拡張で独立した JS コンテキストを持つ
- いずれのコンテキストでも interceptor モジュールが独立に動作し、ログは CEP 共有 storage を介して他のコンテキストに伝搬する

## モジュール構成

- `src/management/debug/console/types.ts` — `LogMessage` / `WirePayload` などの platform-independent 型
- `src/management/debug/console/interceptor.ts` — console.* の monkey patch、broadcast、close flush、セッション境界の管理
- `src/management/debug/console/shared-bridge.ts` — CEP 共有 storage への read/write と 1000 件 slide、Clear tombstone（`clearedAt`）の読み書き
- `src/management/debug/console/message-store.ts` — パネル表示向けのマージロジック（**message id のみ**で dedupe する）
- `src/management/debug/console/ui/Panel.tsx` / `dialog-root.tsx` — パネル UI と level / source / session scope のフィルタ
- `src/management/debug/console/open-params.ts` — modeless open params で初期ログを受け渡す
- `src/management/debug/index.ts` — barrel（`enableInterceptor` / `enableCepBroadcast` / `initializeLogRetention` 等の公開 API）

## 配信経路（live delivery）と replay の分離

ログ同期に polling は使わない。`setInterval` / timer loop / 定期 `readSharedLogs()` は禁止であり、
取りこぼし対策としての定期 read も禁止する。

```text
live  : createLogger(source)
        → canonical LogBus（id / source / action / context）
        → interceptor の subscribeLog bridge
        → CEP APPLICATION スコープ broadcast + surface transport publish
        → 他 surface の ingest → message id で dedupe → 表示

replay: open-params 初期スナップショット（直近 200）
        + replay-request / response（最大 1000）
        + CEP 共有 storage の retained history（最大 1000）
```

- shared storage は **retention / replay 専用**であり、live 配信の polling source にはしない
- live と replay は同一の `mergeLogMessages` に合流するため、level / source / session scope の
  フィルタは両者に同一に作用する
- dedupe は **message id のみ**。本文が同一でも id が異なれば別行として残す

`enableInterceptor()` は console.* を monkey patch し、各呼び出しを `_broadcastMessage` に渡す。broadcast は:

- `com.typlus.surfaceMessage`（APPLICATION スコープ）に wire payload を dispatch する
- surface transport へ `kind: "publish"` を送出する
- shared bridge の `writeSharedLogs` を 100ms debounce で叩き、`LOG_SHARED_KEY = "ty_plus_debug_logs_v1"` に最大 `MAX_SHARED_LOGS = 1000` 件を書き出す
- release ビルドでも shared storage へ書き出す（AE 再起動後(post-mortem)の triage 用）

`enableCepBroadcast(win)` を呼ぶまで broadcast は実際には送信されない（起動時に boot から有効化する）。

### Wire payload

`WirePayload` は `v / id / level / text / timestamp / source` に加えて **`action` と `context`** を持つ。
canonical `LogEntry` の structured field は CEP event・surface bus・shared retention・open-params の
いずれの hop でも剥がさない（request correlation などを別 surface から読めるようにするため）。

- serialize は `toLogWirePayload` の1本に集約され、`context` を JSON encode できない場合は
  **その field を落として emit を続行する**（logger を壊さない）
- ingress は `isSanitizedLogWirePayload` が `action`（128）と `context`（encode 後 2048）を検証する

### transport failure の diagnostic policy

logging transport が自分の failure を自分経由で報告すると無限に広がる。そのため:

- **recursion guard** — `_inTransportDiagnostic` 中は `_broadcastMessage` が即 return し、
  診断ログ自体は wire に出ない（no broadcast loop）
- **bounded fallback** — module load あたり先頭 `TRANSPORT_FAILURE_LOG_BUDGET`（5）件のみ記録し、
  以降は黙殺する
- stage ごとに `serialize` / `dispatch` / `publish` / `notify` / `retention` を区別して記録する

### Debug Console の open は diagnostics trigger にしない

Debug Console を開く操作それ自体は

- `probeAfterEffectsEvalScript()` の実行
- host bundle load
- operation worker spawn

を誘発しない。host diagnostics が必要なら panel boot、または明示的な diagnostics command で行う。

## 永続化（retention / replay）

retention 上限は **1000 件に一本化**されている。所有は次の通り:

| 層 | 定数 | 値 |
| --- | --- | --- |
| canonical `LogBus` | `logger.ts#DEFAULT_CAPACITY` | 1000 |
| interceptor 内部 buffer | `interceptor.ts#MAX_MESSAGES` | 1000 |
| CEP 共有 storage | `shared-bridge.ts#MAX_SHARED_LOGS` | 1000 |
| replay snapshot | `DEBUG_LOG_REPLAY_MAX_ENTRIES` | 1000 |
| open-params 初期スナップショット | `open-params.ts#MAX_OPEN_PARAM_LOGS` | 200 |

- 共有 storage の `ty_plus_debug_logs_v1` は最長 1000 件で slide される
- 古い wire payload は `isSanitizedLogWirePayload` ガードを通過した分のみ `LogMessage` に変換される
- legacy shape（`{ id, level, args, timestamp, source }`）と slim shape（`{ level, text, timestamp }`）は migration 経路として残されているが、新規コードはこれらを生成しない
- **削除は明示的な `Clear` のみ**。panel / Debug Console の close・reopen・reload では消さない
- Clear は cross-surface な `clearedAt` tombstone（単調増加）で境界を共有し、
  各 read / write / live 配信の consumer-arrival 時点で前境界の行を落とす

## セッション境界 / view scope

「current session だけ表示」は **view のフィルタ**であり、retained history の破棄条件ではない。

1. `enableInterceptor()` の最初の呼び出しで `_currentSessionStartedAt = Date.now()` される
   - `currentSessionStartedAt()` でこの値が露出する
   - 同一 JS コンテキストで再呼び出しされても anchor は移動しない（mount-once の useEffect が複数回走っても安全）
   - **modeless `debug-console` は独立した JS コンテキスト**なので、この anchor は
     Debug Console 自身の起動時刻になる
2. `Panel.tsx` は `FilterScope`（`all` / `session`）を持つ。**既定は `all`** —
   retained history を最初から表示する。`session` を選んだ場合のみ
   `timestamp.getTime() >= sessionStartedAt` を適用する
   - anchor を無条件に適用すると、開いた瞬間に boot log が全部消える
     （`enableInterceptor` が console 側の起動時刻に anchor するため）
3. `flushOnAEPanelClose(win)` は CEP の `panel_before_close` / `panel_destroyed` を hook し、
   slide を維持したまま現在バッファを書き出し、`ty_plus_debug_session_marker_v1` に
   セッション境界マーカー（`{ kind: "closed", startedAt, closedAt }`）を書き込む
   - このマーカーは `console/interceptor.ts` 内に閉じた内部表現であり、外部 API としては公開されない
   - 監査・観測用途であり、動的な必須依存ではない
4. Clear は session scope とは独立。Clear のみが retained history を消す

### 何を増やすか / 何を増やさないか

- 新規 export: `flushOnAEPanelClose`, `currentSessionStartedAt`, `toLogWirePayload` のみ
- 新規型公開: `FilterScope`（`Panel.tsx`）、`LogMessage.action` / `LogMessage.context`
- 新規 shared storage key: `ty_plus_debug_session_marker_v1` のみ
  （`LOG_SHARED_KEY` の schema / slide 値は 300 → 1000 に変更）
- i18n キー追加: なし（filter chip は既存の英語ラベル体系に従う）
- 後方互換シム: 作らない

### 既知の制約

- `panel_before_close` / `panel_destroyed` の配送は AE/CEF 実装依存である。CEP 9 + ChromiumCEF では確認できるが、AECC 系や古いホストでイベントが欠落したケースでは `_broadcastMessage` の 100ms debounce flush で補える
- happy-dom ベースの単体テストは closure / storage を in-memory mock で扱う。AE 実機でしか確認できない挙動（イベント配送タイミング、`evalScript` round-trip）は `bun run ci` ではなく AE 実機 CI（`bun run host`）で担保する

## 検証手順

- unit: `bun run test -- src/management/debug`
- lint: `bunx @biomejs/biome check src`
- typecheck: `bun run typecheck`
- boundary: `bun run check:boundaries`
- storage split: `bun run check:storage-split`
- unused export: `bun run knip`
- React regression: `bunx --no-install react-doctor --diff`
