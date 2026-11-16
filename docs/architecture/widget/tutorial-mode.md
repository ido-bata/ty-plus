# Widget / 機能チュートリアルモード要件 (Issue #147)

状態: 要件化（spec）。実装は本書の分解に従う別 ticket で行う。

## 目的と非目的

### 目的

- workspace 上の各 widget・各 preset 操作について、「何をするものか」「どう触るか」を
  ユーザーの文脈で提示する手段を定義する。
- 既存の初回 onboarding（`src/function/onboarding/`、10 ステップ wizard）とは別レイヤーの、
  **繰り返し・on-demand に参照できる**ガイダンスを提供する。

### 非目的

- 初回起動 wizard の置き換え・統合（onboarding は初回セットアップ専用として維持する）。
- widget の機能追加・操作仕様の変更。
- オンライン/cloud 依存のコンテンツ配信（offline-core 契約により全コンテンツはローカル同梱）。

## 現状の資産と欠落

存在する:

- 初回 onboarding wizard（`src/function/onboarding/`）。`workspace` / `adding-presets`
  ステップに静的な操作説明を含むが、live UI 上の contextual guidance ではない。
- Add Widget catalog の 1 行説明（`en/widgets.json` の `selector.descriptions.*`）。
- `WidgetDescriptor.descriptionKey?`（`src/function/widget/define.ts`）— optional で
  全 descriptor 未使用の dormant mechanism。
- onboarding 完了の永続化（`src/management/setting/onboarding/`）。

存在しない:

- coach marks / spotlight overlay / product tour / `data-tour` 属性 / per-widget help
  surface / tutorial 既読状態のいずれも未実装。旧 repo にも tutorial 概念はなく、
  本要件は新規構想として定義する。

## 提案する体験モデル

3 つの到達経路を併存させる。単一の「ツアー」に集約しない。

| 経路 | 対象 | 形態 |
| --- | --- | --- |
| A. Widget help | 既存ユーザーの再学習、widget 個別の疑問 | widget tile または widget chrome 上の help affordance から開く per-widget 説明（モーダルまたは inline panel） |
| B. Contextual hint | 初回ユーザーの発見性 | 特定 widget の初回配置・初回操作時に 1 度だけ表示する dismissible hint（spotlight は使わない軽量版） |
| C. Catalog description 強化 | Add Widget 検討中 | 既存 `descriptionKey` を実際に配線し、descriptor ごとの説明を表示。将来の tutorial への導線を兼ねる |

spotlight/coach-mark ツアー（画面を順にハイライトして進める形式）は CEP パネルの
狭い面積と widget の自由配置レイアウトと相性が悪く、実装・保守コストに対して効果が
薄いため **初期スコープから外す**。必要になった場合は A/B の実績を見て再検討する。

## コンテンツモデル

- tutorial/hint コンテンツは widget descriptor または別の step 定義テーブルに保持する。
  候補: `WidgetDescriptor.tutorial?: { summaryKey, steps?: TutorialStep[] }`。
- `TutorialStep` = `{ titleKey, bodyKey, targetSelector? }`。`targetSelector` は
  widget 内の `[data-tutorial-target]` 属性を指し、B の hint が対象 UI を指せるようにする。
- 全文言は i18n resource（既存 10 locale 方針に従う）。日本語を正本として起こし、
  翻訳は既存の locale 運用に乗せる。未翻訳 locale は英語 fallback。
- fixture/サンプル値を実データとして見せない（offline-core の data 誠実性契約を継承）。

## 永続化

- 既読/dismiss 状態は widget instance 単位ではなく **widget 種別 + content version**
  をキーにした軽量フラグとして local storage / settings に保存する。
  widget を複製・再配置しても「一度読んだ案内」が再表示されないことを優先する。
- content version を key に含めることで、説明文を更新した場合に一度だけ再提示できる。
- オフライン完結: ネットワーク・license・account 状態に依存しない。

## 起動・表示契約

- B の hint は widget の初回 mount（その widget 種別で初めて workspace に置かれた時）
  のみ発火し、dismiss/timeout/操作開始のいずれかで消える。再表示は settings の
  「tips を再表示」相当の手段からのみ。
- A の help は明示的なユーザー操作でのみ開き、勝手に割り込まない。
- いずれの UI も既存 ErrorBoundary / surface 縮退の内側に置き、tutorial 側の失敗が
  widget 本体を巻き込まない。

## 実装 ticket 分解（案）

1. `tutorial-content`: `WidgetDescriptor.tutorial` contract + step 定義 + i18n keys
   （全 widget の最低限の summary を整備）。descriptor contract test を追加。
2. `tutorial-persistence`: 既読/dismiss/version の store と settings 連携。
3. `widget-help-surface`: A の help UI（widget chrome への affordance + 説明 panel）。
   Storybook state story（open/closed）と play test を必須とする。
4. `first-run-hints`: B の初回 hint 発火・dismiss・再表示設定。
5. `catalog-description`: C の `descriptionKey` 配線と Add Widget 表示改善。

依存: 1 → 2/3/4/5 は独立。3 と 4 は 1 の contract 確定後に並行可能。

## 受入条件（本 spec に対して）

- onboarding wizard との棲み分けと「置き換えない」範囲が本書で明記されている。
- per-widget content model・永続化方針・i18n 方針が決まっている。
- 実装単位に分解可能な ticket 一覧がある（上記 5 件）。
