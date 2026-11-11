# 固有名詞ポリシー

この文書は、ty-plus の翻訳作業における **固有名詞** (各言語でうかつに訳すとアイデンティティが壊れる語) の扱いを固定する。
新規翻訳の追加や既存翻訳の修正は、必ずこのポリシーに照らして行う。

## 1. 分類

### 1.1 完全英語ロック (全言語で英字のまま)

これらの語は **どの言語でも英語のまま** 表示する。カタカナ・翻字・部分翻訳を **しない**。

| 語 | 用途 |
| --- | --- |
| `ty-plus` | プロダクト名 |
| `After Effects` | ホスト名 (常に大文字小文字を維持) |
| `Comp` / `Composition` | AE のコンポジション。短縮形 `Comp` を主に使う |
| `Footage` | AE のフッテージ |
| `Keyframe` | AE のキーフレーム |
| `Expression` | AE のエクスプレッション (単数形) |
| `cubic-bezier` | ホスト easing の技術形式名 |
| `evalScript` | ExtendScript API 名 |
| `appRoot` | ExtendScript から取得する app root パス変数 |
| `evalScript` / `CSInterface` / `CEP` | Adobe CEP 由来の API / 環境名 |
| `JSX` / `.jsx` | ExtendScript のファイル形式 |

> **根拠**: これらはホストや製品の固有名詞であり、翻訳するとユーザーとドキュメント・コミュニティ間の語彙が乖離する。

### 1.2 言語別 canonical (英語同形を原則、言語ごとに 1 つだけ例外を許可)

英語表記が canonical だが、各言語で **1 つだけ** 認める表記揺れを `canonical.<locale>` に定義する。
英語 (`en`) はそのまま英字。他の言語は英語表記を **そのまま使う** か、定義された 1 つの canonical 表記の **どちらか** を採用する。

| canonical key | en | de | fr | es | it | pt | ru | zh | ja | ko |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Easing` | `Easing` | `Easing` | `Easing` | `Easing` | `Easing` | `Easing` | `Easing` | `Easing` | `イージング` | `이징` |
| `Anchor point` | `Anchor point` | `Anchor point` | `Anchor point` | `Anchor point` | `Anchor point` | `Anchor point` | `Anchor point` | `Anchor point` | `アンカーポイント` | `앵커 포인트` |
| `Layout lock` | `Layout lock` | `Layout lock` | `Layout lock` | `Layout lock` | `Layout lock` | `Layout lock` | `Layout lock` | `Layout lock` | `レイアウトロック` | `레이아웃 잠금` |
| `Quick actions` | `Quick actions` | `Quick actions` | `Quick actions` | `Quick actions` | `Quick actions` | `Quick actions` | `Quick actions` | `Quick actions` | `クイックアクション` | `빠른 작업` |
| `Directory browser` | `Directory browser` | `Directory browser` | `Directory browser` | `Directory browser` | `Directory browser` | `Directory browser` | `Directory browser` | `Directory browser` | `ディレクトリブラウザ` | `디렉터리 브라우저` |
| `Font viewer` | `Font viewer` | `Font viewer` | `Font viewer` | `Font viewer` | `Font viewer` | `Font viewer` | `Font viewer` | `Font viewer` | `フォントビューワー` | `폰트 뷰어` |
| `FX search` | `FX search` | `FX search` | `FX search` | `FX search` | `FX search` | `FX search` | `FX search` | `FX search` | `FX 検索` | `FX 검색` |
| `Info` | `Info` | `Info` | `Info` | `Info` | `Info` | `Info` | `Info` | `Info` | `情報` | `정보` |
| `Preset` | `Preset` | `Preset` | `Preset` | `Preset` | `Preset` | `Preset` | `Preset` | `Preset` | `プリセット` | `프리셋` |
| `Widget` | `Widget` | `Widget` | `Widget` | `Widget` | `Widget` | `Widget` | `Widget` | `Widget` | `ウィジェット` | `위젯` |
| `Workspace` | `Workspace` | `Workspace` | `Workspace` | `Workspace` | `Workspace` | `Workspace` | `Workspace` | `Workspace` | `ワークスペース` | `워크스페이스` |
| `Panel` | `Panel` | `Panel` | `Panel` | `Panel` | `Panel` | `Panel` | `Panel` | `Panel` | `パネル` | `패널` |
| `Dialog` | `Dialog` | `Dialog` | `Dialog` | `Dialog` | `Dialog` | `Dialog` | `Dialog` | `Dialog` | `ダイアログ` | `대화상자` |

> **禁止されている表記** (例 — `Easing` の場合):
> - ハイブリッド形: `courbes d'easing`, `кривых сглаживания`, `缓动曲线` などの **部分翻訳 + 英語混在** は禁止
> - フル翻訳: 上記テーブルにないフルカタカナ・フル翻訳は禁止 (例: `Easing` を全言語で `이징` 以外にする等)
> - 旧表記の混在: 1 つのファイル内で `Easing` と `Ease-Kurven` が同居することは禁止

