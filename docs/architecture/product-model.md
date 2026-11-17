# 製品モデル再導出（system-quality 再構成の前提正本）

- Status: Draft（#189 再評価に基づく。採用後に Accepted へ更新）
- Date: 2026-11-17
- 正本: `docs/architecture/project.md`（charter）/ `docs/architecture/offline-core.md` / `docs/architecture/storage-policy.md` / `docs/architecture/widget/index.md`
- 経緯: ユーザー指摘により、既存3層構造（`src/shared` / `src/management` / `src/function`）と内部APIを無条件の制約としない再導出を行った記録。#196 の計画は本書の成立条件を前提に再評価する。

## 1. 製品が実現すべきこと（要求の再導出）

charter と既存正本から、ty-plus がユーザーに提供する価値は次の操作の連鎖である。

```text
発見 → 取り込み → 整理 → 配置 → 実行 → 保存/復元 → 更新/通知
```

1. **発見**: After Effects のプロジェクト資産（preset・script・project・template 等）をローカルファイルシステムから見つけ、内容を識別できる。
2. **取り込み**: 発見した資産を catalog（プリセットライブラリ）へ登録し、名前・アイコン・説明を持つ管理可能な単位にする。
3. **整理**: preset をフォルダ/group として束ね、条件・メンバーを管理できる。
4. **配置**: preset・widget を workspace panel のグリッドへ配置し、レイアウトを保存・復元できる。
5. **実行**: 配置した preset を After Effects へ実行できる。実行結果はローカルコアを壊さない。
6. **保存/復元**: catalog・workspace レイアウト・設定をローカルへ永続化し、再起動・再インストール後も復元できる。既存ユーザーデータを破壊しない。
7. **更新/通知**: 公式feedから更新とお知らせを受け取り、安全に移行できる。これらはオフラインコアの前提条件ではない。

非目標（charter）: アカウント、課金、コンテンツ投稿、強制自動更新、全面UXP移行。

## 2. ユーザー操作モデル（画面・操作・状態の責務）

製品の全操作面を「何を操作し、どの状態を持ち、どの品質を保証すべきか」で分類する。個別コンポーネントの修正ではなく、この操作単位を受入の単位とする。

| 操作単位 | 画面/経路 | 状態の所有者 | 保証すべき品質 |
|---|---|---|---|
| ディレクトリブラウズ | directory-browser widget / storage dialog | 一時的な閲覧状態（カレントdir・選択・フィルタ） | 全対応拡張子の識別、sidecar画像の一貫表示、無効パスの非破壊fallback |
| preset登録 | PathDialog / GroupDialog / ImportDialog | catalog永続化 | 対応type全ての受理、非対応の明示的拒否、二重登録の扱い |
| preset編集 | PresetEditDialog / 各tool dialog | 編集draft→確定→永続化 | draftと永続化の対応、アイコン全typeの編集・preview一貫性 |
| アイコン | IconEditor / glyph / tile / list / directory browser | 永続化icon + 導出iconの単一解決規則 | 「どの画像がそのpresetを表すか」が全表示面で一致 |
| workspace配置 | panel grid / tile | レイアウトsnapshot | 配置・実行・保存・復元の往復整合 |
| group管理 | GroupDialog / group catalog | group永続化 | folder走査→メンバー選択→実行の一貫性 |
| 設定 | Settings dialog | 設定永続化 | offline core不変、未提供機能の非提示 |
| 更新/通知 | UpdateSection / NotificationCenter | feed取得・既読状態 | 提供面のみが動作、未提供面は存在しない |
| オンボーディング/学習 | onboarding / tutorial / help | 既読・dismiss状態 | 初回導線の破綻がない |

## 3. データ・処理の所有境界（再導出）

### 3.1 実在する外部互換性義務

以下だけが「既存構造を維持する」外部根拠になりうる。それ以外の内部構造は再構成可能である。

