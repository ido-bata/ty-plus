# リリース候補の検証記録（v0.11.0 / Stable）

- Status: **条件付きリリース可能**（人間の最終視覚受入・公開承認待ち）
- 対象: PR #188（`release-0-11-0` → `main`）
- RC候補 SHA: `c7795084054db6e91bf69b1fe893c40e09169b4b`（`release-0-11-0` HEAD、PR #231 merge 後）
- 正本: `.agents/skills/release-channels/SKILL.md`、`docs/operations/release-runbook.md`、ADR-0003/0004、`docs/verification/e2e-acceptance/use-case-matrix.md`
- **この記録は公開の承認ではない**。`release-0-11-0 → main` merge・tag作成・GitHub Release作成は本人の明示承認まで実行しない。

## 1. RC候補SHAと証拠の対応

RC候補 `c7795084` について、実機E2E・Storybook capture の証拠SHAとの同一性を差分で証明する。

| 範囲 | 差分 | 判定 |
| --- | --- | --- |
| `05551c30`（実機E2E・capture実施SHA）→ `c7795084` | `src/` `rust/` `scripts/cep` `scripts/package` `scripts/build`: **差分ゼロ**。変更は `scripts/verify/e2e/cases/settings.ts`（検証ハーネス）、`scripts/verify/update-install-sandbox.ts`（新規検証）、`package.json`（script 1行追加、version 不変）、`docs/` のみ | 製品コード同一のため、`05551c30` 時点の実機証拠は `c7795084` に有効 |

したがって以下の実機証拠は対象SHA `c7795084` の製品コードに対するものとして扱う。

- AE 2027 実機E2E: `docs/verification/e2e-acceptance/results/2026-11-19-device-macos-ae2027-*/`（smoke/catalog/resilience/settings/journey/journeys/workspace/debug/host + UC個別）
- UC-J06 を含む full journeys suite: `results/2026-11-19-device-macos-ae2027-journeys-full2/run.json` — **PASS=6/FAIL=0/BLOCKED=0**（単独PASSではなく一括実行での安定性を確認済み）
- Storybook capture: `storybook-capture-report-05551c308c8581fe7b3c7ec87f6d040c6c063de1`（429/429 story ok）

## 2. 自動検証（CI）

| ゲート | 対象 | 結果 |
| --- | --- | --- |
| skills / static / unit / coverage / release gate | PR #231（`c7795084` を含む release HEAD） | PASS |
| storybook / capture-report / operation-worker macOS+Windows | `release-0-11-0` workflow_dispatch（RC freeze 経路） | `05551c30` で全 success。`c7795084` では製品コード同一のため同等（settings.ts のみ差分、影響は E2E ハーネス内に限定） |
| `verify:update-install:sandbox` | ローカル macOS arm64 | **6/6 PASS**（swap-success / integrity-mismatch / pending-swap / pending-retry-on-spawn / manual-required / url-rejected） |

## 3. 配布成果物（release-trust candidate）

### macOS（完了 — Developer ID署名 / 未公証、ADR-0003 Amendment 1）

`bun run release:candidate --channel=stable --release-version=0.11.0`（`c7795084`、2026-11-19 実施）

| 項目 | 実測値 |
| --- | --- |
| sourceCommit | `c7795084054db6e91bf69b1fe893c40e09169b4b` |
| trustMode | `release` |
| ZIP | `ty-plus-v0.11.0-macos.zip` / sha256 `cdb6377ed3644b3f113bad14a7d2317eaeafad52d31cfce7cb775d39f2a83097` / 14,002,347 bytes |
| ZXP | `ty-plus-v0.11.0-macos.zxp` / sha256 `30b3f8d74eaeb30ac3004f13f631c602b1bdfe36e7ae9a980e10dfb76e08f97b` / 14,019,832 bytes |
| 監査 | `verify-release-artifacts.ts`: manifest sourceCommit=HEAD 一致、全 artifact sha256 一致、archive 内容=pack 一致、ZXP署名独立検証、secret scan clean — **全項目 PASS** |

### Windows（CI `release-trust-windows-candidate`、run 44447806589）

`release.yml` workflow_dispatch @ `release-0-11-0`。artifact `ty-plus-release-candidate-0.11.0-windows-c7795084` の sha256 を取得次第、本書へ転記する。

## 4. Issue別 受入状況

