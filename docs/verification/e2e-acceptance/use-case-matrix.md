# ユースケース対応表

機能単位ではなく「ユーザーが達成したい一連の作業」単位で定義する。各 UC の確認対象は、画面表示ではなく成果物・AE 状態・永続化データを原則とする。状態の値と判定ルールは `README.md` を参照。

凡例: 自動化 = `auto`（`scripts/verify/e2e` で実行可能）/ `semi`（CDP 操作 + 一部手動）/ `manual`（実機手動）。OS = `mac`/`win`/`both`。状態は `未実施` を初期値とし、実行記録（`results/`）と同期して更新する。

## A. 起動・初期化

| ID | ユースケース | 主な確認対象 | 自動化 | OS | 状態 | 証跡/Issue |
| --- | --- | --- | --- | --- | --- | --- |
| UC-A01 | 初回起動 → onboarding 10 ステップ完了 → workspace 表示 | managed root 生成、`settings/app.json`、`workspaces/workspace-1.json`、`presets.json`、panel DOM | semi | both | 未実施 | |
| UC-A02 | 既存データでの起動 → layout/settings/theme 復元 | workspace-N.json・app.json・theme.css の内容が起動後 UI に反映 | auto | both | win:自動PASS / mac:自動PASS | results/2026-11-15-device-windows-ae2027-dev-smoke-run.json / results/macos-ae2026-dev/run.json / results/2026-11-15-device-windows-ae2027-dev-extended/smoke/run.json |
| UC-A03 | panel-1〜5 の開閉と独立性 | 各 panel が別 surface として応答、layout が panel 毎に独立 | auto | both | win:自動PASS / mac:自動PASS | results/2026-11-15-device-windows-ae2027-dev-smoke-run.json / results/macos-ae2026-dev/run.json / results/2026-11-15-device-windows-ae2027-dev-extended/smoke/run.json |
| UC-A04 | AE 再起動をまたぐ host bundle 常駐/self-heal | `$.global.__TY_PLUS_HOST__` contract、worker verify ok | auto | both | mac:自動PASS / win:自動PASS | results/2026-11-15-device-macos-ae2026-dev-extended.md / results/2026-11-15-device-windows-ae2027-dev-extended/host/run.json / #107修正済(PR #116) |
| UC-A05 | パネルを閉じて再度開く（10 回連続）| クラッシュなし、状態保持 | semi | both | 未実施 | |

## B. ワークスペース操作

