# review-350: PresetStage 受入指摘2件の修正検証

対象 Issue: #350（release-0-12-0 最終受入レビューの P1/P2）

## 対象と再現条件

- 対象 branch: `350`（`origin/release-0-12-0` = `3eb3a5b7` から分岐）
- 修正 commit: `13a85037ed1b99caaf14264c5e001741c8c3809f`
- worktree: `/Users/rebui/work/ty-plus-wt/350`
- ビルド: `apps/web` で panda codegen/cssgen 後 `bun run build`、`bun run preview`（workerd、`http://localhost:42565`）
- 撮影: `apps/web/scripts/capture-preset-stage.ts`、Playwright chromium。`capture-meta.json` に SHA・clean tree（`dirty: false`）・viewport・`data-mode`/`aria-pressed`/apply 注記を記録
- ビルドは commit 前の同一内容の tree から生成（commit は内容を変えない）

## 修正内容

### P1: 狭幅での info card 配置

従来は `order = anchorIndex*2+1` で選択タイルの直後に挿入していたため、行の残りセルが空白になり後続タイルが再配置されていた。修正後はアンカータイルが属する行の**末尾タイルの次**（`cardOrderIndex = rowEnd`、狭幅列数 `NARROW_COLS=3` は stage base と同期）に `order` を置き、全幅カードが必ず新しい行から始まる。行内の空白セルは発生せず、カードより下の行だけが1行分下にずれる。

### P2: 選択解除後のバッジ

従来は sticky 表示中も `sticky.source`（"selection"）を使い `selected` と表示していた。修正後は製品 `PresetInfoWidget` と同じく `source` を**現在のジェスチャー由来**（`live.source`、選択0件・hover無しなら "hover"）に揃え、バッジは sticky 中を `last selected` / `last selection` / `recent` と保持コンテンツであることが分かる表示に変更。accent トーンも live selection 中のみ。

## 検証

### DOM 実測（Playwright、desktop/tablet/mobile）

- 全タイル行が常に 3 タイル（tablet/mobile）/4 タイル（desktop）で埋まり、空白セルなし
- card はアンカー行の直後の独立行に配置（例: mobile anchor=row1 → card top が row1 下端直下、次タイル行は card 下端の直後）
- `scrollWidth === innerWidth`（横 overflow なし）

### 状態別バッジ実測（desktop fine pointer）

| 操作 | badge | pressed |
|---|---|---|
| initial（seed 選択） | `selected` | 1 |
| Ctrl+click で seed 解除（tile 上 hover 中） | `hover` | 0 |
| マウスを空白へ（hover 解除→sticky） | `recent` | 0 |
| 複数選択 | `N selected` | N |
| Escape で全解除 | `last selection` | 0 |

coarse pointer では tap の合成 mouse イベントで hover preview が live になるため `hover`/`recent` が出るが、いずれも実際の表示内容と一致する正直な表示。

### ゲート

- `bun run typecheck:web` pass
- `bun run biome check`（対象ファイル）pass
- `bun run check:react-doctor` pass（91/100、warnings 21 = baseline）
- `vitest --project=unit apps/web` pass（4 files / 36 tests）

### VL モデルレビュー

`openrouter/nvidia/nemotron-3.5-super-vl:free` で `final-mobile-index-tap-multi.png` / `final-mobile-index-tap-cleared.png` / `final-tablet-index-tap-multi.png` を確認。「行内空白なし・バッジが last selected 系の保持表示」との判定。DOM 実測と一致。

## 証跡

- `stage/` — `/`・`/features` × 3 viewport の状態遷移キャプチャ 26 枚 + `capture-meta.json`

## 残存リスク

- `NARROW_COLS=3` は stage base の `repeat(3, …)` と手動同期。ブレークポイント追加時は要追従（コメントで明示済み）
- sticky バッジの文言（`last selected`/`recent`）は Web 側の補助 chrome であり、製品 Info Widget にはバッジ自体がない。カード内の source タグは製品と同じ契約