- **ユーザーデータ形式**: `presets.json`、group定義、workspace snapshot、設定値、public-links cache、thumbnail cache。読み書きの互換と既存データの保護が義務。
- **After Effects への作用**: preset実行が生成するExtendScript/成果物。ユーザーのAEプロジェクトを壊さない。
- **CEP/Manifest**: インストール済みZXP・dev buildのExtension Idとpanel構成。外部ツール（ユーザーのCEP環境、配布済みバージョン）が参照する面は互換対象。
- **公式feed**: GitHub Releases（更新）、静的JSON（通知）。URLとpayload形式は配布契約。
- **License/権利**: MIT、THIRD-PARTY-NOTICES、旧repoからの移植境界。

### 3.2 内部境界（再構成可能）

- `src/shared` / `src/management` / `src/function` の3層は**出発点であり制約ではない**。実行単位（panel / modeless dialog / host script / Rust worker）と配布単位から再導出する。
- module境界の正本は `tools/check/import-boundary.ts` と baseline であり、baselineの残存違反は負債であって仕様ではない。
- 「management→function の index 経由importのみ許可」等の機械的規則は、責務境界の結果として再定義する。

### 3.3 責務の再配置原則

- **単一の事実の所有者**: 「presetとは何か」「アイコンとは何か」「フォルダから何を収集するか」「sidecar画像をどう解決するか」等の規則は一箇所が所有し、全消費者がそれを使う。導出値を永続化する場合は、導出規則と無効化条件を同じ場所で定義する。
- **提供面/未提供面の分離**: 製品が提供すると契約した機能（更新・通知・ローカルコア）だけをコードに残す。未提供機能は「到達不能にする」ではなく「構造ごと撤去」し、将来必要なら新規契約として設計する。利用側が依存していることは維持根拠にしない。
- **UIは操作モデルの投影**: コンポーネントは操作単位（§2）の状態と遷移を表現する。表示面ごとの個別fallback・個別判定を残さない。

## 4. 品質契約（検査の再構成）

テスト件数は品質の証拠ではない。以下を「操作の成立」として検査する。

1. **操作経路の受入**: §2の各操作単位について、「入口→状態遷移→永続化→再表示」の往復をassertする。関数単位の成功で代替しない。
2. **既知反例の拒否と正常受理**: 既知の不具合（JSX非対応・icon経路不一致・layout崩壊・未提供機能残存）を再現するfixtureに対し、修正後の構成が拒否/受理を正しく行うことを、実装非依存の検査で示す。
3. **描画品質の検査**: Storybookのcapture成功ではなく、実DOMの寸法・overflow・重なり・操作状態（hover/focus/selected）をassertする。popoverは配置保証またはportalで `overflow:hidden` 祖先と競合しないことを検査する。
4. **境界の機械的強制**: import境界・未提供import・baseline違反は「残っていてもよい負債」ではなく、増殖を拒否し既存分を計画的に縮小する。
5. **system-qualityの独立証拠**: アンチケース排除・改善関係・最適性候補の優位を、それぞれ別の証拠（静的解析・実行検査・比較検証）で示す。lint成功やreview承認をもって最適性としない。

## 5. #196 計画の再評価（要約）

- 旧計画は「既知4不具合を6 Issueへ分解」する構成だった。要求の単位は不具合ではなく §2 の操作単位であり、分解は操作単位×所有境界で行う。
- 旧計画の「現行修正案 vs 再構成案」比較は妥当だが、再構成案の範囲が既存コードの周辺に留まっていた。§3の原則に照らし、(a) icon解決は「永続化iconと導出iconの層分離」だけでなく「取込・表示・編集・保存を一つの機能契約として所有する」こと、(b) online未提供面は dormant service層を含めて撤去し提供面との依存を切ること、(c) UIはコンポーネント修正ではなく操作モデルの統一として再構成すること、を要求へ格上げする。
- #197〜#199 は「到達不能化・単一owner化」という局所整理に留まる部分があり、要求の単位での受入を満たしていない。コードは再利用するが、受入条件と残存構造の撤去を本書の契約へ合わせて再評価する。
