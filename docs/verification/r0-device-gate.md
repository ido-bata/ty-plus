# R0 実機検証ゲート（検証シナリオ）

- Status: Scenario定義済み / macOS候補 `3c2c4421` で主要分岐を実施済み（末尾「実機検証記録」参照。Windows・署名済み配布物・更新サイクル等は未実施）
- Date: 2026-11-11
- 正本: `rebuildup/ty-plus#226`（旧正本）/ 本repo #10 / `rebuildup/ty-plus#218`（期日とGo/No-Go）
- 検証対象ビルド: **内部検証ビルド**（`development-unsigned` trust、`docs/architecture/distribution.md`）

## ルール

- 実機での確認時間とAIが実施した静的・CI検証時間を混ぜない。この文書の「状態」は実機の結果のみで更新する。
- 未実施・未確認をPASSにしない。非表示のエラー・ゼロ件テスト・既知失敗を実施済みと誤記しない。
- Fail時はリリースを止める。判定日（11/30 19:00〜20:30）に試験を繰り越さない。
- 各項目の証拠: スクリーンショットまたはログ + 対象ビルドの `release-manifest.json`（commit SHA・sha256）+ AE / OSのバージョン。
- **内部検証ビルドのPASSは、署名済み正式配布物のPASSを意味しない。** 署名済みrelease-trustビルド（#32、`docs/operations/signing-setup.md`）が準備できた時点で、導入・起動（D-01〜D-03相当）と署名・公証の実機確認（SmartScreen / Gatekeeper / ZXPインストール）を **その配布物に対しても実施し、結果を#10に記録する**。準備できなければ、その事実を公開判断の未充足項目として#1に記録する。

## ビルドの固定

検証は1つのビルドに固定する。対象は internal build workflow の成果物（`ty-plus-internal-<version>-<platform>-<commit>.zip` と `release-manifest.json`）。検証開始時にmanifestのsha256を記録し、以降の項目はそのビルドに対して判定する。署名済み配布物を追加で検証する場合は、ビルドごとにこの固定をやり直す（manifestのsha256を別途記録）。

Windowsの **release-trust配布候補**（`ty-plus-release-candidate-windows-<sha>`、未署名worker + 署名済みZXP — ADR-0003）は `release-trust-windows-candidate` jobの成果物として取得できる。D-18〜D-20（SmartScreen / SAC / ZXPインストール）はこの配布候補に対して実施する。

## dev build と配布物の識別（#80）

dev build（`bun run build:cep:dev` → `dist/cep-dev`、`org.loginc.ty-plus` として配置）と配布物（`app.ty-plus`）は、manifest 上同じ Extension Id（`app.ty-plus.panel1` / `app.ty-plus.dialog-*`）を名乗る。CEP は extensions ディレクトリ全体から Extension Id を解決するため、**両者が同居するとどちらのコードがロードされるか一意に決まらない**。これは R0 の既知の制約であり、dev 用に別 Extension Id を発行する根本対応は #86 で追跡する。

検証時のルール:

- 実機検証の前に、対象ビルド以外の ty-plus フォルダ（`app.ty-plus` / `org.loginc.ty-plus` / 旧 `ty-plus` 等）を extensions ディレクトリから取り除くか、symlink を対象へ付け替える。両方を残したまま「どのビルドを検証したか」を判定しない。
- 判定証拠として、対象 surface の `location.href`（install フォルダ名を含む `file://` URL）を CDP 等で記録し、どのフォルダのコードがロードされたかを証跡化する。folder 名と `CSXS/manifest.xml` の `ExtensionBundleVersion`、および `release-manifest.json` の sha256 をセットで残す。

## シナリオ

状態の値: `未実施` / `合格` / `不合格` / `ブロック`（理由を記す）。

### 1. 導入と起動

