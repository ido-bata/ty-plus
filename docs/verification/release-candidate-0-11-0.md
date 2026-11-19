# リリース候補の検証記録（v0.11.0 / Stable）

- Status: **条件付きリリース可能**（人間の最終視覚受入・公開承認待ち）
- 対象: PR #188（`release-0-11-0` → `main`）
- RC候補 SHA: `bbbe77cc4f3dab367d19256fdbc2fe2a8f1551d6`（`release-0-11-0` HEAD、PR #234 merge 後）
- 正本: `.agents/skills/release-channels/SKILL.md`、`docs/operations/release-runbook.md`、ADR-0003/0004、`docs/verification/e2e-acceptance/use-case-matrix.md`
- **この記録は公開の承認ではない**。`release-0-11-0 → main` merge・tag作成・GitHub Release作成は本人の明示承認まで実行しない。

## 1. RC候補SHAと証拠の対応

RC候補 `bbbe77cc` について、実機E2E・Storybook capture の証拠SHAとの同一性を差分で証明する。

| 範囲 | 差分 | 判定 |
| --- | --- | --- |
| `05551c30`（実機E2E・capture実施SHA）→ `bbbe77cc` | `src/` `rust/` `scripts/cep` `scripts/build`: **差分ゼロ**。変更は検証スクリプト（`scripts/verify/*`）、release署名ツール（`scripts/package/sign-zxp.ts` — ZXP timestamp 方針のみ、payload 非含有）、`package.json`（script 1行追加、version 不変）、`docs/` のみ | 製品コード同一のため、`05551c30` 時点の実機証拠は `bbbe77cc` に有効 |

したがって以下の実機証拠は対象SHA `bbbe77cc` の製品コードに対するものとして扱う。

- AE 2027 実機E2E: `docs/verification/e2e-acceptance/results/2026-11-19-device-macos-ae2027-*/`（smoke/catalog/resilience/settings/journey/journeys/workspace/debug/host + UC個別）
- UC-J06 を含む full journeys suite: `results/2026-11-19-device-macos-ae2027-journeys-full2/run.json` — **PASS=6/FAIL=0/BLOCKED=0**（単独PASSではなく一括実行での安定性を確認済み）
- Storybook capture: `storybook-capture-report-05551c308c8581fe7b3c7ec87f6d040c6c063de1`（429/429 story ok。SHA 対応は `storybook-visual-review-0-11-0.md` 冒頭参照）

## 2. 自動検証（CI）

| ゲート | 対象 | 結果 |
| --- | --- | --- |
| skills / static / unit / coverage / release gate | PR #231/#232/#234（`bbbe77cc` を含む release HEAD） | PASS |
| storybook / capture-report / operation-worker macOS+Windows | `release-0-11-0` workflow_dispatch（RC freeze 経路） | `05551c30` で全 success。`bbbe77cc` では製品コード同一のため同等（settings.ts のみ差分、影響は E2E ハーネス内に限定） |
| `verify:update-install:sandbox` | ローカル macOS arm64 | **6/6 PASS**（swap-success / integrity-mismatch / pending-swap / pending-retry-on-spawn / manual-required / url-rejected） |

## 3. 配布成果物（release-trust candidate）

**ZXP タイムスタンプについて**: Apple TSA endpoint が無効化され、ZXPSignCmd 4.1.3 が検証できる TSA が存在しないため、本候補の ZXP は RFC3161 timestamp 無しで署名されている（#233）。`ZXPSignCmd -verify` で `Signature verified successfully` を確認済み。署名の有効性は署名証明書の有効期間（2036-11-09 まで）が担う。v0.10.x までの ZXP には timestamp が付いていた点が相違点。

### macOS（完了 — Developer ID署名 / 未公証、ADR-0003 Amendment 1）

`bun run release:candidate --channel=stable --release-version=0.11.0`（`bbbe77cc`、2026-11-19 実施。ZXP は TSA 無し署名 — §3 参照）

| 項目 | 実測値 |
| --- | --- |
| sourceCommit | `bbbe77cc4f3dab367d19256fdbc2fe2a8f1551d6` |
| trustMode | `release` |
| ZIP | `ty-plus-v0.11.0-macos.zip` / sha256 `21ad46c2180cae7a094e30edef481b5bc0a230f46cd5f2424e9a9e11940bb37c` / 14,002,352 bytes |
| ZXP | `ty-plus-v0.11.0-macos.zxp` / sha256 `6753c5d974c2d480e9d86fe95c4c765afb8c7276abb51cdeed86a3520015f761` / 14,016,089 bytes |
| 監査 | `verify-release-artifacts.ts`: manifest sourceCommit=HEAD 一致、全 artifact sha256 一致、archive 内容=pack 一致、ZXP署名独立検証、secret scan clean — **全項目 PASS** |

### Windows（完了 — cargo xwin クロスコンパイル、未署名worker + 署名済みZXP、ADR-0003）

v0.10.2 と同じ手順で macOS ホストからビルド（2026-11-19 実施）:

