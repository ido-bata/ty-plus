# ADR-008: Widget / surface ErrorBoundary + 縮退動作マトリクス

**日付:** 2026-09-10
**状態:** Accepted
**関連:** [Widget Boundary](2026-09-10-widget-error-boundary-policy-degradation-matrix.md は別 ADR ではなく本 ADR に統合),
[`docs/architecture/ui-reconstruction/error-boundary.md`](../architecture/ui-reconstruction/error-boundary.md)

## 背景

After Effects の CEP パネルは単一の CEF / Chromium プロセスで動作する。1 つの widget
render が `throw` した場合、その例外が React の default 経路で上位に抜けると、
パネル全体 (workspace 全体 + settings プレビュー + toolbar + status bar) が
一瞬で白紙化する。これは production tool としては致命的であり、
現状は settings dialog にのみ `SettingsDialogErrorBoundary` が設置されている
([`src/management/setting/dialog/Settings.tsx`](../src/management/setting/dialog/Settings.tsx))。

ユーザー報告 (Issue #67) はこれを widget / surface 単位に展開することを求め、
以下の症状を pin point している。

- workspace grid の中で 1 つの widget が例外を投げると、隣接する widget も
  grid 全体も巻き込んで消える。
- workspace が落ちると toolbar / status bar / picker overlay も消える。
- ユーザー視点では「パネルが落ちる」しか観測できず、原因 widget を特定できない。

デモ段階であり「レガシー経路を残さない」方針 (AGENTS.md §厳守事項) のため、
fail-soft な動作は React コンポーネント境界として実現する (process isolation は
選択肢から外れる。詳細は §「process isolation を採らない理由」)。

## 検討した案

### 案 A: 各 widget に `try / catch` を埋め込み、例外を握りつぶして空 state を返す — 不採用

`function/widget/<kind>/<Component>` に `try { return ... } catch { return <Empty/> }` を
入れる。

- ❌ widget 数が 8+ あり、cross-cutting concern を leaf に押し込むのは保守性を壊す。
- ❌ widget 実装者が recover policy を毎回考える必要があり、ボトルネックが分散する。
- ❌ 落ちた widget がリトライできず、ユーザー操作不能のまま固定される。

### 案 B: パネル全体を 1 つの `ErrorBoundary` で覆う — 不採用

`App.tsx` (≡ `Main.tsx`) の root にだけ境界を置く。

- ❌ 1 widget の throw でパネル chrome (toolbar / status bar) まで消える。
- ❌ ユーザーには「再読み込み」しか残らない。Issue の症状を半分しか解決しない。
- ❌ 再 mount のコストが大きく、retry の UX が悪い。

### 案 C: Widget 単位 + surface 単位の `ErrorBoundary` 階層 + 縮退マトリクス — 採用

`src/management/panel/ErrorBoundary.tsx` を共通 primitive として置き、
以下の階層で境界を張る。

| 階層 | 場所 | 責務 |
| --- | --- | --- |
| **widget** | `function/widget/registry.ts` の `renderDescriptorSafe` | 1 widget の render throw を、その tile 内に閉じ込める |
| **surface** | `src/management/panel/Main.tsx` の `SurfaceErrorBoundary` | workspace-grid / workspace-group-layer / toolbar / status-bar / add-widget-picker 単位の chrome を保護 |

各 surface / widget は **縮退マトリクス** ([`error-boundary.md`](../architecture/ui-reconstruction/error-boundary.md))
に従って、失敗時に「ユーザー操作を完全に失わない」最低限の UX を返す。
diagnostic 経路は `componentDidCatch` → `console.error("[ErrorBoundary:<name>] render failed:", error, info)`
に集約し、将来 notifier / debug 面に差し替え可能にする。

- ✅ 「1 widget の throw で他のタイルが止まらない」を widget 単位で保証できる。
- ✅ 「1 surface の throw で chrome が消えない」を surface 単位で保証できる。
- ✅ recovery flow は `errorBoundary.reset()` (retry ボタン) または
  `onResetRef` でホストから駆動できる。
- ✅ diagnostic 経路は 1 関数に集約されており、logger 差し替えは 1 箇所だけ。
- ⚠️ widget 内の subtree (tab / input) の細かい error は捕捉しない。
  これは widget 実装者の責務 (use-case 固有) として本 ADR のスコープ外。

## 決定

**案 C を採用する。** `ErrorBoundary` クラスコンポーネントを共通 primitive として
`management/panel/ErrorBoundary.tsx` に置き、`SurfaceErrorBoundary` で surface
命名 + retry ボタンを薄いラッパで提供し、`function/widget/registry.ts` の
`renderDescriptorSafe` で widget mount を 1 行で包む。

### process isolation を採らない理由

CEP パネルは単一の Chromium プロセスで動く。`iframe` での isolate や Rust
operation worker への分離は可能だが、以下を満たせない。

- 親プロセスからの props 共有 (`SurfaceState` / `Layout`) が必須 → iframe 間
  state 同期コストが「1 widget throw あたり」を正当化しない。
- IPC 経路 (`management/ipc/transport`) の往復 latency が retry UX を破壊する。
- 既存の Rust operation worker は **persistent cache** と **catalog**
  所有 ([`2026-08-21-rust-operation-worker`](2026-08-21-rust-operation-worker.md))
  であり、widget render の例外ハンドリングはその責務外。

React component 境界での bulkhead が、現状の制約下では唯一の正解である。

### 境界ポリシー

| ルール | 根拠 |
| --- | --- |
| **widget 単位で必ず ErrorBoundary を置く** | 1 widget の throw が他 tile に波及するのを防ぐ |
| **surface 単位で必ず ErrorBoundary を置く** | 1 surface の throw が他 chrome を巻き込むのを防ぐ |
| **`SurfaceErrorBoundary` の `surface` prop は machine-readable な固定文字列** | telemetry / E2E / Storybook で安定して参照できる |
| **`componentStack` は panel chrome に出さない** | 内部情報は diagnostic 経路 (`console.error`) のみ |
| **fallback UI は retry ボタンを必ず持つ** | 自動 reload では失われる state をユーザーが明示的に再投入できる |
| **recovery は state reset (`setState({error:null})`) でやる** | `key` ping-pong は subtree を unmount するため state が消える |
| **`onResetRef` でホスト駆動 recovery も可能** | ExtendScript からの panel reload と統一できる |

### Fallback UI ルール

| 要素 | ルール |
| --- | --- |
| 言語 | i18n key (`panel.errorBoundary.*`) 経由で必ず 10 locale から取得 |
| 色 / spacing | Tailwind v4 token のみ ([`@/shared/style/tokens`](../src/shared/style/tokens)) |
| role | `role="alert"` + `aria-live="assertive"` (screen reader に必ず通知) |
| data-attribute | `data-ty-error-boundary-fallback` + `data-ty-error-boundary-name` (host 統合 / E2E 用) |
| digest | `error.name + error.message` を最大 160 文字に切り出し。PII / componentStack は含めない |

### Recovery flow

```text
[throw]
  ↓
componentDidCatch(name, error, info)
  ↓                                    ↘ console.error (diagnostic)
setState({error})                       onError?(error, info) (拡張 hook)
  ↓
render → <DefaultWidgetErrorFallback>
  ↓
[user clicks Retry]
  ↓
errorBoundary.reset() → setState({error: null})
  ↓
render → children (subtree そのまま再 mount)
```

`onResetRef` を使う場合、親コンポーネントが `handle.reset()` を任意の
タイミング (host イベント受信時など) で呼び出せる。CEP パネルの Reload ボタン
(`.messaging`) と統一できる。

## 影響範囲

- 新規 module: `src/management/panel/ErrorBoundary.tsx`,
  `src/management/panel/ErrorBoundary.test.tsx`,
  `src/management/panel/surfaces/SurfaceErrorBoundary.tsx`
- 既存 module 編集: `src/management/panel/Main.tsx`,
  `src/function/widget/registry.ts`
- 新規 i18n key: `panel.errorBoundary.{surface,title,retry,copyError,copied,digest}`
  (10 locale parity)
- 新規 spec: [`docs/architecture/ui-reconstruction/error-boundary.md`](../architecture/ui-reconstruction/error-boundary.md)
  (縮退マトリクス)

## 廃止条件

- widget / surface 単位で **OS process** レベル isolation が必要になった場合
  (例: widget が危険な eval を実行するケースが許可された場合): 新 ADR を起こし、
  本 ADR と相互参照する。
- i18n の source of truth が `en/` から移動した場合: fallback UI の文字列取得
  経路を 1 箇所 (`ErrorBoundary` 内の t()) で吸収しているので、修正は 1 ファイル。
