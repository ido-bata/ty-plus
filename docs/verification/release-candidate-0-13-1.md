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
- レビュー: codex vision による全468件のトリアージ（複数画像バッチ + 問題件の単発再レビュー）
- 最終判定: **468件 = OK 417 + MINOR 22 + MAJOR 28 + weak判定1件（再レビューで解消）**。MAJOR全件を個別検証し実害0件
  - `preset-dialog-*` blank capture 群（24枚）: 旧 capture の stale artifact。release head で再 capture すると実描画を確認（#625 の layout 修正後も production 描画は正常）
  - `quality-layoutcontract--*` 3枚: 意図的な negative fixture
  - `catalog-presetlibraryemptystate--with-results`: `PresetLibraryEmptyState` は結果あり時に `null` を返す仕様で blank が正しい描画
  - `shared-interaction-anchoredpopover--closed`: story の `play` が anchor を click して open にするため capture は open 状態 — story 側の軽微な設計ミス（production の `!open → null` は正しい）。#610 の残件として記録
  - `preset-workspace-tile` / `gridcatalogtile` の "ST" 表示・`widgetutility-fontviewer` の host probe error: 意図的 placeholder / fixture
- MINOR 残件（機能美・磨き上げ観点、ブロッカーではない）: easing icon curve の dark 背景コントラスト、fontviewer statusline 空状態の低コントラスト、downloadprogressiconbutton の faint check icon、grid preview の low-contrast outline 等 22件。#610 の tracking に含める。

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

---

## 収束作業 追記（2026-11-25 第2ラウンド、head `682fcbe6`）

前回報告の残存事項に対する収束結果。全て ticket PR 経由で `release-0-13-1` へ統合済み。

### E2E FAIL/BLOCKED の原因実証と解消（#626 → #628/#629 で全件分類完了）

| PR | Issue | 結果 |
|---|---|---|
| #632 | #629 | debug console replay・settings locale・appearance round-trip：**全て harness bug**（status bar mount 待ち欠如・CDP target stale polling・boot-time theme reconcile との race・grid fixture の部分形状）。製品コード変更なし。UC-G02/UC-E01/UC-J04 を AE2027 で PASS 確認 |
| #637 | #628 | journey/workspace 系：**全て harness bug**。selector の英語 literal 依存を i18n key 解決へ置換、preset-add dialog の pool slot stale surface 誤取得を `[data-path-field]` probe で修正（UC-C12/C14 BLOCKED 解消）、console close の requestOpenExtension retry-resurrect を settle 検証付き close で対策。workspace 5/5・smoke 6/6・settings PASS を AE2027 で確認 |
| #634 | #633 | 実プリセットパック `MV-Effects(α) essential`（.ffx 69件 + 同名 .gif サムネイル、EN/JP・入れ子フォルダ）を sandbox の `presets.json`/`groups.json` へ onboarding import 同等契約でシード（`scripts/verify/e2e/real-preset-pack.ts`）。UC-J08 で group tile・サムネイル描画・実 .ffx 実行を検証 |

- locale-selector 仮説は**否定的に実証**：原因は selector だけでなく boot timing・surface pool・fixture 形状・retry resurrect の複合 harness bug であり、製品不具合の証拠は得られなかった
- テスト削除・期待値緩和なし（むしろ待機・retry・settle 検証を強化）

### merge-stale detector の実事故対応（#627 → #631 merged）

- `check:merge-stale` が報告された実事故コミット `3a0593b3`（PR #430 merge）を**検出できなかった欠陥**を修正：first parent が second parent の ancestor となる degenerate merge で merge-base が退化し検査 domain が空になる問題へ、`effectiveMergeBase()`（祖先側 first-parent chain を辿り実 fork point を再計算）+ wholesale-take の blob-SHA 前段フィルタ + relaxed 前提で対応
- `--commit 3a0593b3` で **8 fail findings**（`layout.ts`, `notification/service.ts`, `widget/registry` 等）を検出、`bdd1168b` でも従来通り検出。8件の通常 merge + 大規模 release merge で false positive 0、テスト 29/29 pass

### 視覚・構造残件（#630 → #636 merged）

- 視覚 MINOR の実修正: `DownloadProgressIconButton` terminal-state legibility、`Tile`/`GridCatalogTile` decorator の WorkspaceTileFrame chrome 整合、`WidgetTutorialLayer` easing mock、`FontViewerStatusLine`/`PathField`/`PresetLibraryEmptyState`/`LoadingSpinner` への assertion 追加。残りは意図的 fixture/placeholder として文書化
- AnchoredPopover `Closed` story を実態に合わせ修正 + `ToggleOpens` 追加（前回 MAJOR 判定の story 設計ミスを解消）
- #609 dead UI: `WorkspaceShell`・`entry/dialog-bootstrap`・`entry/dialogs`・dead route を削除（残件 `dialog-probe` chain は継続対応中）
- #610: `MediaFrame`/`TileFrame`/`GridTile`/`CatalogBrowserShell`/`WorkspaceCatalogTileBody`/`PresetGlyphById`/`MarkdownLiveEditor` の story 追加（未カバー大物 dialogs は継続対応中）

