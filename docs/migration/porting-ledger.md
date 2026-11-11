# 移植台帳（porting ledger）

旧 `rebuildup/ty-plus` から本repoへ移植する実装の正本台帳。判断の正本は `rebuildup/ty-plus#228`（移植元選定）と `rebuildup/ty-plus#230`（移行の暫定正本）。本repo側の進行は #3 が担う。

## 規則

- Log!N側はプロダクト実装の権利を保有しない（2026-11-11本人確認、#2）。Log!N許諾を理由とする移植停止は行わない。
- 第三者由来のコード・素材（vendored資産、Hyper Brew表記等）は個別のライセンス条件を確認し、表示を維持する（`docs/decisions/rights-inventory.md`）。
- Log!N由来の識別子・署名設定・運営infraは置換／不採用する。旧コミットをcherry-pickで履歴移植しない。監査済みのコード変更を本repoの新規commitとして再適用し、対応する旧SHAを本台帳に記録する。
- 採否・再検証状態が確定した行のみ、状態を更新する。未確認をPASSにしない。

## 旧ブランチ基準

| 旧ref | SHA | 状態 |
| --- | --- | --- |
| `main` | `a633e246156c` | v0.9.1。CIは2026-09以降failureが継続 |
| `release-0-10-0` | `05c921d1fb9a` | mainより161コミット先行（mainはstrict ancestor）。最終commit 2026-10-03 21:10 +0900、直後のCI実行（2026-10-03 12:21 UTC）がsuccess |

### 基準SHAの比較（2026-11-11再検証）

- `release-0-10-0` の161コミットには旧#131 blocker（#127 PandaCSSレイアウト / #128 online fixture fallback / #129 Debug Console集約 / #130 preset実行: CLOSED）の修正commitを含む。#127〜#129は修正済みだが実機検証が未完了のためIssueはOPEN。
- `main` はこれらの修正を含まず、CIも赤。**移植基準は `release-0-10-0`（`05c921d1fb9a`）を推奨**（本人判断事項）。

## OPEN PR棚卸し（2026-11-11時点）

採否の技術評価は #3 が確定させる。コードの権利は本人確認済み（Log!N非保有）。移植時の置換・回帰条件を「再検証」列に記録する。stacked関係は `#203 → #211` のみ。

