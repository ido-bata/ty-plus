# review-345: release-0-12-0 最終ゲート検証

対象 Issue: #345

## 対象と再現条件

- 候補統合 head: `330e2fb7928e1ac0f03d7ec1244435af433ad8dd`（PR #346/#347/#348 統合後）
- 検証 branch: `345`。ゲート中に Changelog 抜粋の修正 `657ebba0163314d44d0a8216c87e626dc8bc3db7` を追加し、**全証跡はこの SHA の clean tree から取得**
- worktree: `/Users/rebui/work/ty-plus-wt/gate345`（`mise run worktree:setup` 済み）
- ビルド: `apps/web` で `panda codegen` / `panda cssgen` 後 `bun run build`（vite build + prerender 6 ページ）
- 配信: `bun run preview`（`@cloudflare/vite-plugin` 経由、`http://localhost:42565`）。Changelog は live GitHub Releases を取得（snapshot fallback ではない）
- 撮影: `apps/web/scripts/capture-screens.ts` / `capture-preset-stage.ts`、Playwright chromium 153.0.8010.12
- viewport: desktop 1440×900 / tablet 834×1112 / mobile 390×844
- `capture-meta.json` に SHA・dirty 状態（`dirty: false`）・browser・wait 条件・viewport・menu 初期状態 assertion を記録

## 証跡

- `pages/` — 全 6 ルート（`/` `/features` `/download` `/docs` `/changelog` `/support`）× 3 viewport のフルページ＋セクション＋footer、mobile は menu-open も撮影（89 枚）
- `stage/` — `/` と `/features` × 3 viewport の PresetStage 状態遷移（desktop: initial/hover/multi/cleared/applied、coarse: initial/tap-selected/tap-multi/tap-cleared）。`data-mode`・`aria-pressed` 数・apply 注記有無を `capture-meta.json` に記録（26 枚）
- 過去証跡 `review-337/final*/`・`review-342/`・`review-343/`・`review-344/` は比較用に保持

## ゲート実施結果（全て `657ebba0` の tree で実行）

| ゲート | 結果 |
| --- | --- |
| `bun run build`（apps/web） | pass（6 ページ prerender） |
| `bun run typecheck`（root 全 project） | pass |
| `bun run typecheck:web` | pass |
| `bun run lint`（biome + design-tokens + static-guardrail + tailwind-literals + storage-split + i18n coverage/locked-terms + web-design） | pass |
| `bun run check:react-doctor` | pass（score 91/100、warnings 21 = baseline、errors 0） |
| `bun run check:skills` | pass |
| `vitest --project=unit apps/web` | pass（4 files / 36 tests。`release-excerpt` の bundled snapshot 12 release を含む） |
| 実データ検証 | live GitHub Releases 全 12 件に `releaseExcerpt` を適用し、insider.4〜.7 の prose から `sourceCommit`/`channel=`/`ADR-` が除去されることを確認 |

## VL モデルレビューと採否

レビュー実施: `openrouter/nvidia/nemotron-3.5-super-vl:free`（opencode 経由。前回と同じ画像対応モデル。`opencode/nemotron-3.5-super-vl-free` は free quota 枯渇のため openrouter provider 経路を使用）。指摘は実画像・DOM 実測・実装・実データと照合して採否を判断した。

### 採用（修正済み）

| 指摘 | 対応 |
| --- | --- |
| Changelog: insider.4〜.7 の概要が `channel=insider` / `sourceCommit` / `ADR-0003` 等の内部メタデータ中心 | **採用・修正**。`release-excerpt.ts` に `scrubExcerptMeta` を追加し、`sourceCommit <sha>`・`channel=…`・`ADR-N`・括弧内裸 SHA を抜粋から除去（空括弧・余分な空白も整理）。snapshot 契約テスト追加。live 実データで除去を確認し、修正後スクリーンショットを VL 再レビューして解消を確認。`657ebba0` |

### 棄却（実装・DOM・実データで反証）

| 指摘 | 棄却根拠 |
| --- | --- |
| LP: tablet/mobile で info card と選択タイルの紐付けが弱い | DOM 実測で棄却。info card は `order` 挿入によりアンカータイル直下に配置される（mobile: 選択タイル bottom=116 → card top=127、tablet: bottom=337 → top=349）。`scrollWidth === innerWidth` で横 overflow なし |
| LP: mobile の操作説明が hover/⌘/Ctrl/Shift 前提でタッチと不整合 | 棄却。`PresetStage.tsx` は `(pointer: coarse)` で footer 文言を出し分け（coarse: "Tap to inspect and select · in the panel a tap would apply the preset…"）。`hidden` 属性で fine/coarse を排他表示 |
| LP: tablet 834px でグリッド崩れリスク | 棄却。DOM 実測で 12 タイル全て complete row、overflow なし |
| Features: tablet で PRESET TILES の右プレビューパネルが欠落/画外 | 棄却。DOM 実測で info card はタイル群直下 y=620 に正常描画（`data-info-card` 存在、mode=single）。フルページ撮影ではタイルの下に来るため VL が見落とした可能性が高い |
| PresetStage: desktop の applied 状態が hover と見分けがつかない | 一部妥当だが仕様として許容。plain click は製品では即実行であり持続的な「applied」ビジュアルは存在しない。Web は実行を偽装せず `data-apply-note` で適用意図を正直に表示（`aria-live` 付き）。状態バッジ追加は改善余地として記録 |
| PresetStage: 選択タイルと info card プレビューの色不一致 / 複数選択時の対応不明 | 棄却。カード内 items は選択順（`selectedIds` 順）で、製品の Info Widget と同じ契約。各カードは対応プリセット自身のプレビューを描画しており、タイルの曲線色との一致は製品仕様にない要件。小サイズサムネイルの誤読の可能性が高い |
| Download/Docs/Support: mobile ヘッダーに Download CTA がない・ナビがハンバーガー内 | 今回の変更範囲外の既存サイトクローム。menu-open キャプチャ（`final-mobile-*-menu-open.png`）でナビ到達可能を確認済み。CTA 配置は別途改善検討事項 |
| Download/Docs/Support: desktop ヘッダーの Download がリンクとボタンで重複 | 意図的構成（グローバルナビ + primary CTA）。文言・役割が異なり誤操作リスクは低い。現状維持 |

### 既知の制限（成功扱いしない）

- **AE 実行結果のビジュアル証跡なし**: plain click の「実行後」状態は After Effects 実機でのみ発生し、自律キャプチャ経路（CEP/CDP）が確立できなかった（review-343 FINDINGS 参照）。Web デモは実行を偽装せず適用意図の note のみ表示する設計で、この制限は仕様として明示済み
- insider.4〜.7 はユーザー向け変更を持たない受入用ビルドであり、概要は「変更なし」を正直に伝える内容になる（メタデータ除去後も provenance の説明自体は残る）
- mobile のタイルサイズは 3 列で小さめ。12 タイル一覧性と info card 近接配置のトレードオフとして #342 で受容済み

## 残存リスク

- VL レビューは単一モデル・単一時点の静止画判定であり、全指摘を DOM/実装で照合済みだが、人間による最終目視は別途推奨
- Changelog の live GitHub 取得はネットワーク依存。取得失敗時は bundled snapshot へ fallback する実装（`apps/web/src/server/releases.ts`）
- `release-0-12-0 → main` 統合・本番公開は未実施（承認待ち）