| ID | ユースケース | 主な確認対象 | 自動化 | OS | 状態 | 証跡/Issue |
| --- | --- | --- | --- | --- | --- | --- |
| UC-B01 | preset を tile として配置（toolbar/catalog/drag）| workspace-N.json の gridCells に追加、tile DOM | auto | both | mac:自動PASS（作成dialog経路のみ。catalog/drag は未カバー） / win:未実施 | results/2026-11-15-device-macos-ae2026-dev-journey/run.json |
| UC-B02 | widget を Add Widget dialog から追加 | widgets.json record、tile 描画、layout reload | auto | both | mac:自動PASS(sandbox) / win:未実施 | results/2026-11-16-device-macos-ae2026-dev-workspace-sandbox/run.json |
| UC-B03 | tile 移動・リサイズ・削除・複製 | workspace-N.json の座標/サイズ更新、DOM 反映 | semi | both | 未実施 | |
| UC-B04 | grid 設定（cell/gap/radius）変更 → live 反映 → reload 後維持 | theme.css `--ty-ws-*`、app.json `workspace.grid`、computed style、実セルサイズ | auto | both | win:自動PASS / mac:自動PASS(#112修正済) | #95 / results/2026-11-15-device-windows-ae2027-dev-smoke-run.json / results/macos-ae2026-dev/run.json / results/2026-11-15-device-windows-ae2027-dev-extended/smoke/run.json |
| UC-B05 | レイアウトスナップショット保存→変更→復元→削除 | snapshots.json、全パネル layout 復元 | auto | both | mac:自動PASS(sandbox, 単一run完走) / win:未実施 | results/2026-11-16-device-macos-ae2026-dev-workspace-sandbox/run.json |
| UC-B06 | Undo/Redo | 操作の巻き戻し/やり直しが layout に反映 | semi | both | 未実施 | |
| UC-B07 | 複数パネル間の preset 配置移動 | workspacePanels roster、対象 panel の tile | semi | both | 未実施 | |
| UC-B08 | 背景エディタで color/pattern/image レイヤー編集 | background-N.json、panel 背景描画 | semi | both | 未実施 | |
| UC-B09 | ControlPanel collapse/向き/位置変更 → reload 後維持 | panels/panel-N.json | auto | both | 未実施 | |
| UC-B10 | Layout Lock widget で編集ロック | gesture が効かないこと、widget state | semi | both | 未実施 | |
| UC-B11 | 破損 workspace-N.json で起動・編集 | 既存データを消さない、空 layout 化しない | auto | both | mac:自動PASS / win:未実施 | results/2026-11-15-device-macos-ae2026-dev-extended.md（起動側のみ。編集 gesture は未カバー） |

## C. プリセット

| ID | ユースケース | 主な確認対象 | 自動化 | OS | 状態 | 証跡/Issue |
| --- | --- | --- | --- | --- | --- | --- |
| UC-C01 | Local preset 作成（path 指定）→ presets.json + tile | presets.json record、dialog 閉鎖、tile 配置 | semi | both | 未実施 | |
| UC-C02 | Group preset 作成（folder 走査・icon rules）| groups.json/presets.json、group tile、メンバー展開 | semi | both | 未実施 | |
| UC-C03 | Animation preset 作成（`.ffx` + AE save dialog）| .ffx ファイル生成、presets.json、tile | semi | both | 未実施 | |
| UC-C04 | Code preset 作成（Script/Expression）| .jsx 生成、presets.json | semi | both | 未実施 | |
| UC-C05 | Layer/Comp preset 作成 | scriptRoot 配下ファイル、presets.json（失敗時の壊れた record 非残留も確認）| semi | both | 未実施 | guide既知: macOS で作成失敗事例あり |
| UC-C06 | Footage/Import preset 作成・実行 | presets.json、AE への footage 追加 | semi | both | 未実施 | |
| UC-C07 | Easing preset 作成（カーブ→`.jsx`）| .jsx 生成、presets.json | semi | both | 未実施 | |
| UC-C08 | preset 編集（名前/説明/icon/メンバー）| presets.json 更新、tile/一覧反映 | semi | both | 未実施 | |
| UC-C09 | preset 複製・削除 | presets.json、workspace/group/search から消える | semi | both | 未実施 | |
| UC-C10 | `.ffx` preset を選択レイヤーへ実行 | AE Effect Controls/レイヤーに効果適用 | semi | both | mac:自動PASS / win:未実施 | #10 D-06 / results/2026-11-15-device-macos-ae2026-dev-journey/run.json |
| UC-C11 | `.jsx` script preset 実行 | AE 側の実行結果（例: レイヤー/テキスト変化）| semi | both | mac:自動PASS / win:未実施 | #10 D-05 / results/2026-11-15-device-macos-ae2026-dev-journey/run.json |
| UC-C12 | footage preset 実行（PNG sequence 含む）| AE project への import | semi | both | mac:BLOCKED(dialog Create button hydration、poll修正済・再実行待ち) / win:未実施 | results/2026-11-16-device-macos-ae2026-dev-workspace-sandbox/run.json |
| UC-C13 | `.aex` plugin preset 実行 | matchName で effect 適用 | manual | both | 未実施 | |
| UC-C14 | 実行失敗時の構造化エラー（alert 非モーダル）| モーダルでなく通知/エラー表示、AE 非ブロック | semi | both | mac:BLOCKED(UC-C12と同前段で停止。toast発生/観測分離は実装済・未検証) / win:未実施 | #72 / results/2026-11-16-device-macos-ae2026-dev-workspace-sandbox/run.json |
| UC-C15 | preset asset 欠落時の検出 | verifyPresetAsset の typed failure、起動時 stale 検査 | auto | both | mac:自動PASS / win:自動PASS | results/2026-11-15-device-macos-ae2026-dev-extended.md / results/2026-11-15-device-windows-ae2027-dev-extended/catalog/run.json |
| UC-C16 | 破損 presets.json で起動・編集 | 既存 record を消さない | auto | both | mac:自動PASS / win:自動PASS | results/2026-11-15-device-macos-ae2026-dev-extended.md / results/2026-11-15-device-windows-ae2027-dev-extended/resilience/run.json |
| UC-C17 | preset catalog browser（list/icon・検索・group 展開・hover actions）| DOM 状態、実行/編集/削除の動作 | semi | both | 未実施 | |

## D. ウィジェット

| ID | ユースケース | 主な確認対象 | 自動化 | OS | 状態 | 証跡/Issue |
| --- | --- | --- | --- | --- | --- | --- |
| UC-D01 | Add Widget dialog：検索・カテゴリ・view 切替・追加 | widgets.json、対象 panel の tile | auto | both | 未実施 | |
| UC-D02 | easing：カーブ編集 → AE 選択キーフレームへ apply | AE keyframe influence/speed 変化 | semi | both | 未実施 | |
| UC-D03 | easing：loop mode・複数セグメント・label colors | AE keyframe/label 変化 | semi | both | 未実施 | |
| UC-D04 | easing：clipboard（copy/paste keyframe values）| clipboard.json、AE 値反映 | semi | both | 未実施 | |
| UC-D05 | align：選択レイヤー整列/分布 | AE レイヤー位置変化 | semi | both | 未実施 | |
| UC-D06 | anchor-point：9 方向 + apply all/comp | AE anchor point/position 変化 | semi | both | 未実施 | |
| UC-D07 | info widget：comp/project 情報表示 | DOM 内容が AE 状態と一致 | auto | both | 未実施 | |
| UC-D08 | font-viewer：フォント一覧・選択テキストへ適用 | font 一覧取得、AE text font 変化 | semi | both | 未実施 | |
| UC-D09 | directory-browser：遷移・filter・選択・preset 実行 | DOM、選択ファイルの preset 実行 | semi | both | 未実施 | |
| UC-D10 | menu/quick-actions：クイック実行 | preset 実行結果 | semi | both | mac:自動PASS(sandbox, 連続2回でAE marker確認) / win:未実施 | #125修正済 / results/2026-11-16-device-macos-ae2026-dev-workspace-sandbox/run.json |
| UC-D11 | widget state 永続化（widgets/state/*.json）| reload 後の widget 状態復元 | auto | both | mac:自動PASS / win:自動PASS | results/2026-11-15-device-macos-ae2026-dev-extended.md / results/2026-11-15-device-windows-ae2027-dev-rerun/widgets/run.json |
| UC-D12 | 破損 widgets.json で起動・編集 | 既存 record 非破壊 | auto | both | mac:自動PASS / win:未実施 | results/2026-11-15-device-macos-ae2026-dev-extended.md（UC-I02 と同一ファイル・同一契約） |

## E. 設定

| ID | ユースケース | 主な確認対象 | 自動化 | OS | 状態 | 証跡/Issue |
| --- | --- | --- | --- | --- | --- | --- |
| UC-E01 | 言語切替 → 全 surface 反映 → reload 後維持 | ui.json locale、`documentElement.lang`、文言 DOM | auto | both | mac:自動PASS / win:自動PASS（#121 修正・#122 merge 後の build で確認）| results/2026-11-15-device-macos-ae2026-dev-extended.md / results/2026-11-15-device-windows-ae2027-dev-rerun3/settings/run.json |
| UC-E02 | 外観色変更（accent/text/widget/panel）→ live → reload 維持 | app.json `ui.*`、theme.css token、computed style | auto | both | win:自動PASS / mac:自動PASS(#112修正済) | #94 / results/2026-11-15-device-windows-ae2027-dev-smoke-run.json / results/macos-ae2026-dev/run.json / results/2026-11-15-device-windows-ae2027-dev-extended/smoke/run.json |
| UC-E03 | theme tokens 編集（Apply/Export/Import/reset）| theme.css、export/import round-trip | semi | both | 未実施 | #91 |
| UC-E04 | support root 変更 → relocation/copy/delete → 全パネル reload | app.json paths、managed root 移動、layout 復元 | semi | both | 未実施 | |
| UC-E05 | preset/script/plugin root 変更 | app.json paths、preset scan 反映 | semi | both | 未実施 | |
| UC-E06 | workspace backup export → 別状態で import | bundle JSON、settings/presets/theme/layouts/backgrounds 復元 | semi | both | 未実施 | |
| UC-E07 | update channel 変更 + check now | app.json、releases 参照、UI 表示 | semi | both | 未実施 | |
| UC-E08 | feedback 送信 | GitHub issue URL が事前入力で開く | manual | both | 未実施 | |
| UC-E09 | inputs toggle（anchor/alignment gesture）| app.json gestures、gesture 動作 | semi | both | 未実施 | |
| UC-E10 | settings 保存失敗 → dialog alert 表示・データ非破壊 | role=alert、app.json byte-identical | auto | both | 未実施 | #96, #10 D-12 |
| UC-E11 | theme.css surface 間同時書込の直列化 | 最終 theme.css が両変更を含む | semi | both | 未実施 | #106 |

## F. オンライン/通知

| ID | ユースケース | 主な確認対象 | 自動化 | OS | 状態 | 証跡/Issue |
| --- | --- | --- | --- | --- | --- | --- |
| UC-F01 | preset library：検索・view 切替・download → local catalog | catalog DOM、download 完了、presets.json 反映 | semi | both | 未実施 | guide既知: 「Download complete」だが file 未保存の報告あり |
| UC-F02 | notification center：list/detail/既読/sync | cache/notifications.json、DOM | semi | both | 未実施 | |
| UC-F03 | offline/degraded → core 機能継続 | gateway なしで workspace/preset が動く | semi | both | 未実施 | #10 D-15, online-degraded.feature |
| UC-F04 | update feed 確認 | releases API 結果表示 | semi | both | 未実施 | #10 D-13 |
| UC-F05 | notification feed 確認 | 公式通知表示 | semi | both | 未実施 | #10 D-14 |

## G. デバッグ・診断

| ID | ユースケース | 主な確認対象 | 自動化 | OS | 状態 | 証跡/Issue |
| --- | --- | --- | --- | --- | --- | --- |
| UC-G01 | debug console：ログ集約・filter・eval・clear | debug-console DOM、eval 結果、clear 同期 | auto | both | win:自動PASS / mac:自動PASS | #10 D-07, W-03 / results/2026-11-15-device-windows-ae2027-dev-smoke-run.json / results/macos-ae2026-dev/run.json / results/2026-11-15-device-windows-ae2027-dev-extended/smoke/run.json |
| UC-G02 | console reopen で replay | 過去ログ表示 | auto | both | mac:自動PASS / win:自動PASS | results/2026-11-15-device-macos-ae2026-dev-extended.md / results/2026-11-15-device-windows-ae2027-dev-rerun/debug/run.json |
| UC-G03 | operation worker verify（spawn→accept→result→exit）| verify JSON（rowCount/exit code）| auto | both | mac:自動PASS / win:自動PASS | results/2026-11-15-device-macos-ae2026-dev-extended.md / results/2026-11-15-device-windows-ae2027-dev-extended/debug/run.json |
| UC-G04 | panel surface の unhandled error が console に出る | #71/#69/#67 系の回帰観測 | auto | both | 未実施 | #71,#69,#67 |

## H. ホスト・AE 連携・環境

| ID | ユースケース | 主な確認対象 | 自動化 | OS | 状態 | 証跡/Issue |
| --- | --- | --- | --- | --- | --- | --- |
| UC-H01 | host context 取得（getHostContext/ping）| host 応答、app.version | auto | both | win:自動PASS / mac:自動PASS | results/2026-11-15-device-windows-ae2027-dev-smoke-run.json / results/macos-ae2026-dev/run.json / results/2026-11-15-device-windows-ae2027-dev-extended/smoke/run.json |
| UC-H02 | 複数機能連続操作（preset 作成→配置→実行→保存→reload→再実行）| 各段階の永続化 + AE 状態 | semi | both | mac:自動PASS / win:未実施 | ユーザー作業単位 / results/2026-11-15-device-macos-ae2026-dev-journey/run.json |
| UC-H03 | 日本語 IME ON/OFF でのテキスト入力 | IME 変換中の入力破壊なし | manual | both | 未実施 | |
| UC-H04 | 日本語・空白・記号・長いパスでの preset/設定 | パス解決・書込成功 | semi | both | 未実施 | |
| UC-H05 | 表示倍率 100/125/150%・4K でのレイアウト | 崩れなし | manual | win主 | 未実施 | |
| UC-H06 | AE 2026 / 1 世代前での smoke | boot + preset 実行 | semi | both | 未実施 | |
| UC-H07 | 未署名 worker の Windows SmartScreen/SAC 観察 | D-18〜D-20 の観察記録 | manual | win | 未実施 | #10 |
| UC-H08 | ZXP インストール → 起動 | D-20 | manual | both | 未実施 | #32 |
| UC-H09 | 更新上書き → ユーザーデータ保持 → 旧版復旧 | D-16/D-17 | semi | both | 未実施 | #10 |
| UC-H10 | 30 分/2 時間の耐久（メモリ・CPU・ログ）| リークなし | manual | both | 未実施 | checklist §27 |

## I. 異常系・復旧（#10 D-xx を包含）

| ID | ユースケース | 主な確認対象 | 自動化 | OS | 状態 | 証跡/Issue |
| --- | --- | --- | --- | --- | --- | --- |
| UC-I01 | 破損 workspace-N.json 起動（D-09）| 既存データ非破壊 | auto | both | mac:自動PASS / win:自動PASS | results/2026-11-15-device-macos-ae2026-dev-extended.md / results/2026-11-15-device-windows-ae2027-dev-rerun/resilience/run.json |
| UC-I02 | 破損 widgets.json 起動・編集（D-10）| 同上 | auto | both | mac:自動PASS / win:自動PASS | results/2026-11-15-device-macos-ae2026-dev-extended.md（UC-D12 alias） / results/2026-11-15-device-windows-ae2027-dev-extended/resilience/run.json |
| UC-I03 | 権限不足ディレクトリでの保存（D-12）| 失敗可視化 + 非破壊 | auto | both | 未実施 | |
| UC-I04 | theme.css 破損で起動 | fallback/復旧、他設定への影響 | auto | both | mac:自動PASS / win:自動PASS | results/2026-11-15-device-macos-ae2026-dev-extended.md / results/2026-11-15-device-windows-ae2027-dev-rerun/resilience/run.json |
| UC-I05 | settings/app.json 破損で起動 | defaults への安全な退避 or 復旧 | auto | both | mac:自動PASS / win:自動PASS | results/2026-11-15-device-macos-ae2026-dev-extended.md / results/2026-11-15-device-windows-ae2027-dev-extended/resilience/run.json |
| UC-I06 | surface teardown/reload 連続（10 回）| CEPHtmlEngine crash なし | semi | both | 未実施 | #71, W-04 |
| UC-I07 | AE 強制終了後の再起動 → 状態復元 | 未保存操作の扱い、データ整合 | manual | both | 未実施 | |
| UC-I08 | preset scan timeout/大量ファイル | presetScan 設定、UI 応答 | semi | both | 未実施 | |

## J. ユーザー作業単位（複合ジャーニー）

機能横断の「ユーザーがやりたいこと」単位。個別 UC の連鎖として評価する。

| ID | ジャーニー | 構成 UC | 状態 |
| --- | --- | --- | --- |
| UC-J01 | 初めて使う：インストール→起動→onboarding→preset 取込→最初の preset 実行 | A01, C10/C11 | 未実施 |
| UC-J02 | preset を作って使う：作成→配置→実行→編集→削除 | C01-C09, B01, C10 | 未実施（mac で作成→配置→実行→reload→再実行まで確認。編集・削除は未カバー） |
| UC-J03 | レイアウトを作る：widget 追加→tile 配置→背景→snapshot→reload 復元 | B02,B03,B05,B08,B09,D01 | 未実施 |
| UC-J04 | 外観を整える：Style/Tokens/Grid/言語変更→live 反映→reload 維持 | E01-E03,B04 | 未実施 |
| UC-J05 | トラブルから復旧：破損検知→backup import→動作確認 | I01-I05,E06 | 未実施 |
| UC-J06 | preset を渡す/受け取る：export→別環境 import→実行 | E06,C10 | 未実施 |
| UC-J07 | 日常業務：quick-actions/menu から preset 連続実行 | D10,C10 | 未実施 |
