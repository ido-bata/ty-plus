# portfolio-assets/ty-plus — 代表画像マニフェスト

slug: `ty-plus` / 監督Issue: rebuildup/my-web-2026#1225 / 子Issue: ido-bata/ty-plus#635

## 収録画像

| 区分 | ファイル | 寸法 | 内容 |
| --- | --- | --- | --- |
| 主画像 (main) | `preset-grid.png` | 2160×820 | プリセットタイル一覧 + 情報ウィジェット + フォントビューアが同一グリッドに並ぶワークスペース実画面 |
| 補足 (supplement) | `workspace-widgets.png` | 2160×1040 | イージングカーブエディタ（Curve/Loop/Bounce/Elastic）と Align / Distribute / Spacing ツール群 |
| 補足 (supplement) | `presets-dialog.png` | 1760×1520 | Local Presets ブラウザ（カタログ一覧・オフライン通知・ワークスペース配置情報） |
| 補足・旧版参考 (supplement, v0.10.1) | `v0.10.1-hero.png` | 2160×1120 | AE メインウィンドウと ty-plus パネルの composite。「パネルと実コンポジションの共存」を示す唯一の既存素材だが、パネル UI は v0.10.1 時点のもの |

## 出典・provenance

- `preset-grid.png` / `workspace-widgets.png` / `presets-dialog.png` は本リポジトリ `apps/web/public/images/` の既存アセットを無加工で複製（トリミング・リサイズ・合成なし）。`v0.10.1-hero.png` は `docs/user-guide/assets/screenshots/` の既存アセットを無加工で複製。
- 撮影方法: `scripts/verify/web-product-capture.ts` が稼働中の After Effects 上の ty-plus CEP パネルを CDP 経由で駆動し、実ポインタ入力・実プロダクトコード経路で生成した状態を `Page.captureScreenshot` で取得した「検証済み製品キャプチャ」（Issues #309 / #319 / #322 系）。捏造UI・モックではない。
- 撮影対象版: v0.12.0 リリース直前の開発ビルド（2026-11-20〜21 撮影、当時の main は `2c7a5931` / `41653851` / `05d465f1` 系）。v0.12.0 Stable（2026-11-21 公開）〜 現行 v0.13.0 でパネルのワークスペース概念・プリセットタイル・ウィジェット構成は同系。公式サイト（v0.12.0 で公開）の Features / ホームページで現行の証拠画像として掲載中。
- `v0.10.1-hero.png` の撮影方法は別系統: 公開済み Stable `v0.10.1` の ZXP を実機 AE で起動し `screencapture -l <window-id>` で撮影（`docs/user-guide/assets/screenshots/capture-notes.md` 参照）。
- `preset-info-*.png` は review-322 キャプチャの crop だが、本納品では未使用。
- 元ファイルの追加 commit: `d47d707c`（preset-grid / workspace-widgets / presets-dialog / add-widget）、`41653851`・`05d465f1`（再構成・info ペア）。
- provenance の一次記録: `docs/verification/web-redesign/review-343/FINDINGS.md`「画像アセットの provenance」節。

## alt / caption（公式サイト i18n より）

- `preset-grid.png`
  - alt: 「ty-plus のプリセットタイルがアイコン付きでグリッドに並び、情報ウィジェットとフォントビューアが同じワークスペースに配置されている実パネル画面」
  - caption: 「プリセットはサムネイルタイルとして整理され、ホバーや選択の状態を情報ウィジェットが表示します。」
- `workspace-widgets.png`
  - alt: 公式 ja locale `home.surfaces.workspaceAlt` =「ty-plus ワークスペースのユーティリティウィジェット — クイックアクション、イージングカーブ、アライメント、アンカーポイントツール」
  - caption: 公式 ja locale `home.surfaces.workspaceCaption` =「ワークスペースグリッド — プリセットとウィジェットが 1 つのサーフェスに並びます。実行中のパネルからキャプチャしています。」
- `presets-dialog.png`
  - alt: 公式 ja locale `home.surfaces.presetsAlt` =「ty-plus の Local Presets ブラウザがローカルカタログのプリセットを一覧表示している様子」
  - caption: 公式 ja locale `home.surfaces.presetsCaption` =「Local Presets — カタログのプリセットを閲覧・絞り込み・配置できます。」

## 権利・公開境界

- 画像は製品作者自身のプロダクト UI のキャプチャであり、リポジトリは MIT で Public。公式サイトで既に公開済みの素材のため、ポートフォリオ掲載の権利境界上の問題はない。
- 写っているのは製品同梱プリセット名（フェードイン等のカタログ名）とデモ用フォントサンプル文字列のみ。個人情報・非公開プロジェクト名・ファイルパス・アカウント情報は含まない（OCR で確認済み）。
- After Effects 本体のウィンドウ枠・OS UI・他アプリは写っていない（パネル DOM のキャプチャ）。

## 再現手順

