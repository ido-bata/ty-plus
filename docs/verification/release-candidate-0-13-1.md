# Release candidate 記録: v0.13.1 (stable)

Issue #591（PR #430 merge による UI/UX ロールバック）の収束作業における release candidate 記録。

## 対象

- Branch: `release-0-13-1` @ `ca4f97a8`（Merge pull request #625）
- Release PR: #605（`release-0-13-1 → main`、merge は owner 承認待ち）
- Version: `0.13.1`（PR #622 で `package.json` bump、#621）

## 含まれる修正（release-0-13-0 以降）

| PR | Issue | 内容 |
| --- | --- | --- |
| #598–#604 | #592–#597 | ロールバック復元本体（layout assertion API 復元、preset no-selection の locale 非依存化、doc rot 整理、stub story 実コンポーネント化 + `check:story-subject`/`check:story-only` 新設、回帰 assertion 追加、`check:merge-stale` 新設 + storybook CI 配線） |
| #611 | #591 | UI surface ledger 正本化 + 監査サマリ |
| #612 | — | multiselect e2e flaky timeout 解消 |
| #613 | #607 | #594 cleanup 残存の stale 参照整理 |
| #614 | #606 | knip が story-only export を dead code 誤検出する問題の修正 |
| #615 | #608 | merge-stale detector の意味的ロス検出 + 双方向 wholesale check 拡張 |
| #616 | #610 | widget picker / settings sections / panel chrome の story 追加 |
| #617 | #610 | preset/modeless whole-dialog stories 23件追加 |
| #619 | #618 | worker 並列実行の worktree 分離を `worker:assert` で機械的に保証 |
| #622 | #621 | v0.13.1 version bump（RC artifact 構築の前提） |
| #624 | #623 | E2E smoke UC-B04 の grid cellSize 既定値 fallback |
| #625 | #620 | storybook layout audit の scrollport 誤検出修正（false positive、production 不具合なし） |

## 検証証跡

### CI（release-0-13-1 head `ca4f97a8`）

- `CI` workflow: success（static / unit / coverage / skills / merge-stale / release gate / storybook 4-shard + capture-report すべて pass）
- 既知の非関連失敗: `Workers Builds: ty-plus`（Cloudflare）は main でも失敗する既存チェック

### 包括 E2E（AE2027 実機、dev bundle = release-trust build と同一ソース）

- 実行: 2026-11-25、`docs/verification/e2e-acceptance/results/2026-11-25-device-macos-ae2027-dev-rc/<suite>/run.json`
- dev bundle: `bun run build:cep:dev` on `225dd5e8`（#625 は storybook/quality のみで product code 同一）
- 結果: **PASS=16 / FAIL=10 / BLOCKED=8 / SKIP=1**（35 cases、10 suites）
- 前回（2026-11-24、release-0-13-0 @ `8f8ab650`）: PASS=16 / FAIL=8 / BLOCKED=6
- FAIL/BLOCKED の切り分けは Issue #626 へ集約。第一仮説は E2E selector の locale 非依存性欠如（catalog/dialog 系）と debug console replay の要再現確認であり、本 RC の変更による新規回帰の証拠はない。UC-B04 は #624 で修正済み（PASS 確認）。

### 配布物（macOS）

- `TY_PLUS_SIGN_IDENTITY="Developer ID Application: Yusuke Kimura (JK49RJ2CK2)"` + `TY_PLUS_ZXP_CERT_*`（`~/Library/Application Support/ty-plus-signing/ty-plus-release.p12`、password は keychain `ty-plus.zxp.signing`）+ `ZXP_SIGN_CMD=.tmp/zxp/ZXPSignCmd`（同梱 macOS binary）で実行
- `bun run release:candidate --channel=stable --release-version=0.13.1`
- 結果:
  - operation-worker: Developer ID 署名、`valid on disk` / `satisfies its Designated Requirement`（未公証、ADR-0003 Amendment 1 の範囲）
  - `dist/app.ty-plus.zip` + `dist/app.ty-plus.zxp` 生成、`ZXPSignCmd -verify` → `Signature verified successfully`
  - `[verify-release-artifacts] OK: 0.13.1 (stable), sourceCommit=ca4f97a857953eb2186f74b53f9c88477759c905, 2 artifact(s) hash-verified, secret scan clean`
  - `dist/github-release/ty-plus-v0.13.1-macos.{zip,zxp}` + release-manifest.json を staging（tag/release/upload は未実施 — owner 承認が必要）
- **Windows artifact は未構築**（macOS host のみ。v0.13.0 は Windows クロスコンパイル実績あり。公開判断前に Windows 側の構築・検証が必要）

### 視覚レビュー（Storybook capture 468枚）

- capture: `.tmp/vitest-screenshots/`（vitest browser project、1280×720、storybook CI と同一 harness）
- レビュー: codex vision による全件トリアージ + 問題件の単発再レビュー
- 結果サマリは最終報告および `docs/verification/ui-surface-ledger-0-13-1.md` を参照
- 検出→解消済み: whole-dialog stories の blank capture は旧 capture の stale artifact と判明（release head で再 capture すると実描画を確認、#625 の layout 修正後も production 描画は正常）
- `preset-workspace-canvaseasingicon` の curve コントラスト MINOR 指摘、`fontviewer-statusline--empty` の低コントラスト MINOR 指摘を記録（後述の残存事項）

### merge-stale detector 実効性

- PR #615 で双方向 wholesale check + semantic identifier-loss check（>50% missing AND ≥3）へ拡張
- 実績: merge `bdd1168b` の `service.ts` wholesale take を検出、334ファイル union で false positive 0
- 適用: `check:merge-stale` CI job が全 PR / release push で実行

### Worker 分離保証

- `scripts/worktree/assert-worker-env.ts`（`bun run worker:assert`）が linked worktree / `.worktree.env` / ticket branch を機械検証
- `.agents/skills/worktree-workflow/SKILL.md` と `AGENTS.md` に契約を明文化（PR #619）

## 残存事項

1. **E2E residual（Issue #626）**: journey/journeys/workspace の dialog・preset 実行系 FAIL/BLOCKED、debug console replay FAIL の切り分け未完。release-0-13-0 でも同傾向のため本 RC 固有の回帰ではない可能性が高いが、製品不具合の可能性を排除できていない。
2. **Windows artifact 未構築**: 公開には Windows 側 release:candidate 実行が必要。
3. **視覚レビュー MINOR 残件**: easing icon curve / fontviewer statusline のコントラスト指摘（機能美観点、ブロッカーではないが記録）。
4. **#609/#610 残件**: dead UI 棚卸し・story 未カバー領域は tracking issue として継続。
5. **`Workers Builds: ty-plus`**: main からの既存 CI 失敗（無関係だが release 品質ゲートのノイズ）。
6. **#581/#582/#583/#587**: 修正 merge 済みだが Issue open のまま（release 確定後に close 整理）。

## リリース判断に必要な owner アクション

- PR #605（release-0-13-1 → main）の merge 承認
- Windows artifact の構築・検証（または Windows 対象外の明示判断）
- #626 の残存 E2E FAIL が release blocker かどうかの判断（harness 要因なら別 issue で継続可能）