| ID | 分岐 | 期待結果 | 証拠 | 状態 |
| --- | --- | --- | --- | --- |
| D-01 | zipを手動インストール（Windows: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions`、macOS: `/Library/Application Support/Adobe/CEP/extensions`） | `app.ty-plus/` が配置される | 配置pathの確認 | 合格（user-level `~/Library/.../CEP/extensions` へzip展開配置。system `/Library` 側は未実施） |
| D-02 | After Effects起動 → Window > Extensions | ty-plus panelが表示される | スクリーンショット | 合格 |
| D-03 | 初回オンボーディング | 完了まで進めることができる | スクリーンショット | 未実施 |

### 2. ローカル主要機能（オフライン）

| ID | 分岐 | 期待結果 | 証拠 | 状態 |
| --- | --- | --- | --- | --- |
| D-04 | 通信なし（Wi-Fiオフ等）でローカル機能の起動と操作 | ライセンス・アカウント要求なしで動作する（#5契約） | スクリーンショット | 未実施 |
| D-05 | ローカルスクリプトpresetの実行 | 実行が成功する | スクリーンショット | 合格 |
| D-06 | `.ffx` presetの適用 | 適用が成功する | スクリーンショット | 合格 |
| D-07 | Debug Consoleの表示 | エラーが隠されず確認できる | スクリーンショット | 合格 |

### 3. 保存 / 復元（データ消失防止）

| ID | 分岐 | 期待結果 | 証拠 | 状態 |
| --- | --- | --- | --- | --- |
| D-08 | レイアウト変更 → AE再起動 → 復元 | 変更が保持される | 前後のスクリーンショット | 合格 |
| D-09 | 破損したlayoutファイル（読めないJSON）を置いて起動 | 空レイアウトに変換せず、既存データを消さない（旧#204/#182修正の実機裏取り） | 破損fixtureと起動後の状態 | 合格 |
| D-10 | 破損したwidgets.jsonを置いて起動・編集 | 既存recordsを消さない（旧#183/#205修正の実機裏取り） | 同上 | 合格 |
| D-11 | macOS: settings/ui.jsonが管理ルートに書かれる（旧#216/#217修正） | ファイルが作成される | 配置pathの確認 | 合格 |
| D-12 | 権限不足ディレクトリ（読取不可）での保存試行 | 失敗がユーザーに見え、データを消さない | スクリーンショット | 未実施 |

### 4. 更新 / 通知（#7 / #8実装後に実施可能になる）

| ID | 分岐 | 期待結果 | 証拠 | 状態 |
| --- | --- | --- | --- | --- |
| D-13 | 更新フィードの確認 | 更新の有無が表示される | スクリーンショット | 合格（「最新です」表示を確認。更新あり分岐は未検証） |
| D-14 | 通知フィードの確認 | 公式通知が表示される | スクリーンショット | 合格（通知0件の空状態表示を確認。通知あり分岐は未検証） |
| D-15 | フィード不達・破損時にローカル機能が妨げられない | core機能が通常どおり動く | スクリーンショット | 合格 |

### 4b. 更新時のユーザーデータ保持（#40）

更新は手動zip上書き配置（`docs/user-guide/installation/index.md`）で行う。ユーザーデータは管理ルート配下に置かれるため、extensionフォルダ（`app.ty-plus/`）の置換では消えない。この分離が実際の更新で破られないことを実機で確認する。

| ID | 分岐 | 期待結果 | 証拠 | 状態 |
| --- | --- | --- | --- | --- |
| D-16 | 旧バージョンでpreset / layout / settingsを作成 → 新バージョンのzipを上書き配置 → 起動 | 作成済みのpreset・layout・settingsが保持される（管理ルートのデータが更新で置換されない） | 更新前後のスクリーンショット + 管理ルートのpath確認 | 未実施 |
| D-17 | 新バージョンが起動しない等の更新失敗を模擬 → 旧バージョンのzipへ戻す → 起動 | 旧バージョンが起動し、作成済みデータが引き続き使える | スクリーンショット | 未実施 |

### 4c. WindowsのOSセキュリティ機能（未署名R0配布の観察 — ADR-0003）

Windows workerはR0では未署名（ADR-0003）。OSのセキュリティ機能がこの配布をどう扱うかを **観察項目** として記録する。セキュリティ機能の無効化を正常動作の前提にしない。

| ID | 分岐 | 観察内容 | 証拠 | 状態 |
| --- | --- | --- | --- | --- |
| D-18 | SmartScreen有効のWindowsで未署名zipを展開しworkerを初回起動 | 「Windows protected your PC」警告の表示と、クリックスルー後の起動可否を記録する（評判は蓄積型 — 消えることを期待しない） | スクリーンショット | 未実施 |
| D-19 | Smart App Control有効のWindowsで同操作 | 未署名binaryのblock挙動を記録する（SAC有効環境では本配布は動作しない — 文書化された制約） | スクリーンショット | 未実施 |
| D-20 | 署名済みZXPのインストール（自己署名 / 権限確認） | ZXPインストーラがPlayerDebugModeなしで受け入れられることを記録する（ZXP署名はworkerのOS署名と独立 — ADR-0003） | スクリーンショット | 未実施 |

### 5. 観察項目（既知の重大不具合）

| ID | 対象 | 観察内容 | 状態 |
| --- | --- | --- | --- |
| W-01 | 旧#127（PandaCSSレイアウト崩壊） | baselineに修正commitがあるが実機未確認。dialog / Control Panelのレイアウト崩れがないか | 合格 |
| W-02 | 旧#128（fixture fallback） | release相当buildでonline機能が静かにfixtureに落ちないか | 合格 |
| W-03 | 旧#129（Debug Console集約） | 全surfaceのログが集約されるか | 合格 |
| W-04 | 旧#209 / #214（macOS crash、原因未確定） | AE 2026でのSIGABRT / SIGSEGV。発生したら `~/Library/Logs/CSXS` とcrash reportを採取し、再現手順を記録 | 未実施 |
| W-05 | worker binaryの起動 | operation-workerがmanifestどおりに起動するか（ExtendScript fallbackに落ちていないか。Debug Consoleまたはログで確認） | 合格 |

## 判定への接続

- 必須フロー（D-01〜D-12）に再現可能な致命障害が残る場合、Go/No-Go（11/30）は **No-Go** を出発値とする。
- ユーザーデータ消失リスクは修正または明示的な公開ブロッカーとして扱う。
- 結果（証拠込み）はこの文書の状態列と、リリース判定用PRに記録する。

## 実機検証記録 — 候補 `3c2c4421`（macOS、2026-11-14 実施）

### 対象の固定

- sourceCommit: `3c2c442105d62d0e55771e7f4e5eb147c9b6ccc6`（release-0-10-2 head）
- 成果物: `dist/app.ty-plus.zip`、SHA-256 `ef4d74e189983f37a5a96e26a046c0b57e3437dd1bcbd8db93b5b33aabdf620a`
- trust: `development-unsigned` / productVersion `0.10.1` / worker sha256 `c03df142…2042a4b`
- 配置: `~/Library/Application Support/Adobe/CEP/extensions/app.ty-plus`
- 環境: macOS（Apple Silicon）、After Effects 2026 `26.5.3`、CEP PlayerDebugMode 有効
- 詳細な項目別証拠と未検証一覧: Issue #10 のコメント「実機検証記録 — 候補 `3c2c4421`」
- ローカル証跡dir: `~/Library/Application Support/ty-plus-releases/v0.10.2-candidate-3c2c4421-device-gate/`（スクリーンショット・CSXS renderer ログ・worker 検証 JSON・build identity）

### 今回追加で確認した分岐（同一候補・同一環境）

- **easing（実UI E2E）**: easing widget で選択キーへ `適用` を実行し、`setTemporalEaseAtKey` 系の結果を AE 側で読み戻し確認（influence/speed 変化）。UI → dispatch → host → ExtendScript → AE 状態まで一貫。
- **スクリプト preset 実行**: modeless preset library から実行し、`preset.execute.requested` / `preset.execute.completed`（`action="applyPreset"`）の lifecycle ログと AE 側 comp 生成を確認。
- **`.ffx` preset 適用（D-06）**: テスト `.ffx` を modeless UI から実行 → `targetLayer.applyPreset` 完了ログ → layer の effect stack 変化を読み戻し確認。
- **D-09（破損 layout）**: `workspaces/workspace-1.json` を不正JSONに置換 → panel が「レイアウトを復元できませんでした…ファイルが上書きされないよう保存は停止」と明示表示。ファイルは破損のまま保持され、データ消失なし。復元後は正常動作に復帰。
- **D-10（破損 widgets.json）**: 不正JSONに置換 → `widgets.json.bak-<ts>` が作成され原本は保持。panel は通常どおり起動・操作可能。
- **D-11**: `settings/ui.json` が管理ルート `/Applications/Adobe After Effects 2026/ty-plus/settings/` に作成されていることを確認。
- **D-13**: settings `#update` が `更新状態: 最新です` を表示（更新有無の表示分岐として合格。「更新あり」分岐は未検証）。
- **D-14**: messages dialog が `No notifications` の空状態を表示（通知フィード照合済み・fixture なし。通知あり分岐は未検証）。
- **D-15**: cloud gateway は dormant（boot せず auto-probe 抑止）で、feed 不達相当の状態でも local catalog・preset 実行・easing・workspace 保存など core 機能がすべて動作。
- **W-01**: panel / settings / preset library / widget-selector / debug-console の全 surface でレイアウト崩壊なし。
- **W-02**: online surface は `Cloud offline — gateway boot was not invoked — local catalog only` を表示し fixture preset/通知へ静かに落ちない。
- **W-05**: `worker-verify.json` で `accepted:true / finalResponse:true / stdoutEof:true / closeExitCode:0 / rowCount:354`、manifest sha256 一致。ExtendScript fallback ではない。

