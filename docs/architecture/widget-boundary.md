# Widget Boundary

**状態:** Active

## 縮退マトリクス / ErrorBoundary

Widget / surface 単位の render 例外に対する fail-soft 動作は
[`ui-reconstruction/error-boundary.md`](ui-reconstruction/error-boundary.md)
が正典である。`ErrorBoundary` 自体の責務・境界・recovery flow は ADR
[`docs/decisions/2026-09-10-widget-error-boundary.md`](../decisions/2026-09-10-widget-error-boundary.md)
が pinning する。

## ファイルエントリ一覧の所有

`FileEntryList` は storage が所有する機能 UI である。ファイルシステムのエントリを
一覧して選択・移動させる。共通 primitive ではない。

storage が所有する機能を「browser」と呼ぶと語が二重になる（browser は一般に
パスとツールバーを持ち、それらは利用側の責務）。そこで名前は「file entry の
一覧」を表すものにする。

| 観点 | 所有者 |
|--------|-------|
| ファイルシステムの提示 | `management/storage/ui/file-entry/FileEntryList.tsx` |
| Product icon (PresetIcon) | `management/preset/contract` |
| 機能的な振る舞い (file browser state, catalog) | `management/storage` |

この表は `docs/architecture/widget-boundary.owners.json` に機械可読な形で
複製があり、`scripts/check/check-ui-ownership.ts` が所有者違反を検出する
(所有者モジュールの欠落・別 layer における同名の再実装)。表と manifest は
同時に更新すること。

## 既知の management → function 越境

`tools/check/import-boundary.ts` は `@/` alias 形式の import も解決する
（以前は alias を解決しないため、この規則が実質的に発火していなかった）。
現在残る越境は次のとおりで、`tools/check/.baseline.json` に退避してある。

| 箇所 | 越境先 | 内容 |
| --- | --- | --- |
| `management/dialog/routes.tsx` | `function/preset/*/Dialog` | dialog router が function 層の preset dialog を mount する |
| `management/panel/boot.tsx` | `function/onboarding/View`, `function/onboarding/ui/SetupRequired` | panel の boot が onboarding の view を mount する |
| `management/preset/onboarding/directory.ts` | `function/onboarding/steps-data` | onboarding の step 定義を参照する |
| `management/workspace/events/handler.ts` | `function/widget/core/align`, `function/widget/core/anchor-point` | workspace の event handler が個別 widget の action helper を参照する |

いずれも「利用側が実装に届く」構造で、所有権の問題はないが、境界の
裏返しである。これらは baseline からの縮小対象であり、優先度は低い。

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

## Loop Widget

loop 機能は easing の mode ではなく独立 widget (`function/widget/core/loop`)
として実装される。設計正本は `docs/architecture/widget/loop.md` と
`docs/decisions/2026-11-21-loop-cyclic-wave-model.md`。easing の `Mode` に
`"loop"` は存在せず、過去に保存された `mode: "loop"` state は
`coerceStoredState` で `"curve"` に degrade する。host 側の
`applyLoopEasing` コマンドは loop widget が利用する。