| 旧PR | base | 責務 | R0評価 | 権利状態 | 採否 | 移植元SHA | 再検証 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #165 | main | release: v0.10.0（release PR） | 対象外 | - | **移植しない** | - | - |
| #217 | release-0-10-0 | fix(storage): 絶対パスの先頭スラッシュ保持（#216） | **R0必須**（macOSでsettings/ui.jsonが書けない） | 本人確認済み | **移植済み**（#18 → PR #23） | `cebaf225b3` | write gate統合込み。unit suite緑 |
| #213 | release-0-10-0 | fix(runtime): modeless dialog起動経路でcloud gateway boot（#171） | 延期候補（cloud依存） | 本人確認済み | **延期確定**（2026-11-11技術評価）。#187/#178採用によりlocal機能のcloud依存は除去済みで、症状の可直接修正は不要。オンラインプリセット配信（cloud gateway + Supabase）の方針確定時に再評価する | `eec2dcce83` | - |
| #212 | release-0-10-0 | chore(skills): project-init Skills復旧 | **移植不要**（本repoはADR-0002で独立に初期化済み） | - | 廃止 | `d8b72822e4` | - |
| #211 | 182 | fix(workspace): 読み込み失敗を空レイアウトに変換せず復元まで書込停止（#204） | **R0必須**（データ消失） | 本人確認済み | **移植済み**（#18 → PR #23。#205と手動統合） | `ad00b42bf1` | write gate + 行動テスト移植。unit suite緑 |
| #208 | release-0-10-0 | fix(dev): macOSのAE検出・起動 | 延期候補（dev tooling） | 本人確認済み | **採用**（2026-11-11技術評価）。`bun run host` / `bun run live` がmacOSで常に起動失敗する欠陥。11/29実機ゲート（macOS）の準備とAI側検証導線に直結するため採用 | `d2852b1ad0` | - |
| #207 | release-0-10-0 | fix(ci): ゲートが要求するoperation-worker成果物をゲート自身がbuild（#191） | **R0必須**（fresh checkout CI） | 本人確認済み | **移植済み**（#17 → PR #22。CI組み込みは#19） | `b7534a3be3` | ローカルでoperation-worker成果物build確認済み |
| #206 | release-0-10-0 | fix(preset): boot経路catalogをraw text読み+strict parse | 延期候補（#187/#213のboot経路に依存） | 本人確認済み | **採用**（2026-11-11技術評価）。壊れた`presets/presets.json`を「空」と黙視する2層のempty-success。データ消失系（#203/#205/#211）と同類の欠陥。#187とはファイル面で独立し、#213に依存しないため単独適用可能 | `ca5e61010d` | - |
| #205 | release-0-10-0 | fix(workspace): 読めないwidgets.jsonを空に潰さない（#183） | **R0必須**（データ消失） | 本人確認済み | **移植済み**（#18 → PR #23。#211と手動統合） | `0439366e25` | surface-write fault-injection込み。unit suite緑 |
| #203 | release-0-10-0 | fix(workspace): 読めないtarget layoutを上書きしない（#182、データ消失阻止） | **R0必須**（データ消失） | 本人確認済み | **移植済み**（#18 → PR #23） | `673c7c1c90` | #211のbase。unit suite緑 |
| #202 | release-0-10-0 | fix(runtime): host callerをWindow単位で共有しwidget effect無限ループ停止 | 採用候補（停止バグ） | 本人確認済み | **採用・R0必須**（2026-11-11技術評価）。easing widgetでrender無限ループ→ExtendScript modal `alert()` storm。実機でパネル操作不能になるレベルの欠陥 | `f002f84dd3` | - |
| #201 | release-0-10-0 | test(worker): fixture rootをtest thread単位に分離 | R0有効（test安定性） | 本人確認済み | **移植済み**（#17 → PR #22） | `ef24531e36` | unit suite緑 |
| #199 | release-0-10-0 | test(worker): lease test manifest fixtureが全platformを宣言 | R0有効（test安定性） | 本人確認済み | **移植済み**（#17 → PR #22） | `41f5146596` | unit suite緑 |
| #198 | release-0-10-0 | fix(rust): macOSでcheck:rustが通るようにworkspace整理 | R0有効（macOS CI） | 本人確認済み | **移植済み**（#17 → PR #22） | `5d8fd8081f` | check:rust緑（1.85.0 pin） |
| #196 | release-0-10-0 | fix(cep): getCepHostSupportRootPathのplatform注入可能化 | R0有効（test可搬性） | 本人確認済み | **移植済み**（#17 → PR #22） | `a1fc2a63d8` | host依存テスト解消。unit suite緑 |
| #187 | release-0-10-0 | fix(preset): local catalog読み込みをcloud gateway bootから分離 | 採用候補（offline coreと整合） | 本人確認済み | **採用・R0必須**（2026-11-11技術評価）。`Preset List`がcloud gateway未bootで利用不能。local行をgateway非依存の`local-catalog.ts`へ分離し、offline core契約（`docs/architecture/offline-core.md`）と整合 | `e7a961f376` | - |
| #186 | release-0-10-0 | fix(debug): Debug Consoleのカバレッジと上限の反証可能性 | 延期候補 | 本人確認済み | **延期確定**（2026-11-11技術評価）。開発時診断の改善でありR0のユーザー可視機能に影響しない。R0後の診断改善タスク | `1fac098cf1` | - |
| #178 | release-0-10-0 | fix(workspace): post-onboarding widget placement復旧 | 採用候補（主要操作） | 本人確認済み | **採用・R0必須**（2026-11-11技術評価）。Add Widgetがcloud未bootの実機通常状態で無言failし配置されない。旧repoで実機再検証済み（`0b2f1d92`） | `7b40c1ed34` | - |
| #177 | release-0-10-0 | fix(settings): right content paneのcanonical inner gutter | 延期候補（UI polish） | 本人確認済み | **延期確定**（2026-11-11技術評価）。視覚調整であり機能欠陥ではない。R0後のUI polishタスク | `6cda4bc9ca` | - |
| #176 | release-0-10-0 | fix(ci): SKIP検証の所有者定義とrelease gate partition（#172〜#175） | R0有効（#6/#10のgate基盤） | 本人確認済み | **部分移植**（2026-11-11技術評価）。#172（binary path）は#6/PR #27で修正済み、#173はwire名改名（`lookup-or-generate`）で別解、#175は新CI（#19）のplatform-native job設計で代替済み。**#174（storybook screenshotのPOSIX path手実装）の欠陥は本repoに残置** — `scripts/verify/screenshot-path.ts` のみ移植する | `06d76f2bad` | - |

