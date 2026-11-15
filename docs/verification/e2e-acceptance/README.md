# E2E 受入体系（Issue #108）

このディレクトリは、ty-plus の全機能を対象とする体系的な E2E 受入の正本である。個別 Issue 対応型の Device Gate（`docs/verification/r0-device-gate.md`）を置き換えるものではなく、そのシナリオを含めて全機能へ拡張した上位の受入体系として運用する。

## 構成

| ファイル | 内容 |
| --- | --- |
| `feature-inventory.md` | ユーザーが触れる全 surface・機能・操作経路の棚卸し。永続化先と AE 側効果を各操作に対応付ける |
| `use-case-matrix.md` | ユースケース対応表。機能単位ではなく「ユーザーが達成したい一連の作業」単位で定義し、検証手段・OS・状態を管理する |
| `results/` | 実行記録。1 回の実行 = 1 ファイル（`<date>-<host>-<build>.md` + 証跡 JSON/PNG） |

関連する既存の正本:

- `docs/verification/r0-device-gate.md` — R0 実機ゲート（D-01〜D-20, W-01〜W-05）。本体系の UC から参照・包含する
- `docs/user-guide/verification-checklist.md` — 販売品質チェックリスト（項目レベルの手動確認項目）
- `src/shared/scenario/` — Gherkin シナリオ仕様と `real_ae_e2e` evidence level の契約（runner は本体系のハーネスが担う）
- `docs/user-guide/verification/verification-matrix.md` — 2026-06 実機検証の ID 付き結果表（フォーマットの先例）

## 判定ルール

- **PASS にしてよいのは成果物を確認した場合だけ**。画面表示・モック・内部 API の成功だけでは PASS にしない。各 UC の「確認対象」列が求める永続化ファイル・AE 状態・生成物の実在を証跡として残す。
- 状態の値: `未実施` / `自動PASS` / `自動FAIL` / `手動PASS` / `手動FAIL` / `BLOCKED`（理由必須）/ `対象外`（理由必須）。
- 未実施・未確認を PASS にしない。FAIL は Issue 化して追跡する。
- 各結果には Build（commit SHA・bundle flavor）・Host（AE/OS バージョン）・実行日時・証跡パスを記録する。

## 実行方法

自動化ハーネスは `scripts/verify/e2e/` にある。前提: 対象ビルドが CEP extensions にインストール済みで、After Effects が起動し対象パネルが開いていること（パネルを開く操作自体が UC の対象になる場合を除く）。

```sh
# dev build の例。managed root は AE インストール内の ty-plus-init.json から自動検出する
bun run scripts/verify/e2e/run.ts \
  --extension-dir "$HOME/Library/Application Support/Adobe/CEP/extensions/app.ty-plus.dev" \
  --suite smoke \
  --out docs/verification/e2e-acceptance/results

# 別の場所へインストールした場合は --managed-root / --extension-dir を明示する
```

実行結果は `results/` 配下へ JSON 証跡とともに記録し、`use-case-matrix.md` の状態列を更新する。

## 更新ルール

- 機能追加・仕様変更があったら `feature-inventory.md` と `use-case-matrix.md` を同じ変更で更新する。
- 発見した欠陥は Issue 化し、修正・回帰テスト・レビューを経て `release-0-10-2` へ統合する。統合後に該当 UC の再実行で状態を更新する。
- 自動化できない項目は手動検証として管理し、未実施・失敗・成功を区別する。
