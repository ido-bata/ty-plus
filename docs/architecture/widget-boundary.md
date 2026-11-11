# Widget Boundary

**状態:** Active

## 縮退マトリクス / ErrorBoundary

Widget / surface 単位の render 例外に対する fail-soft 動作は
[`ui-reconstruction/error-boundary.md`](ui-reconstruction/error-boundary.md)
が正典である。`ErrorBoundary` 自体の責務・境界・recovery flow は ADR
[`docs/decisions/2026-09-10-widget-error-boundary.md`](../decisions/2026-09-10-widget-error-boundary.md)
が pinning する。

## DirectoryBrowser の所有

`DirectoryBrowser` は storage が所有する機能 UI である。ファイルシステムのエントリと product icon を提示する。共通 primitive ではない。

| 観点 | 所有者 |
|--------|-------|
| ファイルシステムの提示 | `management/storage/ui/DirectoryBrowser.tsx` |
| Product icon (PresetIcon) | `management/preset/contract` |
| 機能的な振る舞い (file browser state, catalog) | `management/storage` |

## Widget Interface Boundary

widget システムは interface と implementation の 2 層 boundary を用いる。

```
management/widget/contract  →  management-facing interface only
function/widget/contract   →  function-local implementation details only
```

### Interface と Implementation

| 層 | パス | 目的 |
|-------|------|---------|
| Management-facing | `management/widget/contract.ts` | Widget registry、runtime metadata、workspace 統合 API |
| Function-local | `function/widget/contract.ts` | widget 実装型、内部 contract |

### アクセスルール

`management` が function 側の widget 実装を読めるのは `function/widget/index.ts` manifest 経由のみである。`function/widget/<leaf>/**` からの直接 import は boundary check により禁止される。

### この boundary が存在する理由

`function/widget/` の widget leaf は UI コンポーネント、コマンドの振る舞い、機能ローカルの型を所有する。management 側のシステム (registry、workspace、placement) は、management のオーケストレーションと機能実装の間を疎結合に保つため、manifest index 経由でのみ widget にアクセスしなければならない。

## Easing Widget: Loop モード

`function/widget/core/easing` は `Mode` 拡張として `"loop"` を持つ。
loop モードは **in ターゲットにのみ** 意味を持つ — `applyTargetingRef` が
`"both"` / `"out"` のときは単一 cycle の適用にフォールバックする。
bounce / elastic モードでは loop トグルを disable し、`applyEasing` 経路のみ
が走る。loop 経路はホスト側に専用の `applyLoopEasing` コマンドを追加する:

- 1 アクションで `(k1, k2)` 区間内に `loopCount` cycle の同形 curve を再生成
- `loopCount` は整数 1..N (host 側でクランプ)
- `cubic` / `points` / `labelColor` / `detectedType` の payload shape は `applyEasing` と共通
- host 実装は `src/management/ae/jsx/host-bundle.ext.ts` の既存 multi-point
  apply 経路を `loopCount` 回複製する形に拡張する。React 側で point 配列を
  膨らませて送る形にはしない (handle の segment-relative 座標が歪むため)