## 移植DAGと実行順序

```text
release-0-10-0 (05c921d1) を基準ツリーとして監査・移植
│
├─ #17 基準ツリーの移植 ✅（PR #22 / `b1a6174e`）
│    除外: archive/ docs/no-use/ .obsidian/ supabase/ 旧.claude/skills/
│          .github/(旧CI) .infisical.json LICENSE docs/user-guide/installation/
│          HAP-log.txt等の作業残骸
│    置換: app.ty-plus → app.ty-plus（暫定・本人承認待ち）
│          com.typlus → com.typlus（暫定）
│    含む: 旧#196/#198/#199/#201（test安定化）
│
├─ #18 データ消失修正の移植 ✅（PR #23 / `0d040761`。#205と#211は旧repoで未統合の並行stackedだったため手動統合）
│
├─ #5 ライセンスゲート切断 ✅（PR #24 / `d14555d6`。licensing crate・tier・Log!N secret schemaを除去、offline-core契約を文書化）
│
├─ #19 CIゲート整備 ✅（PR #26 / `a39b29ff`。初回実行がPR上で全緑）
├─ #6 内部検証ビルド ✅（PR #27 / `ec501a00`。release-trust部分は #32 へ分離・証明書確定待ち）
├─ #7 / #8 更新・通知フィード ✅（PR #29。フィード配信先の最終URLは #11 文書のとおり本人判断）
├─ #9 導入/更新/不具合報告ガイド（未着手）
├─ #10 実機ゲート（シナリオ確定済み PR #28。実施は11/29枠・本人）
└─ #32 release-trust配布ビルド（証明書確定後）
```

移植は基準ツリーの監査済みファイル + 選定PRの変更を新規commitとして再適用する。旧コミットの履歴は持ち込まない。Extension ID・署名主体の最終値は本人判断（公開ブロッカー）であり、暫定値 `app.ty-plus` で移植・検証を進める。

## 移植中に発見・修正した事項

- **wire名がvalidation契約に違反（旧repoに存在した実欠陥）**: canonical method `host.thumbnail.lookup_or_generate` はセグメントに `_` を含み `validate_qualified_name` に拒否されるため、wire経由で呼び出せなかった。旧CIはLinuxのHOST_INDEPENDENT subsetでoperation-workerのtestを除外していたため未検出。`host.thumbnail.lookup-or-generate` へ改名し、schema / TS生成のidentifier派生に `-` → `_` を追加（#17 → PR #22）。
- **rust toolchain pinの所在**: `rust/rust-toolchain.toml` をrepo rootへ移動。miseのidiomatic version file検出がroot基準のため、`rust/` 配下では `RUSTUP_TOOLCHAIN` がpinを上書きしていた（#17 → PR #22）。
- **旧#205（branch 183）と旧#203→#211（branch 182）は旧repoで未統合の並行stacked**: storage読取契約・write pathで重複し、手動統合が必要だった（#18 → PR #23）。#211が廃止したreadiness flagは#217側の参照も含め除去。

## 検証ゲート

- 各移植変更は新repoのCI（vitest等の移植後test基盤）で再検証する。データ消失修正（#203/#205/#211/#217）は行動テスト込みで移植する。
- #10（実機ゲート）が評価するSHAは、本台帳の確定後の新repo commitに限定する。

## 権利監査との接続

各資産の権利判断は旧 `rebuildup/ty-plus#219`（および本repoの対応Issue）の決定表を正本とする。本台帳の「権利状態」はその決定表の状態を参照して更新する。

## 更新手順

1. 移植元選定Issueが採否と依存順序を確定する。
2. 権利監査Issueが権利状態を確定する。
3. 移植PRが本repoの新規commitとして実装し、本台帳の行に移植元SHA・再検証結果を記録してcloseする。