### dev/release Extension Id 同居（#86 / PR #90、branch `86` = `cacc95f8` で実施）

- `app.ty-plus`（release候補）と `app.ty-plus.dev`（dev build）が同一 extensions ディレクトリに共存し、**同時に別 surface として起動・操作できた**。
- 識別証拠（CDP）:
  - release panel: `location.href=…/extensions/app.ty-plus/panel/index.html`、`getExtensionID()=app.ty-plus.panel1`
  - dev panel: `…/extensions/app.ty-plus.dev/panel/index.html`、`app.ty-plus.dev.panel1`
  - dev modeless: `app.ty-plus.dev.dialog-settings` / `app.ty-plus.dev.dialog-widget-selector` / `app.ty-plus.dev.dialog-preset-add` がそれぞれ正しく自己識別
- 両 panel が同一 AE インスタンスへ `evalScript` で ExtendScript を発行できた（`app.version=26.5.3x9`）。
- ユーザーデータ（settings / presets / workspaces / widgets）は管理ルートが Extension Id 非依存のため **共有される設計**（PR #90 記載どおり）。dev/release の bundle 差し替えをまたいでデータが保持されることを実機で確認（D-16 の代替証拠。zip 上書き更新サイクル自体は未実施）。
- preset tool handoff のファイル名は Extension Id 由来（`app.ty-plus.dev.*.json`）で release 側と衝突しない（命名規則はコードと ID 証拠で確認。handoff ファイル生成を伴う操作の dev 側 E2E は未実施）。
- 既知の制約: dev `.debug` の debug port は release と同番帯（8970〜）を使うため、**debug 有効時は同時に CDP port を取れない** surface がある（dev 側を 91xx へ付け替えて検証）。PlayerDebugMode 無効の配布環境では影響しない。

### 未実施・未確認（PASS にしない）

- **D-03** オンボーディング、**D-04** ネットワーク完全遮断（Wi-Fi 切断は環境破壊的なため未実施。dormant 設計と空状態観測が代替証拠）
- **D-12** 権限不足時の保存: `settings/` を読取専用化して Save を試行したところ `app.json` は byte 同一で保持（データ非破壊は確認）したが、dialog が閉じる挙動のため「失敗がユーザーに見える」ことは未確認
- **D-16 / D-17** zip 上書き更新・ロールバックの実サイクル（管理ルート分離の代替証拠のみ）
- **D-18〜D-20** Windows 固有項目（環境なし）
- **W-04 / #71** クラッシュ監視は継続。今回のセッションでは AE crash を再現せず、CSXS renderer ログに ty-plus 起因の `Uncaught` / `Exception` なし（解決扱いにはしない）
- **#91** settings の grid/theme 値（`--ty-ws-cell` 等）が panel reload 後に既定値へ戻る永続化不具合を本検証中に発見・Issue 化。実機 FAIL として記録し、修正は別途追跡
- **署名済み release-trust 配布物**での導入・起動・署名/公証確認は依然未実施。本記録は `development-unsigned` の証拠であり正式配布の PASS を意味しない