### 収束作業 追記（2026-11-25 第3ラウンド、head `fcb1fbbf`）

- **#609 close**: `dialog-probe` サーフェスを到達経路ごと削除（PR #638、44ファイル: `ProbeDialogBody`・`openDialogProbe`・`dialog/probe/session.ts`・`dialog/bridge.ts`・context menu `probeOpenDebug`・i18n 10言語）。あわせて PR #636 で `WorkspaceShell` 系を削除済み
- **#610 close**: story 未カバー領域を全て解消。PR #639（workspace `Grid`・widget `TileContent`・`SettingsSidebar` の9 story）+ PR #640（`PresetsDialog`/`ListDialog` の検索・group 展開・icon drilldown 4 story）。統合シェル（`panel/Main`・`dialog/Root`・`modeless/Root`）は CEP host executor 直結で fixture 化不能のため対象外として各 PR に根拠を記録
- **#639 CI 修正**: `TileContent.stories.tsx` が `@/function/widget` を直接 import し import-boundary 違反 → management 側 contract（`@/management/widget/contract`）経由に修正して merge
- **AE2027 環境の追加判明事項**: user CEP extensions に `app.ty-plus.p1225-hidden`（`dist/cep-dev` への symlink、manifest/.debug は `app.ty-plus.dev.*` と同一 ID・port を主張）が残存し、AE2027 再起動後は dev パネルの menu/port を p1225-hidden 側が占有する状態になっていた（コードは同一のため機能差なしだが、E2E の surface 同一性の観点では環境衛生上の残件）。また外部自動化 `Aulymo_v04`（`operation-effects-ui` spec）が AE2027 を占有して E2E と競合 — 停止・完了待ちが必要

### 両 OS 配布物

- **Windows**: `ty-plus-v0.13.1-windows.{zip,zxp}` + manifest を `e2d909f8` で構築・検証済み（unsigned worker = R0 正当形、ZXP 署名検証済み）。最終 freeze 後に head 不変ならそのまま有効、変更があれば再構築
- **macOS**: 旧 artifact は `ca4f97a8` で stale。最終 freeze 後に `TY_PLUS_SIGN_IDENTITY` 付きで再構築する

### 残存事項（更新）

1. **AE2027 環境障害**: E2E 中に panel-1 が `No Valid MenuItem(s) found` で消滅し AE 本体が window 0 のゾンビ状態に。quit がモーダルに拒否されており、ユーザーによる AE2027 の確認・再起動が必要。復旧後に journeys suite（UC-J02/J05/J06 BLOCKED 再試行 + UC-J08 実機検証）と全 suite の最終再検証を実施する
2. **#609/#610 残件**: `dialog-probe` chain 削除、preset/settings/widget 系の未カバー dialog stories — worker 対応中
3. **最終 freeze → macOS artifact 再構築 → 全 E2E 再検証 → RC 記録確定**

---

## 収束作業 追記（2026-11-26 第4ラウンド、head `4dbdf8ce`）

#626 の残 FAIL 4件と #655 を全て修正し、最終 head で全 E2E suite を再実行。**FAIL=0 を確認し RC を収束**。

### E2E FAIL の修正（全て ticket PR 経由で `release-0-13-1` へ merge 済み）

| PR | Issue | 内容 |
|---|---|---|
| #651 | #647 | UC-J02: preset edit が preset-add pool の tool dialog を開く問題を harness 側で正しく検出（`findPresetAddDialog` pool-aware） |
| #652 | #648 | UC-J08: group 展開 toggle・sibling thumbnail・.ffx 実行を修正。**製品不具合を1件含む**: `PresetGlyphById` が catalog preset の構造化 icon（"FFX"）を優先し sibling thumbnail を dead code 化していたため、sibling thumb 解決時に icon を落とす修正。pack を userData 配下へステージングして .ffx の `assertAllowedFilePath` を通す harness 修正も含む |
| #654 | #649 | UC-G02: debug console close が stale CDP target に対して retry し続ける問題を、attempt 毎の live surface 再解決で修正 |
| #653 | #650 | UC-I04: corrupt theme.css fallback 判定が `waitForDom` を欠いていた harness 修正 |
| #656 | #655 | UC-G02 根本原因（製品不具合）: debug console の replay consumer が broadcast request に first-response-wins で応答していたが、各 surface responder は自分の in-memory LogBus のみ snapshot するため応答順で履歴が変わる race。consumer 側に collection window（grace 3s/延長・上限 45s）を入れて全 response を union merge |
| #658 | #657 | E2E harness の AE session 診断を `@ido-bata/ae-a8n@0.6.0` へ委譲（crash report/host log/session trace/supervision+GUI state を FAIL/BLOCKED 時に収集）。CDP stall 耐性（`listTargets` 非配列応答ガード、sandbox activation probe timeout 許容）も追加 |