### 1.3 文脈依存 (翻訳してよいが統一する)

以下の語は **翻訳してよい** が、ファイル間で表記を統一する:

| キー | en 原文 | 翻訳方針 |
| --- | --- | --- |
| `presets:presetTool.animation.title` | `Animation Preset` | 言語ごとに自然な訳を 1 つ採用 |
| `presets:presetTool.code.title` | `Code Preset` | 同上 |
| `presets:presetTool.layerComp.title` | `Layer / Comp Preset` | 必ず "Layer / Comp" の **スペースあり** 形式で固定。短縮形 `layerCompLabel` は `Layer/Comp` スペースなしでカタログ内部キーに使う |
| `presets:presetTool.footage.title` | `Footage Preset` | `Footage` は 1.1 により英語ロック。`Preset` 部分を翻訳する |
| `presets:presetTool.easing.title` | `Easing Preset` | `Easing` は 1.2 の canonical を使う。`Preset` 部分を翻訳する |
| `presets:edit.title` | `Edit Preset` | 編集ダイアログのタイトル。タイプ別のサフィックスは `presets:edit.titleForType.{preset\|script\|footage\|plugin}` で参照 |

## 2. 機械的 enforce

`scripts/check/check-i18n-locked-terms.ts` がこのテーブルの canonical を機械的に検査する。

- 1.1 の語がロケールファイルに存在し、かつ英語原文と一致しない場合 → **エラー**
- 1.2 の語の値が canonical テーブルにない場合 → **エラー**
- 1.3 の語はテーブルに列挙しない (翻訳自由)

## 3. 例外申請

canonical を逸脱する必要がある場合 (例: マーケ要件で全言語統一の英語表記が必要) は、本ファイル §1.2 の該当行を更新し、PR description に「canonical 変更の理由」を記載する。承認なく逸脱した翻訳は CI でブロックされる。

## 4. 翻訳追加時のワークフロー

1. `en/<namespace>.json` に英語原文を追加
2. 1.1 / 1.2 / 1.3 のどれに該当する語かを確認
3. 1.1 / 1.2 の場合は本ポリシーの該当行を更新してから翻訳
4. 残り 9 言語のロケールファイルに翻訳を埋める (`bun run scripts/check/check-i18n-locale-coverage.ts` で確認)
5. `bun run scripts/check/check-i18n-locked-terms.ts` で canonical 違反がないことを確認
6. `bun run lint` で静的検査全体 green を確認

## 5. en key-set canonical

`src/management/i18n/locales/en/` は key 集合の source of truth である。

- 9 locale は en と同一 namespace・同一 leaf key 集合を持つ。余分な key（他 namespace の複製を含む）は持たない。
- `t()` が参照する static literal key は en に存在しなければならない。動的組み立て key は対象外。
- 機械的強制は `bun run scripts/check/check-i18n-locale-coverage.ts --strict-en-canonical`。未訳値は `TODO: ` prefix で置く。
