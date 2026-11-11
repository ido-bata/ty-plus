# Widget / Surface ErrorBoundary 縮退マトリクス

**状態:** Active
**関連 ADR:** [`docs/decisions/2026-09-10-widget-error-boundary.md`](../../decisions/2026-09-10-widget-error-boundary.md)

CEP パネルは単一 CEF プロセスで動く。React component 境界 (= ErrorBoundary) が
パネル唯一の bulkhead であり、各失敗経路に対して「ユーザー操作を完全に失わない」
最低限の UX を返す責務はこのマトリクスが pinning する。

## 凡例

| 列 | 意味 |
| --- | --- |
| 失敗モード | 例外・タイムアウト・データ欠落など |
| 検出点 | 例外 / 失敗を最初に観測する React 層 |
| 縮退先 | ユーザーが観測する最小 UX (boundary の fallback または呼び出し側の inline) |
| recovery | ユーザーまたは host から取れる復帰手段 |
| 影響範囲 | 同じ surface 内の他の要素に波及するか |

## Surface-level

| surface | 失敗モード | 検出点 | 縮退先 | recovery | 影響範囲 |
| --- | --- | --- | --- | --- | --- |
| `workspace-grid` | Grid 内の widget が throw | `<SurfaceErrorBoundary>` 配下の widget `ErrorBoundary` | 失敗 widget の tile 内に「Widget failed to render」 + Retry | tile 内の Retry ボタン | 失敗 widget 1 tile のみ。他 tile は無傷 |
| `workspace-grid` | resize / grid layout 計算が throw | `Grid` component | 「Configuration could not be loaded」+ retry (既存挙動を保持) | Retry | grid chrome 全体 |
| `workspace-group-layer` | group overlay が throw | `<SurfaceErrorBoundary>` 配下 | 空 group layer (透明) | layer Retry | group の chrome は消えるが他 surface は無傷 |
| `toolbar` | toolbar が throw | `<SurfaceErrorBoundary>` 配下 | toolbar 消失 + status bar に recovery ヒント | panel reload | chrome のみ。workspace grid は無傷 |
| `status-bar` | status bar が throw | `<SurfaceErrorBoundary>` 配下 | status bar 消失 | panel reload | chrome のみ |
| `add-widget-picker` | picker overlay が throw | `<SurfaceErrorBoundary>` 配下 | picker overlay 消失 (ESC / 再 open で再試行) | picker close + reopen | overlay のみ |

## Widget-level

| widget | 失敗モード | 検出点 | 縮退先 | recovery |
| --- | --- | --- | --- | --- |
| `align` | align 計算で NaN / Inf | widget `ErrorBoundary` | 空 align tile + Retry | Retry ボタン |
| `anchor-point` | anchor 未解決 | inline empty state (境界不要) | 空 tile + 「No anchor set」 | widget config 再投入 |
| `easing` | curve 計算が NaN | widget `ErrorBoundary` | 空 tile + Retry | Retry ボタン |
| `layout-lock` | layout 解決失敗 | widget `ErrorBoundary` | lock icon が disabled で表示 | layout 設定変更 |
| `menu` | menu state が壊れた | widget `ErrorBoundary` | menu collapse + Retry | Retry ボタン |
| `info` | project state 取得失敗 | inline empty state (UI 側で吸収) | 「Project info unavailable」 | panel reload |
| `directory-browser` | scan 失敗 / file 取得失敗 | widget 内 `EmptyState` 既存経路 | empty state + retry button (Issue #24) | retry |
| `font-viewer` | font preload 失敗 | widget 内フォールバック | sibling font list 表示 | 設定変更 |
| `quick-actions` | action 1 つが throw | action 単位の try/catch | action button disabled + tooltip | widget config 変更 |

## Cross-cutting failure modes

| 失敗モード | 検出点 | 縮退先 | 補足 |
| --- | --- | --- | --- |
| thumbnail decode 失敗 | `useThumbnail` (Issue #51/52) | placeholder icon | thumbnail pipeline ([`docs/architecture/runtime/thumbnails.md`](../runtime/thumbnails.md)) 既存 |
| worker (Rust operation worker) 不在 | `useEffect` + 状態管理 | CEP-node 直経路へフォールバック ([`docs/architecture/runtime/operation-worker.md`](../runtime/operation-worker.md) § degraded) | 読み込み専用モードに縮退 |
| catalog fetch 失敗 | `useCatalog` | empty state + retry | online 経路、offline 時は local cache にフォールバック |
| i18n key 欠落 | `i18next` default | `defaultValue` を fallback | boundary 関係なし。既存挙動 |
| clipboard API 不在 | `DefaultWidgetErrorFallback` の copy handler | copy ボタンを disabled | 10 locale UI 保証と独立 |
| persist write 失敗 | write path (storage-split) | toast / 既存 storage error 経路 | Issue #66 と直交 |

## Recovery 手段

| 手段 | 用途 | 実装 |
| --- | --- | --- |
| Retry ボタン | 失敗した widget / surface を即時再 mount | `errorBoundary.reset()` |
| Panel reload | surface 全体の再 mount | host イベント → `messaging.reloadPanel` |
| `onResetRef` (imperative) | ホスト駆動の recovery (ExtendScript からの指示など) | parent が handle を保持し任意のタイミングで `reset()` |
| workspace 復元 | レイアウト破損時の全面復旧 | workspace backup / restore ([`docs/architecture/storage/workspace-tree.md`](../storage/workspace-tree.md)) |

## Diagnostic 経路

`ErrorBoundary.componentDidCatch` は失敗を以下へルーティングする:

1. `console.error("[ErrorBoundary:<surface|widget>] render failed:", error, info)` (default)
2. `props.onError?.(error, info)` (拡張 hook、Storybook / E2E で利用)

将来 notifier / debug 面に切り替える場合は、`ErrorBoundary.tsx` の
`reportCaughtError` 1 箇所を差し替えるだけで全 surface / widget に伝播する。

## このマトリクスの更新条件

- 新規 widget を追加したら **Widget-level** 表に 1 行追加する。
- 新規 surface を追加したら **Surface-level** 表に 1 行追加する。
- 新規の cross-cutting 失敗モードが見つかったら **Cross-cutting** 表に追記する。
- 縮退先を変更する場合は、対応する widget / surface 実装も同期して更新する。