```sh
CROSS_COMPILE_CARGO="cargo +1.89.0 xwin" TY_PLUS_BUILD_PLATFORM=windows \
TY_PLUS_RELEASE_VERSION=0.11.0 TY_PLUS_RELEASE_CHANNEL=stable \
TY_PLUS_ZXP_CERT_PATH="$HOME/Library/Application Support/ty-plus-signing/ty-plus-release.p12" \
TY_PLUS_ZXP_CERT_PASSWORD="$(security find-generic-password -s 'ty-plus.zxp.signing' -w)" \
ZXP_SIGN_CMD="$PWD/.tmp/zxp/ZXPSignCmd" \
bun run release:candidate --channel=stable --release-version=0.11.0
```

| 項目 | 実測値 |
| --- | --- |
| sourceCommit | `bbbe77cc4f3dab367d19256fdbc2fe2a8f1551d6` |
| trustMode | `release` |
| ZIP | `ty-plus-v0.11.0-windows.zip` / sha256 `3f77e5c060b51a324886ba1a7cb6a1dc327138064e8770796fd2eb69925d4e21` / 10,958,639 bytes |
| ZXP | `ty-plus-v0.11.0-windows.zxp` / sha256 `1fc7a11b7feec1bf732140aa12097693fb80287ea12e54f6ed2289410a7eb57e` / 10,972,758 bytes |
| worker | `windows/operation-worker.exe`（7,601,152 bytes、sha256 `2e7881dd6a701c7512c3e2feaa677f383fafc55a5cfbda2628f7649413f6feef`、Authenticode 未署名 = R0 の正当な形） |
| 監査 | `verify-release-artifacts.ts` 全項目 PASS（sourceCommit=HEAD、sha256、archive=pack、ZXP署名、secret scan） |

CI `release.yml` `release-trust-windows-candidate`（run 44449771825、@ `bbbe77cc`）も **success**。TSA 無し既定化（#233/#234）で exit 35 は解消。CI artifact `ty-plus-release-candidate-windows-bbbe77cc…` の manifest も sourceCommit=`bbbe77cc`・trustMode=`release` を確認（zip/zxp の sha256 はローカル xwin build と異なるが、CI job 内の `verify-release-artifacts` 監査は PASS。内容同一性は sourceCommit と監査で担保）。

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

判定の前提: §3 の Windows candidate artifact は `bbbe77cc` に対して生成・監査済み（ローカル cargo xwin、v0.10.2 と同一手順）。CI `release-trust-windows-candidate` の独立再現も success（run 44449771825）。

---
Generated with [Devin](https://devin.ai)

## 追記（2026-11-19 第2回）: RC候補の再確定 — `fab3e9aa`

Insider 実機受入で製品欠陥 #245（install relay の surface ID 不一致による envelope drop）を発見・修正（PR #246）したため、RC候補を再確定した。

### 候補SHAと証拠の対応（再）

- **新 RC候補 SHA: `fab3e9aabcf925d881aa283674a84c94e25f9107`**（`release-0-11-0` HEAD、PR #246 merge 後）
- `bbbe77cc` → `fab3e9aa` の製品コード差分: `src/management/online/update/install-relay.ts`（+test）のみ。updater relay 経路に限定され、他機能のコードは同一
- それ以前の実機E2E証拠（`05551c30`/`bbbe77cc`）は変更のないコードパスに対して有効。updater 経路は `fab3e9aa` で**実機 UI E2E PASS**（insider.8→.9、`insider-ui-update-0-11-0.md`）

### Stable 配布物の再生成（`fab3e9aa`、release-trust、監査全項目 PASS）

`bun run release:candidate --channel=stable --release-version=0.11.0`（macOS実機 + Windows xwin、2026-11-19 実施。旧 `bbbe77cc` の署名・ハッシュは流用していない）

| platform | asset | sha256 | bytes |
| --- | --- | --- | --- |
| macOS | `ty-plus-v0.11.0-macos.zip` | `41b96618f1b067cb5f8989f8002023f032831f49a7d0b46ccaff9360f08af1e4` | 14,007,869 |
| macOS | `ty-plus-v0.11.0-macos.zxp` | `0fd042e1e59c5a24763f838080b4c1a0566378f8f852674f9b7ed531b2b1c8f6` | 14,021,897 |
| Windows | `ty-plus-v0.11.0-windows.zip` | `55a2a3e0b1850cb2c6b4886f3fc5ce72c4bd9397fb2a4adc4791402a50434244` | 10,964,018 |
| Windows | `ty-plus-v0.11.0-windows.zxp` | `084c8f3232a20315afe326f2ac65dda7603eb1b106a3348d0526e0243332303f` | 10,978,155 |

両 manifest: `releaseVersion=0.11.0` / `channel=stable` / `sourceCommit=fab3e9aa…` / `trustMode=release`。ローカル staging: `dist/staging-stable-rc/{macos,windows}/`。

### Insider 公開実績（本候補と同一 sourceCommit）

- `v0.11.0-insider.8` / `v0.11.0-insider.9`: prerelease・non-latest・6 asset・digest 全一致（`insider-ui-update-0-11-0.md`）
- insider.8→.9 の UI 経由 updater E2E **PASS**（検出→install→swap→再起動→新版表示→データ保持）

### 判定（更新）

**条件付きリリース可能**（変更なし）。#135 の UI updater 受入が実機で完了した点が前回からの前進。残る人間受入: #166 視覚判定、PR #188 merge/tag/公開の明示承認。未検証環境: Windows 実機・AE 2026。
