# 移植台帳（porting ledger）

旧 `rebuildup/ty-plus` から本repoへ移植する実装の正本台帳。判断の正本は `rebuildup/ty-plus#228`（移植元選定）と `rebuildup/ty-plus#230`（移行の暫定正本）。本repo側の進行は #3 が担う。

## 規則

- 移植は監査済み資産に限定する。権利未確認のものは「権利待ち」とし、移植しない。
- 旧コミットをcherry-pickで履歴移植しない。監査済みのコード変更を本repoの新規commitとして再適用し、対応する旧SHAを本台帳に記録する。
- 採否・権利判断・再検証状態が確定した行のみ、状態を更新する。未確認をPASSにしない。
- Log!N固有の識別子・接続先・秘密値・証明書・ライセンスゲートは移植時に取り除く。

## 旧ブランチ基準

| 旧ref | SHA | 状態 |
| --- | --- | --- |
| `main` | `a633e246156c` | v0.9.1 |
| `release-0-10-0` | `05c921d1fb9a` | 旧計画時点でmainより先行。コミット数は最新Git上で再検証する（#228） |

## OPEN PR棚卸し（2026-11-11時点）

採否・依存DAG・権利状態は移植元選定Issueが確定させる。stacked関係（例: #203 → #211）は依存順に処理する。

| 旧PR | base | 責務 | R0必須/延期 | 権利状態 | 採否 | 移植元SHA | 再検証 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #165 | main | release: v0.10.0（release PR） | - | 未監査 | 未評価 | - | - |
| #217 | release-0-10-0 | fix(storage): 絶対パスの先頭スラッシュ保持（#216） | 未評価 | 未監査 | 未評価 | - | - |
| #213 | release-0-10-0 | fix(runtime): modeless dialog起動経路でcloud gateway boot（#171） | 未評価 | 未監査 | 未評価 | - | - |
| #212 | release-0-10-0 | chore(skills): project-init Skills復元とgate契約のdocs移動 | 未評価 | 未監査 | 未評価 | - | - |
| #211 | 182 | fix(workspace): 読み込み失敗を空レイアウトに変換せず復元まで書込停止（#204） | 未評価 | 未監査 | 未評価 | - | - |
| #208 | release-0-10-0 | fix(dev): macOSのAE検出・起動 | 未評価 | 未監査 | 未評価 | - | - |
| #207 | release-0-10-0 | fix(ci): ゲートが要求するoperation-worker成果物をゲート自身がbuild（#191） | 未評価 | 未監査 | 未評価 | - | - |
| #206 | release-0-10-0 | fix(preset): boot経路catalogをraw text読み+strict parse | 未評価 | 未監査 | 未評価 | - | - |
| #205 | release-0-10-0 | fix(workspace): 読めないwidgets.jsonを空に潰さない（#183） | 未評価 | 未監査 | 未評価 | - | - |
| #203 | release-0-10-0 | fix(workspace): 読めないtarget layoutを上書きしない（#182、データ消失阻止） | 未評価 | 未監査 | 未評価 | - | - |
| #202 | release-0-10-0 | fix(runtime): host callerをWindow単位で共有しwidget effect無限ループ停止 | 未評価 | 未監査 | 未評価 | - | - |
| #201 | release-0-10-0 | test(worker): fixture rootをtest thread単位に分離 | 未評価 | 未監査 | 未評価 | - | - |
| #199 | release-0-10-0 | test(worker): lease test manifest fixtureが全platformを宣言 | 未評価 | 未監査 | 未評価 | - | - |
| #198 | release-0-10-0 | fix(rust): macOSでcheck:rustが通るようにworkspace整理 | 未評価 | 未監査 | 未評価 | - | - |
| #196 | release-0-10-0 | fix(cep): getCepHostSupportRootPathのplatform注入可能化 | 未評価 | 未監査 | 未評価 | - | - |
| #187 | release-0-10-0 | fix(preset): local catalog読み込みをcloud gateway bootから分離 | 未評価 | 未監査 | 未評価 | - | - |
| #186 | release-0-10-0 | fix(debug): Debug Consoleのカバレッジと上限の反証可能性 | 未評価 | 未監査 | 未評価 | - | - |
| #178 | release-0-10-0 | fix(workspace): post-onboarding widget placement復旧 | 未評価 | 未監査 | 未評価 | - | - |
| #177 | release-0-10-0 | fix(settings): right content paneのcanonical inner gutter | 未評価 | 未監査 | 未評価 | - | - |
| #176 | release-0-10-0 | fix(ci): SKIP検証の所有者定義とrelease gate partition | 未評価 | 未監査 | 未評価 | - | - |

## 権利監査との接続

各資産の権利判断は旧 `rebuildup/ty-plus#219`（および本repoの対応Issue）の決定表を正本とする。本台帳の「権利状態」はその決定表の状態を参照して更新する。

## 更新手順

1. 移植元選定Issueが採否と依存順序を確定する。
2. 権利監査Issueが権利状態を確定する。
3. 移植PRが本repoの新規commitとして実装し、本台帳の行に移植元SHA・再検証結果を記録してcloseする。
