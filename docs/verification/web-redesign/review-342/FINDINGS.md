# #342 PresetStage 操作・フィードバック再設計 — 検証記録

対象: `apps/web/src/components/PresetStage.tsx`（index ヒーロー / features flagship の両方で共有）。
撮影: `apps/web/scripts/capture-preset-stage.ts`（状態遷移対応の新規スクリプト。#345 のリリースゲートでも再利用可能）と `capture-screens.ts`（ページ全体のリグレッション確認用）。

## 変更概要

### 操作モデル（実製品 `src/management/workspace/events/handler.ts` 準拠）

| ジェスチャー | 製品 | Web デモ |
|---|---|---|
| プレーンクリック | `executePreset` で適用（選択不変） | 選択は変えず、info surface 下部に「in the panel a plain click applies this preset to the active layer」の注記を表示（AE 実行は偽装しない） |
| Ctrl/Cmd+click | 選択トグル | 同じ（`toggleSelected`） |
| Shift+click | 選択へ追加 | 同じ（`addSelected`。既選択は重複追加しない） |
| グリッド背景クリック | 選択全解除 | 同じ（`data-preset-tile` / `data-info-card` 以外へのプレーンクリックで解除） |
| hover | `presetHoverId` → info widget hover source | 同じ。選択がある間は selection が優先（製品と同じ precedence） |
| 選択解除後 | 直前の非空 items を保持（sticky） | 同じ（`sticky` state が `PresetInfoWidget` の `presetInfoLast` を再現） |
| coarse pointer（タッチ） | 該当なし（CEP パネルはデスクトップ前提） | タップ = 選択トグル（inspect ジェスチャー）。footer copy で demo scope を明示し、プレーンクリック=適用の契約と混同しない |

### viewport 別レイアウト

- **desktop（lg+, ≥1024px）**: タイル 4列×3行の左列（3fr）+ info surface 右カラム（2fr）。カードは `align-items: stretch` でグリッド高さいっぱいに伸び、body は `margin-block: auto` で縦中央、footer（適用注記・操作ヒント・免責）を下端に固定。先頭に mode Badge（`selected` / `N selected` / `hover` / `empty`、selection 時は accent）を追加し、従来の「コンテンツが上部に固まる」問題を解消。
- **tablet / mobile（<lg）**: info card をタイルグリッドの **flow 内に挿入**。`tileGrid` を `display: contents` にして tileBox とカードを stage グリッドの同一座標系に置き、`order`（ref 経由で `style.order` を設定。JSX `style` 属性は design lint 禁止のため）で「内容を生んだタイルの直後」にカードを配置する。アンカーは「最後に選択されたタイル → hover 中タイル → 直前の位置（sticky）」の順で決まる。12タイルを全て走査してからパネルが現れる従来構造を解消し、タップ/選択したタイルの結果が物理的に隣接する。
- タイルは `scroll-margin-top: 5rem` を追加し、sticky サイトヘッダ（64px）との干渉を回避（Playwright の scroll-into-view と実利用のアンカー遷移の両方に効く）。

### 共有コンポーネント

- `PresetTileButton` / `PresetInfoBody` / `WorkspaceTileFrame` の render 経路は不変。`PresetTileButton.onSelect` の型を `(ev: MouseEvent<HTMLButtonElement>) => void` に拡張（後方互換の widening）し、修飾キー判定を本物の `<button>` の click event で行う。div への onClick 委譲を廃止したため、キーボード操作（Enter/Space）も同一経路を通る。
- demo preset に `description` / `filePath` を追加し info card の内容を実用的にした（デモデータである旨は従来どおりコピーで明記）。

## 証跡

### `stage/` — PresetStage 状態遷移（`final-*`、commit `7f437fa5`、clean tree）

