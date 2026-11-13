# R0 実機検証ゲート（検証シナリオ）

- Status: Scenario定義済み / 実施は未実施（11/29実機枠）
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
| D-01 | zipを手動インストール（Windows: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions`、macOS: `/Library/Application Support/Adobe/CEP/extensions`） | `app.ty-plus/` が配置される | 配置pathの確認 | 未実施 |
| D-02 | After Effects起動 → Window > Extensions | ty-plus panelが表示される | スクリーンショット | 未実施 |
| D-03 | 初回オンボーディング | 完了まで進めることができる | スクリーンショット | 未実施 |

### 2. ローカル主要機能（オフライン）

| ID | 分岐 | 期待結果 | 証拠 | 状態 |
| --- | --- | --- | --- | --- |
| D-04 | 通信なし（Wi-Fiオフ等）でローカル機能の起動と操作 | ライセンス・アカウント要求なしで動作する（#5契約） | スクリーンショット | 未実施 |
| D-05 | ローカルスクリプトpresetの実行 | 実行が成功する | スクリーンショット | 未実施 |
| D-06 | `.ffx` presetの適用 | 適用が成功する | スクリーンショット | 未実施 |
| D-07 | Debug Consoleの表示 | エラーが隠されず確認できる | スクリーンショット | 未実施 |

### 3. 保存 / 復元（データ消失防止）

| ID | 分岐 | 期待結果 | 証拠 | 状態 |
| --- | --- | --- | --- | --- |
| D-08 | レイアウト変更 → AE再起動 → 復元 | 変更が保持される | 前後のスクリーンショット | 未実施 |
| D-09 | 破損したlayoutファイル（読めないJSON）を置いて起動 | 空レイアウトに変換せず、既存データを消さない（旧#204/#182修正の実機裏取り） | 破損fixtureと起動後の状態 | 未実施 |
| D-10 | 破損したwidgets.jsonを置いて起動・編集 | 既存recordsを消さない（旧#183/#205修正の実機裏取り） | 同上 | 未実施 |
| D-11 | macOS: settings/ui.jsonが管理ルートに書かれる（旧#216/#217修正） | ファイルが作成される | 配置pathの確認 | 未実施 |
| D-12 | 権限不足ディレクトリ（読取不可）での保存試行 | 失敗がユーザーに見え、データを消さない | スクリーンショット | 未実施 |

### 4. 更新 / 通知（#7 / #8実装後に実施可能になる）

| ID | 分岐 | 期待結果 | 証拠 | 状態 |
| --- | --- | --- | --- | --- |
| D-13 | 更新フィードの確認 | 更新の有無が表示される | スクリーンショット | 未実施 |
| D-14 | 通知フィードの確認 | 公式通知が表示される | スクリーンショット | 未実施 |
| D-15 | フィード不達・破損時にローカル機能が妨げられない | core機能が通常どおり動く | スクリーンショット | 未実施 |

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
| W-01 | 旧#127（PandaCSSレイアウト崩壊） | baselineに修正commitがあるが実機未確認。dialog / Control Panelのレイアウト崩れがないか | 未実施 |
| W-02 | 旧#128（fixture fallback） | release相当buildでonline機能が静かにfixtureに落ちないか | 未実施 |
| W-03 | 旧#129（Debug Console集約） | 全surfaceのログが集約されるか | 未実施 |
| W-04 | 旧#209 / #214（macOS crash、原因未確定） | AE 2026でのSIGABRT / SIGSEGV。発生したら `~/Library/Logs/CSXS` とcrash reportを採取し、再現手順を記録 | 未実施 |
| W-05 | worker binaryの起動 | operation-workerがmanifestどおりに起動するか（ExtendScript fallbackに落ちていないか。Debug Consoleまたはログで確認） | 未実施 |

## 判定への接続

- 必須フロー（D-01〜D-12）に再現可能な致命障害が残る場合、Go/No-Go（11/30）は **No-Go** を出発値とする。
- ユーザーデータ消失リスクは修正または明示的な公開ブロッカーとして扱う。
- 結果（証拠込み）はこの文書の状態列と、リリース判定用PRに記録する。
