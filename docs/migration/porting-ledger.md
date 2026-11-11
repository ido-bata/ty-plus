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
| #217 | release-0-10-0 | fix(storage): 絶対パスの先頭スラッシュ保持（#216） | **R0必須候補**（macOSでsettings/ui.jsonが書けない） | 本人確認済み | 移植（#18） | `cebaf225b3` | 回帰テスト付き |
| #213 | release-0-10-0 | fix(runtime): modeless dialog起動経路でcloud gateway boot（#171） | 延期候補（cloud依存） | 本人確認済み | 未確定 | `eec2dcce83` | - |
| #212 | release-0-10-0 | chore(skills): project-init Skills復旧 | **移植不要**（本repoはADR-0002で独立に初期化済み） | - | 廃止 | `d8b72822e4` | - |
| #211 | 182 | fix(workspace): 読み込み失敗を空レイアウトに変換せず復元まで書込停止（#204） | **R0必須候補**（データ消失） | 本人確認済み | 移植（#18、#17（旧#203）に依存） | `ad00b42bf1` | 行動テスト付き |
| #208 | release-0-10-0 | fix(dev): macOSのAE検出・起動 | 延期候補（dev tooling） | 本人確認済み | 未確定 | `d2852b1ad0` | - |
| #207 | release-0-10-0 | fix(ci): ゲートが要求するoperation-worker成果物をゲート自身がbuild（#191） | **R0必須候補**（fresh checkout CI） | 本人確認済み | 移植（#19） | `b7534a3be3` | 新repo CIで再現確認 |
| #206 | release-0-10-0 | fix(preset): boot経路catalogをraw text読み+strict parse | 延期候補（#187/#213のboot経路に依存） | 本人確認済み | 未確定 | `ca5e61010d` | - |
| #205 | release-0-10-0 | fix(workspace): 読めないwidgets.jsonを空に潰さない（#183） | **R0必須候補**（データ消失） | 本人確認済み | 移植（#18） | `0439366e25` | 行動テスト付き |
| #203 | release-0-10-0 | fix(workspace): 読めないtarget layoutを上書きしない（#182、データ消失阻止） | **R0必須候補**（データ消失） | 本人確認済み | 移植（#18） | `673c7c1c90` | #211のbase |
| #202 | release-0-10-0 | fix(runtime): host callerをWindow単位で共有しwidget effect無限ループ停止 | 採用候補（停止バグ） | 本人確認済み | 未確定 | `f002f84dd3` | - |
| #201 | release-0-10-0 | test(worker): fixture rootをtest thread単位に分離 | R0有効（test安定性） | 本人確認済み | 基準ツリー移植（#17）に含む | `ef24531e36` | - |
| #199 | release-0-10-0 | test(worker): lease test manifest fixtureが全platformを宣言 | R0有効（test安定性） | 本人確認済み | 基準ツリー移植（#17）に含む | `41f5146596` | - |
| #198 | release-0-10-0 | fix(rust): macOSでcheck:rustが通るようにworkspace整理 | R0有効（macOS CI） | 本人確認済み | 基準ツリー移植（#17）に含む | `5d8fd8081f` | - |
| #196 | release-0-10-0 | fix(cep): getCepHostSupportRootPathのplatform注入可能化 | R0有効（test可搬性） | 本人確認済み | 基準ツリー移植（#17）に含む | `a1fc2a63d8` | - |
| #187 | release-0-10-0 | fix(preset): local catalog読み込みをcloud gateway bootから分離 | 採用候補（offline coreと整合） | 本人確認済み | 未確定 | `e7a961f376` | - |
| #186 | release-0-10-0 | fix(debug): Debug Consoleのカバレッジと上限の反証可能性 | 延期候補 | 本人確認済み | 未確定 | `1fac098cf1` | - |
| #178 | release-0-10-0 | fix(workspace): post-onboarding widget placement復旧 | 採用候補（主要操作） | 本人確認済み | 未確定 | `7b40c1ed34` | - |
| #177 | release-0-10-0 | fix(settings): right content paneのcanonical inner gutter | 延期候補（UI polish） | 本人確認済み | 未確定 | `6cda4bc9ca` | - |
| #176 | release-0-10-0 | fix(ci): SKIP検証の所有者定義とrelease gate partition（#172〜#175） | R0有効（#6/#10のgate基盤） | 本人確認済み | 未確定 | `06d76f2bad` | - |

## 移植DAGと実行順序

```text
release-0-10-0 (05c921d1) を基準ツリーとして監査・移植
│
├─ #17 基準ツリーの移植（除外 + 識別子置換 + build/test緑化）
│    除外: archive/ docs/no-use/ .obsidian/ supabase/ 旧.claude/skills/
│          .github/(旧CI) .infisical.json LICENSE docs/user-guide/installation/
│          HAP-log.txt等の作業残骸
│    置換: org.loginc.ty-plus → app.ty-plus（暫定・本人承認待ち）
│          com.loginc.typlus → com.typlus（暫定）
│    含む: 旧#196/#198/#199/#201（test安定化）
│
├─ #18 データ消失修正の移植（#203 → #211 の順、#205、#217）
│
├─ #5 ライセンスゲート切断（licensing / Log!N依存の除去）
│
└─ #19 CIゲート整備（旧#207の移植と新repo向け調整）
```

移植は基準ツリーの監査済みファイル + 選定PRの変更を新規commitとして再適用する。旧コミットの履歴は持ち込まない。Extension ID・署名主体の最終値は本人判断（公開ブロッカー）であり、暫定値 `app.ty-plus` で移植・検証を進める。

## 検証ゲート

- 各移植変更は新repoのCI（vitest等の移植後test基盤）で再検証する。データ消失修正（#203/#205/#211/#217）は行動テスト込みで移植する。
- #10（実機ゲート）が評価するSHAは、本台帳の確定後の新repo commitに限定する。

## 権利監査との接続

各資産の権利判断は旧 `rebuildup/ty-plus#219`（および本repoの対応Issue）の決定表を正本とする。本台帳の「権利状態」はその決定表の状態を参照して更新する。

## 更新手順

1. 移植元選定Issueが採否と依存順序を確定する。
2. 権利監査Issueが権利状態を確定する。
3. 移植PRが本repoの新規commitとして実装し、本台帳の行に移植元SHA・再検証結果を記録してcloseする。