- desktop（1440×900, pointer:fine）: `initial`（seed 単一選択）/ `hover`（選択解除後の hover source）/ `multi`（Ctrl/Cmd+click 2枚 → multi mode）/ `cleared`（全解除 → sticky items 残留、`pressedCount:0`）/ `applied`（プレーンクリック → apply 注記、`applyNote:true`）
- tablet（834×1112, hasTouch → pointer:coarse）: `initial` / `tap-selected` / `tap-multi` / `tap-cleared`
- mobile（390×844, hasTouch → pointer:coarse）: 同上
- 各ルート（`/` ヒーロー、`/features` flagship）× 3 viewport。`capture-meta.json` に pointer 判定・`data-mode`・`aria-pressed="true"` 数・apply 注記有無・scrollY を記録。

### `pages/` — ページ全体のリグレッション（`page-*`、同 commit）

- `capture-screens.ts` 全6ルート×3viewport+menu-open を `/tmp/screens-342` で撮影し、index/features の代表セクションのみ複製。menu visibility check は全件 pass（violations 0）。

## DOM 実測（Playwright、`/tmp/probe-*.ts`）

- desktop: stage 897×394、tileGrid 529×394（4列、tile 123×123px）、infoCard x=1047 w=353 h=394（グリッド高さいっぱいに stretch）。
- mobile: stage 350×715、tileGrid は display:contents で stage グリッドに参加、tile 109×109px。infoCard は `order` により seed tile（index2）の直後の行に full-width で挿入されることを座標計測で確認（initial: cardTop=253、row1 終端直下）。
- pointer ヒント: desktop では fine 用コピーのみ `display:block`、mobile では coarse 用コピーのみ表示（`hidden` 属性 + mount 後の matchMedia 解決。SSR/prerender では両方 hidden で hydration mismatch なし）。

## VL モデルレビュー（`opencode/nemotron-3.5-super-vl-free`）と採否

| 指摘 | 判定 |
|---|---|
| desktop: 選択タイルと info card の対応が border 色頼みで「moderate」 | **許容**。製品パネルでも info widget はグリッド脇の別 surface であり、選択リングが唯一のリンク手段。Web 側で製品外の強調を足すと fork になるため現状維持 |
| desktop applied: hover 中タイルに視覚マーカーがなく「どのタイルか不明瞭」 | **許容**。hover は製品でも選択を変えない一時状態。apply 注記が feedback の本体 |
| mobile multi: 「2 selected」だが見える範囲の選択タイルが1枚に見える | **許容**。複数選択タイルは別行にあり各々に選択リングが付く。info card は両プリセット名を列挙しており内容は正しい |
| tablet/mobile: info card がタイルグリッドの行間に挿入され「broken grid」に見える | **意図的構造として維持**。カードは独立した surface（panel 背景・hairline border・角丸）で info panel として認識可能。DOM 計測で重なり・クリップはなく、要件の「タッチしたタイルに結果が隣接」を最も直接的に満たす |
| mobile sec-0: 「3タイルしか見えず途中で切れている」 | **誤検出**。section 高さキャプチャの viewport crop であり、グリッドは下に続く |
| desktop hero: カード内の垂直余白 | **意図的**。body 縦中央寄せ + footer 下端固定の構成。製品 info widget の余白感と同系 |

## 既知の制約・申し送り（#343 Features 向け）

- `PresetStage` の props は `{ presets?: Preset[] }` のまま変更なし。両 consumer は無修正で動く。
- coarse pointer ではタップ=選択トグル（複数選択も可能）。プレーンクリック=適用は fine pointer のみの再現で、タッチでは footer copy が demo scope を説明する。
- Shift+ドラッグ矩形選択・グループタイル開閉・widget タイルはデモ対象外（従来どおり）。
- 選択解除後は sticky items が残るため「完全な empty 状態」は seed 選択がある限り到達しない（製品と同じ sticky 契約）。
- `PresetTileButton.onSelect` は MouseEvent を受け取る型に拡張済み。製品側でこの props を使う他の呼び出しは存在しない（rg 確認済み）。
- `capture-preset-stage.ts` は `data-preset-stage` / `data-preset-tile` / `data-info-card` / `data-apply-note` の deterministic selector に依存。#345 で再利用する際はこの属性名を変更しないこと。