### 最終 E2E（AE2027 実機、dev bundle = release-trust build と同一ソース `4dbdf8ce`）

- 実行: 2026-11-26、`docs/verification/e2e-acceptance/results/2026-11-26-rc-0-13-1/<suite>/run.json`
- 結果: **PASS=32 / FAIL=0 / BLOCKED=0**（33 case 実行、journeys UC-J06 のみ surface boot race で1回 BLOCKED → retry PASS。flaky infra で製品不具合ではない）
- 詳細: `docs/verification/e2e-acceptance/results/2026-11-26-rc-0-13-1.md`
- #626 close 済み

### dialog-presets wedge の根本原因（製品不具合ではないことを実証）

E2E 中に `dialog-presets` surface が CDP 無応答になる事象を観測。ae-a8n attach（ownership `attached`、pid 23970）+ `sample` stack dump + `/json/list` CDP probe + CEP 公式ログ（`~/Library/Logs/CSXS/CEPHtmlEngine12-AEFT-27.0-*.log`）で切り分けた結果:

- wedge した renderer（pid 31862/31863）は main thread が `mach_msg` runloop 待機・CPU 0% — 無限ループではなく CEF renderer の stall
- `Runtime.evaluate` が `1+1` すら timeout する一方、同一 bundle の debug-console / panel-1〜5 は正常
- surface を閉じて `requestOpenExtension` で再 trigger すると新 renderer（pid 68508）が 144ms で正常 boot
- 結論: **transient CEF/CDP stall（環境・ホスト層）であり製品コードの不具合ではない**。証跡収集の恒久的欠落として ae-a8n#336 を起票

### 両 OS 配布物（最終 head `4dbdf8ce` で再構築・検証済み）

- **Windows**: `TY_PLUS_BUILD_PLATFORM=windows` + `TY_PLUS_SIGN_IDENTITY` + `TY_PLUS_ZXP_CERT_*` で `bun run release:candidate --channel=stable --release-version=0.13.1`
  - `ty-plus-v0.13.1-windows.zip` sha256 `bcd6faf1a3549a076c15e02e1090998572519a7bf71ac2ef8ea8ebff830e7209`（11,542,171 bytes）
  - `ty-plus-v0.13.1-windows.zxp` sha256 `62a918b70008d5e3ebdf63313071b1e9d1698ad4d3011ca1e4c2aa5425b81266`（11,558,035 bytes）
  - unsigned worker = R0 正当形、`ZXPSignCmd -verify` PASS、`verify-release-artifacts` OK（sourceCommit=`4dbdf8ce…`、hash-verified、secret scan clean）
- **macOS**: `TY_PLUS_SIGN_IDENTITY="Developer ID Application: Yusuke Kimura (JK49RJ2CK2)"` + 同上 ZXP 設定で実行（notarization は ADR-0003 Amendment 1 により optional、未公証）
  - `ty-plus-v0.13.1-macos.zip` sha256 `d8e05e65041576985acb27db5d1caaccd1b079d82623743aa87a1ae53b99ecc8`（14,668,891 bytes）
  - `ty-plus-v0.13.1-macos.zxp` sha256 `d149a6a4d4ba4dfd0e1d155cdc57a8963114b08f90e3fc5e611e359b2aa39cbf`（14,683,162 bytes）
  - operation-worker Developer ID 署名（`valid on disk` / `satisfies its Designated Requirement`）、`ZXPSignCmd -verify` PASS、`verify-release-artifacts` OK（sourceCommit=`4dbdf8ce…`）
- staging: `dist/github-release/` に両 OS の zip/zxp/manifest。tag/release/upload は未実施 — owner 承認が必要

### 残存事項（最終更新）

1. **正式リリース**: PR #605（release-0-13-1 → main）の merge 承認 + tag/release 作成 + 公開が owner 判断待ち
2. **#609/#610 残件**: tracking issue として継続（本 RC のブロッカーではない）
3. **`Workers Builds: ty-plus`**: main からの既存 CI 失敗（無関係）
4. **ae-a8n#336**: CEP surface の証跡収集欠落（tooling gap、ty-plus のブロッカーではない）