| Issue | 状態 | 根拠・残件 |
| --- | --- | --- |
| #223 | **close済み** | 全 UC 根本原因確定・修正・実機検証（PR #224-#229）。J06 は full suite でも PASS |
| #108 | **実質完了** | 全 suite/UC の AE2027 macOS 実機証跡あり。Windows は 11-15 の旧 build で部分証跡（§5 参照） |
| #166 | **機械的検証完了・人間の審美判定待ち** | capture 429/429、interaction/layout play test PASS、視覚回帰方式の不採用理由を `storybook-visual-review-0-11-0.md` に記録。gallery 目視のみ残る |
| #135 | **検証強化済み・実運用経路は公開後確認** | sandbox E2E 6/6（実 worker binary + 実 published asset の HTTPS download + SHA-256 + staged swap + pending retry + manual_required + rollback）。**未検証**: 公開前は公式 URL に候補 asset が存在しないため、candidate asset での `update.install` 実走と実機権限モデルは公開後の初回 updater 実行で確認する |
| #71 | **緩和・計測・回帰テスト済み。AE2026 実機は環境ブロック** | PR #216。AE2026 は本ホストで process 生存・menu bar あり・**window 0** の状態を再現（2026-11-19、quit→relaunch・.aep open でも window 非生成、CEP `.debug` 不出現）。11-18 には AE2026 で smoke 6/6 PASS の実績があり環境依存の intermittent。ty-plus コードは panel surface 生成前に実行されないため製品起因ではない |
| #189 | **監査完了** | offline-core 残存参照 sweep（PR #221）+ portal click 系の残存なし確認 |

## 5. プラットフォーム別 検証状況

| 環境 | 状態 | 証拠 |
| --- | --- | --- |
| macOS arm64 / AE 2027 (27.0x78) | **検証済み** | smoke 6/6, widgets 1/1, catalog 1/1, resilience 5/5, settings 1/1, journey 3/3, journeys 6/6（full suite）, workspace, debug, host — `results/2026-11-18/19-device-macos-ae2027-*/` |
| macOS / AE 2026 (26.5.x) | **部分検証** | 11-18 `rc-0-11-0-smoke` 6/6 PASS（AE 26.5.3x9）。11-15/16 の dev suite 証跡あり。Settings suite・journeys の AE2026 実行は window 非生成の環境ブロック（§4 #71） |
| Windows 11 / AE 2027 | **部分検証（旧 build）** | 11-15 device-windows: smoke 6/6, settings PASS（retry 後）, resilience 5/5, widgets 1/1, debug 2/2, host 1/1, catalog 1/1。journeys/workspace suite 未実行。build は RC 修正（#222-#229）以前のため RC 相当の再実行が望ましい。現在 ae-mcp bridge (127.0.0.1:7777) 不通でホスト到達不可 |
| Windows worker binary | **CI 検証済み** | `operation-worker-windows` job が RC 経路で build+verify success（unsigned は R0 の正当な形、ADR-0003） |

公開サポート表記（README）: Windows x64 / macOS。AE バージョン別の正式サポート表は未確定であり、未検証組合せをサポート済みとは扱わない。

## 6. 未検証条件・非ブロッカー

**公開ブロッカー（人間作業）**:
1. Storybook gallery 429枚の審美的最終判定（`storybook-visual-review-0-11-0.md` tier A→B 順、機械的検査は完了済み）
2. `release-0-11-0 → main` merge・tag `v0.11.0`・GitHub Release 作成の明示承認

**公開後に確認する条件（公開を妨げないが記録必須）**:
- `update.install` の実運用経路: 公開 asset URL からの取得→ハッシュ検証→実 CEP 拡張フォルダでの swap→再起動適用。sandbox で同一ロジックは検証済みだが、実 URL・実権限・実 ZXP 署名 asset での初回実行は公開後の updater 実施が初回証拠となる
- Windows での journeys/workspace suite（Windows 実機が利用可能になった時点で `scripts/verify/e2e/run.ts` を実行）
- AE 2026 での Settings suite（window が生成される環境で `Uncaught [object Event]` 再発有無を確認）

**環境ブロック（再現手順記録済み）**:
- AE 2026 window 非生成: `open -a "Adobe After Effects 2026"` → process 生存・menu bar あり・AX window 0・`.aep` open でも window 非生成・CEP `.debug` 不出現。quit→relaunch でも再現。11-18 には成功実績あり → ホスト環境の intermittent 問題。ty-plus のコードパスには到達しない
- Windows 実機: ae-mcp bridge 不通。11-15 証跡は旧 build

## 7. 公開可否判定

**条件付きリリース可能**。公開ブロッカーは人間の審美受入と公開承認のみ。技術的に自律解決可能な残件なし。新規製品欠陥は RC 期間中に検出されず（#223 は全件収束済み）。

判定の前提: §3 の Windows candidate artifact が `c7795084` に対して生成・監査されること。未生成の場合は macOS のみの部分公開判断が必要（Windows 欠落の明示ルールは runbook 既定に従う）。

---
Generated with [Devin](https://devin.ai)