1. `mise install` 後、After Effects を起動し ty-plus dev extension（`app.ty-plus.dev`）のパネルを開く。
2. `bun run scripts/verify/web-product-capture.ts --extension-dir <dev extension dir> --managed-root <AE managed root> --out <dir>` を実行（managed root と AE プロジェクト項目は実行後に自動復元される）。
3. 生成される `product-*.png` が同等の実機キャプチャ。`apps/web/public/images/` の各ファイルはこの系統の検証済み成果物。

## 今回の撮影に関する注記（blocker）

- 本納品は既存検証済み画像の再利用。現行 v0.13.0 での新規実機撮影（AE ウィンドウ + パネルの複合ショット）は、作業時点で AE2027 が外部自動化（Aulymo_v04）に占有され、かつ panel-1 消失・モーダル残存のゾンビ状態にあるため未実施。復旧にはユーザーによる AE2027 の再起動が必要（`docs/verification/release-candidate-0-13-1.md` に同一 blocker の記録あり）。復旧後に `web-product-capture.ts` で v0.13.x の再撮影が可能。
- `docs/user-guide/assets/screenshots/v0.10.1-hero.png`（v0.10.1 実機 composite、同ディレクトリの `capture-notes.md` に ZXP SHA-256・AE バージョン・撮影手順を含む完全な provenance あり）も評価した。パネル UI が現行版（ワークスペースグリッド・検索・Loop widget・i18n）と世代が異なるため主画像には採用せず、「コンポジション共存」構図の代替候補として補足に同梱する。

---

## 2026-11-26 追記: v0.13.0 真正再撮影版（main.png 以下が正本）

owner 判断により既存再利用品を暫定とし、v0.13.x の実機再撮影を実施。AE2026 (26.5.3x9) + 公開 Stable `app.ty-plus` v0.13.0（`/Library/.../CEP/extensions/app.ty-plus`、manifest Version=0.13.0、Host AEFT [17.0,99.9]）で取得。

| 区分 | ファイル | 寸法 | 内容 |
| --- | --- | --- | --- |
| 主画像 main | `main.png` | 3685×1248 | 左: AE2026 ウィンドウ実写（Portfolio Demo コンポジション + ty-plus パネル同居）、右: v0.13.0 パネルのプリセットゾーン 4x キャプチャの composite |
| 補足 | `v0.13.0-preset-tiles.png` | 2544×1812 | 検証済みデモワークスペースのプリセットタイル10面（CDP 4x capture） |
| 補足 | `v0.13.0-workspace-top.png` | 2544×1812 | ウィジェット帯（Curve/Bounce/Elastic・Align/Distribute/Spacing） |
| 補足 | `v0.13.0-preset-zone-2.png` | 2544×1812 | 下部ゾーン（情報ウィジェット + フォントビューア） |
| 補足 | `v0.13.0-presets-dialog.png` | 1760×1520 | Local Presets ダイアログ実画面 |
| 補足 | `v0.13.0-add-widget-dialog.png` | 1760×1520 | Add Widget ダイアログ実画面 |

### 撮影対象版・再現手順（v0.13.0）

- 版: ty-plus v0.13.0 Stable（GitHub Release `v0.13.0`、2026-11-24 公開）。ホスト: Adobe After Effects 2026 (26.5.3x9)、macOS。
- 手順: `scripts/verify/web-product-capture.ts`（repo 正本、Issue #309/#319/#322 系）を `--extension-dir=/Library/.../app.ty-plus --managed-root="/Applications/Adobe After Effects 2026/ty-plus"` で実行。managed root と AE プロジェクトは snapshot/restore 済み。パネル静止画は `Emulation.setDeviceMetricsOverride` (DSF=4) による高解像度化（レイアウトは等倍、画素密度のみ向上）。
- 検証: スクリプトログで `preset tiles rendered: 10`、プリセット実適用を ExtendScript で確認（`effects after run: [ADBE Slider Control, Pseudo/…, ADBE Geometry2]`、`preset application verified: true`）。
- `main.png` の右側は同一実行の `product-preset-tiles.png`。左側は `screencapture -l <AE window>` の実ウィンドウ。コンポジション「Portfolio Demo」は撮影用に ExtendScript で生成した検証用デモ（単色ソリッド + テキストのみ、個人情報なし）。撮影後にコンポジションはプロジェクトから削除済み。
- alt（main）: 「After Effects 上で ty-plus パネルとコンポジションが共存する画面。パネルにはプリセットタイルとユーティリティウィジェットがグリッド配置されている」
- caption（main）: 「ty-plus v0.13.0 — プリセットをタイルとして整理し、ワークスペース上でプレビュー・適用できる After Effects 拡張」
- 権利/公開境界: 自社プロダクトの実機キャプチャ。写るのは製品同梱プリセット名・デモ用コンポジション・AE 標準 UI のみ。個人情報・非公開名・ファイルパスなし（OCR 確認）。
- 注意: hover/selection の info-widget 検証は既知の未解決項目（#322）のため、選択状態の静止画は未取得。
- 旧ファイル（`preset-grid.png` 等）と `v0.10.1-hero.png` は前回納品の暫定・参考品として残置。正本は `main.png` 以下の v0.13.0 群。
