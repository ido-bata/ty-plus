# PandaCSS Adoption and Tailwind CSS Retirement

**Date:** 2026-09-12
**Status:** Accepted
**Supersedes / revises:** [AGENTS.md §厳守事項](../decisions-context/../../AGENTS.md) "Tailwind CSS v4" 規定を PandaCSS に差し替える
**Superseded / revised by:** none yet
**Cross-references:** [AGENTS.md](../../AGENTS.md) / [docs/architecture/ui-reconstruction/storybook.md](../architecture/ui-reconstruction/storybook.md) / [docs/architecture/quality/verification.md](../architecture/quality/verification.md)

## Context

本リポジトリは After Effects CEP 拡張であり、UI は React 19 + TypeScript で組まれ、
スタイルは Tailwind CSS v4 (`@tailwindcss/vite ^4.3.3`) のユーティリティクラスで
当ててきた。`@theme` block で約 70 個の design token を `--ty-*` CSS 変数へ
bridge し、`mergePanelTheme` が `:root` に注入する二層構造を採っている。

この度、**Tailwind CSS を完全に廃止**し、**PandaCSS** へ移行する。動機は次の通り:

1. **トークンファーストの整合性。** 既存の design token システム
   (`src/management/style/literals/design-tokens-defaults.ts` +
   `src/management/style/theme.css`) は既に CSS 変数による意味的階層を持っている。
   Tailwind の `@theme` はそれを `var(--ty-*)` で参照する**間接層**でしかなく、
   `--ty-surface-panel` → `--color-surface-panel` → `bg-surface-panel` のように
   二重間接を強いられる。Panda の `defineTokens` は CSS 変数を直接参照でき、
   中間層を 1 段に減らせる。
2. **型安全なスタイル co-location。** Tailwind の class string は
   `cx(...)` で文字列連結する以外に合成手段がなく、typo・未定義クラス・
   variant 衝突が lint 時に検出されない。Panda の `css()` / `styled()` は
   戻り値が型付きクラス名 (string) であり、`tokens.colors.surface.panel` のような
   補完が効くため、レビュー時に差分として意味が残る。
3. **CEP/Storybook の二重 build 維持費の縮減。** Tailwind v4 は v3 と異なる
   scan-and-on-demand 方式で、`@source` パス指定が `app.css` に残っている。
   Panda は PostCSS プラグインとして Vite / Storybook の両方に同じ設定で
   注入でき、Storybook 側で別途 `@tailwindcss/vite` を strip するロジックを
   持たなくて済む (`.storybook/main.ts` の `CEP_PLUGIN_NAME_PATTERNS` 整理)。
4. **デモ段階での技術負債の先送り禁止。** AGENTS.md §厳守事項
   「後方互換シムを作らない」に従い、Tailwind の並行維持や段階移行のための
   compat shim は作らない。`@tailwindcss/vite` を `package.json` から削除し、
   Biome の `tailwindDirectives: true` を落とし、`@import "tailwindcss";` を
   `app.css` から消す。

## Decision

### 採用技術

- **PandaCSS v1.x** を採用する。ランタイムは PostCSS プラグイン
  (`@pandacss/postcss`) として Vite / Storybook の両 build に注入する。
- `panda codegen` で生成される `styled-system/` ディレクトリは git 管理外
  (`/styled-system` を `.gitignore` に追加) とし、CI と developer の両方で
  `bun install` 後に再生成される前提とする。
- 既存 design token (`--ty-*` CSS 変数) は**そのまま維持**する。Panda の
  `defineTokens` は `value: "var(--ty-surface-panel)"` のように CSS 変数を
  参照できるため、`mergePanelTheme` の実行時注入契約に変更はない。

### 厳守事項の差し替え

AGENTS.md §厳守事項 の現在文:

> CSS クラスを使わない。CSS ファイルは Tailwind CSS v4 のトークン管理専用であり、スタイルは Tailwind クラスのみで当てる。

を以下に置換する:

> CSS クラス直書き (`className="literal-class"`) を使わない。スタイルは
> PandaCSS の `css()` / `styled()` で当てる。CSS ファイルは PandaCSS の
> generated layer + ランタイムで変化する token 注入 (:root への CSS 変数
> 書き込み) のためにのみ使う。

`css()` 戻り値は **クラス名文字列** なので `className={css({ ... })}` /
`cx(css({ ... }), className)` の形は引き続き許容する。これは「CSS クラス
直書き」を禁じる条項と整合する (生成された class 名であって文字列リテラル
の class ではない)。

### 移行範囲

- **327 ファイル / 2918 箇所の `className=`** を Panda の `css()` ベースに置換する。
- `src/management/panel/styles/app.css` の `@import "tailwindcss";` を削除し、
  Panda generated CSS (`styled-system/styles.css`) を import に差し替える。
- `src/management/style/theme.css` は `@theme {}` block を持たなくなり
  (Panda がそれを管理する)、`@layer base {}` の scrollbar/html/body 設定
  のみ残す。
- `src/management/style/literals/tw-spacing-defaults.ts` は **削除**する。
  Panda の `defineTokens.spacing` が同じ値を持つ (`0`, `0.5`, ..., `200`)。

### 並行作業の分担

CLAUDE.md「8+ ファイルの PR は隔離ワークツリーへ委譲する」と
AGENTS.md §並行エージェント運用 に従い、移行は **worktree 単離 + 並列 worker**
で実施する。各 worker は自身の slice を mutation し、`bun run check`
(typecheck + test + boundaries) を slice 内で通してから branch を返す。

Slice 分割:

1. **Foundation** — `panda.config.ts`, `vite.config.ts`, `.storybook/main.ts`,
   `biome.json`, `package.json`, `app.css`, `theme.css`,
   `check-design-tokens.ts` 差替、AGENTS.md 更新、ADR の登録。
2. **shared/ + management/style/ + storybook/decorators/** — 基盤となる
   atomic primitive の Panda 化。他の slice はこの完了を待つ。
3. **function/widget/** — 最大の集中 (~70 ファイル)。
4. **function/{onboarding,preset,shared-except-component} + management/{online,notification,storage}**。
5. **management/{preset,setting,widget,debug}**。
6. **management/{workspace,panel,ae}**。

Phase 1 (Foundation) は直列、Phase 2 (shared/style) は Foundation 完了後、
Phase 3-5 (残り 3 slice) は Phase 2 と並列可能。

### 後方互換

作らない。AGENTS.md §厳守事項「後方互換シムを作らない」に従う。
Tailwind の class を残した状態での共存期間は **当日限り**。

## Consequences

### Positive

- トークン参照が一段減り、`mergePanelTheme` の出力 (`--ty-*`) と
  Panda `tokens.colors.surface.panel` が **同じ CSS 変数を指す**。
- `bun run ci` の lint 段で `check-design-tokens.ts` が hex/rgb literal を
  検出する責務は維持しつつ、`panda codegen --check` (or
  `tsc --noEmit` on `styled-system/`) で token 不整合を追加検出できる。
- Storybook 側で `@tailwindcss/vite` を strip するロジック (`.storybook/main.ts:50-65`)
  が単純化される。`CEP_PLUGIN_NAME_PATTERNS` から `"tailwindcss"` 風の
  substring を落とすだけ。
- `css()` 戻り値が string なので、`useMemo` した className や
  `cx(...)` の合成は引き続き可能。React 19 の `<style jsx>` 等の追加依存は
  増えない。

### Negative / Risks

- **`panda codegen` を CI と developer の両方で動かす契約が必要。**
  styled-system/ が git 管理外になると、clone 直後の `bun install` で
  `styled-system/` が空のまま typecheck が落ちる。`prepare` script を
  `package.json` に追加して `bun install` 時に `panda codegen` を
  走らせる (`postinstall` ではなく `prepare` — Bun 1.3 は `prepare` を
  honor する)。
- **bundle-size の検証。** Tailwind v4 の scan-and-on-demand は使った
  utility だけ emit する。Panda は utility-first だが unused recipe が
  出ると size が増える可能性がある。`bun run check:bundle-size`
  (3500000 bytes 上限) が gate として機能する。
- **AGENTS.md 厳守事項の差替で Storybook Wave 4 進行中のレビュー基準が
  揺れる。** Wave 3 (catalog/notification/onboarding) と Wave 4 (残存
  component sweep) のレビュー観点を「Tailwind クラス禁止」から
  「Tailwind className リテラル禁止 (css() 戻り値 class は OK)」に
  読み替える。docs/architecture/ui-reconstruction/storybook.md を
  同時更新する。
- **`src/management/style/theme.css` 削除時の regression。** `@theme {}`
  block が消えても Tailwind v4 依存の utility は全部消えるため互換性は
  保たれる。ただし `app.css` の scrollbar / html/body 定義は維持する。

### Operational

- Phase 1 worker は **直列**で Foundation を commit する。
- Phase 2 以降の worker は `isolation: "worktree"` で worktree 単離し、
  slice 内の mutation 完了後に branch 名 + digest を返す。
- 各 Phase の成果は immutable commit で受け取り、parent の working tree
  には直接 merge しない (AGENTS.md §並行エージェント運用)。
- Tailwind 依存の最終削除 (`package.json` の `@tailwindcss/vite`,
  `bun.lock` からの除去) は **Phase 6 (Tailwind 廃止 + ci 検証)** で
  集約する。

## Rollback

本 ADR が誤りだった場合の戻し:

1. `panda.config.ts` を revert。
2. `package.json` から `@pandacss/*` を除き `@tailwindcss/vite` を復元。
3. `biome.json` の `tailwindDirectives: true` を復活。
4. `app.css` の `@import "tailwindcss";` を復元。
5. AGENTS.md §厳守事項を Tailwind v4 文言に戻す。
6. `bun install --frozen-lockfile && bun run ci` で全 gate を通す。

ただし AGENTS.md §厳守事項「後方互換シムを作らない」により、移行途中で
Tailwind と Panda の **共存期間中のシムは作らない** ため、rollback は
ADR 自体を棄却する場合のみ実行可能。
