# Design Brief — ty-plus official site

- Status: Accepted direction for the #275 redesign, amended by #280 image audit
- Scope: `apps/web` の6公開ページ。CEPパネルのビジュアル言語は継承対象ではなく、共有するのは primitive（色の一部・コンポーネント契約）のみ。

## Product context

- Category: After Effects向けのプロ向けローカルファースト拡張（CEPパネル）。無料OSS。
- Primary user: AEパワーユーザー・モーションデザイナー。ツールの「中身」ではなく「操作体験」を売るサイト。
- Usage context: 製品理解 → 信頼（実画面・実データ）→ ダウンロード/ドキュメント。
- Defining interaction: 実際のパネル画面が主役。テキストは画面を説明する脇役。

## Design intent

- Emotional register: 精密な計器・スタジオの静けさ。派手さではなく「作り込まれた道具」の信頼感。
- Density: 製品紹介は低密度・大きな余白。リファレンス系ページ（changelog/docs/support）は情報密度を上げる。
- Visual character: ダーク基調、ヘアライン罫線、等幅書体によるメタ情報、非対称グリッド、製品画面の「標本」的提示。

## 比較した方向と採用理由

| 方向 | 概要 | 判定 |
| --- | --- | --- |
| A. Precision Instrument | ダーク + ヘアライン + monoメタ + 非対称構図 + 製品画面主役 | **採用**。プロツールの信頼感と実画面の強さを両立。OSS dev-toolサイト（Vercel/Raycast/Linear系）の作法をAE向けに翻訳できる |
| B. Editorial / light | 明るい紙面・セリフ体・雑誌的 | 不採用。製品UIがダークで、明るいサイトは製品との連続性を失う |
| C. Blueprint / terminal | 方眼・端末的記号の多用 | Aのアクセントとして吸収（グリッド罫・mono label）。全面採用は趣味化しすぎる |

## References（学ぶもの / コピーしないもの）

- **Linear**: コンパクトなタイポ階層、罫線による構造化、装飾を排した密度。ダークパレット自体はコピーしない。
- **Vercel / Geist**: モノスペースのメタ表記、幾何学的なグリッド、黒の深さ。
- **Raycast**: 製品画面を「成果物」として大きく見せる構図、機能を視覚的なまとまりで語る手法。
- **Ableton Live**: 音楽/クリエイティブツールの公式サイトが取る「静かな大きさ」——巨大見出し+実画面、色を絞る。
- **回避**: 汎用SaaSのグラデーション/glassmorphism/中央寄せカード羅列、AI生成テンプレ的な丸角カード+影の反復、絵文字装飾。

## Color direction

- Default mode: dark only（製品がダークUIのため）。`color-scheme: dark` 維持。
- 背景: `#0B0C0E` 系の深い黒（旧 `#1d1d1d` より沈め、奥行きを出す）。
- Surface: 1段だけ明るい `#131417` / hairline `rgb(255 255 255 / 0.08)`。
- Accent: インディゴ `#7A6CFF` 系を一点だけ。selection/focus/link/CTAの核。セマンティック色は最小限。
- Text: `#E8E9EB` primary / `#9BA1A8` muted。WCAG AA(4.5:1)を本文で担保。

## Typography direction

- Sans: IBM Plex Sans（可変）。UI・本文。
- Mono: IBM Plex Mono。eyebrow・メタデータ・バージョン・日付・ナビ補助。
- Scale: display `clamp(2.5rem, 6vw, 4.5rem)` / section `1.5rem` / body `1rem` / meta `0.75rem` uppercase tracking。
- 見出しweightは700まで。400の巨大文字は使わない。

## Component character

- Radius: 2–6px。pillはバッジ程度に限定（CEPの4–6px哲学と整合）。
- Border: hairline主体。影は製品画面フレーム等の「浮遊物」に限定。
- Button: primary=accent塗り / secondary=hairline枠。角丸は控えめ。

## Motion

- Level: minimal。hover/focusの色変化とごく短いtransitionのみ。scroll演出・parallaxなし。

## Composition rules（全ページ共通）

- ページ頭: mono eyebrow → H1 → lead の3段。左揃え基調。
- コンテンツ幅: prose系は `~68ch`、全体は `76rem`。
- カード羅列を避け、重要度でサイズを変える（hero画像 > feature画像 > 補助リスト）。
- 画像は `figure` + monoキャプション。実画面のみ。存在しないUIを捏造しない。
- 同一ページ内で同じスクリーンショットを再利用しない。機能説明と画像内容は `docs/user-guide` の検証済みキャプションを正本として一致させる。

## Product imagery rules（#280 で追加）

- 掲載するのは `docs/user-guide` の検証済み実キャプチャのみ。空のAE開始画面、オンボーディング途中、機能と無関係なウィンドウを製品機能として掲載しない。
- 各画像は説明する機能の「適用後/結果」の状態を優先する（例: プリセットなら適用済み、ウィジェットなら追加済み）。
- キャプションは画像の実内容を述べる。機能名の誇張・捏造をしない。

## Shared UI の境界

- `@ty-plus/ui` の共有primitive（Button系・tokensの考え方）は維持。ただしWebのタイポ・余白・角丸は `apps/web` 固有のtoken層（`src/styles/app.css` の `:root` 変数）で定義し、CEP panelの `--ty-shell-*` をWebへ強制適用しない。
- `styled-system/styles.css` のimportは維持（Panda生成物）。Web独自スタイルは `app.css` 内で完結させる。

## Decisions made

- ダーク1テーマ、accentはインディゴ1色、フォントはIBM Plex Sans/Mono（self-host, fontsource）。
- ナビはsemantic `<nav>` + native popover構造を維持し、スタイルのみ刷新。
- ヒーローは `hero.png`（v0.10.1 実機AE画面）をフレーム付き標本として提示。
- 画像割当は docs キャプション正本に基づく: presets=グループ展開、widgets=Add Widgetダイアログ、settings=Settings dialog、widget-added/easing-applied/ffx-applied/directory-browser/appearance/panels-open=各検証済み状態。

## Explicitly unresolved

- ロゴマークの最終形（暫定: 2×2タイルのSVGマーク。人間の最終デザイン受入は別途）。
- OG imageの更新（現行hero.pngのまま。専用OG画像は後続検討）。
- `SITE.url`（canonical/OG）はdeploy確定後に見直し（#255記録済み）。
- オンライン系画面（Online Preset Library / Messages）の掲載可否は、チャット的UIに見える可能性を考慮し #280 では不使用。必要なら別途検討。

## Revision (#286)

外部レビューを受け「Precision Instrument」の解釈を修正する。計測機器のような無機質な正確さだけでなく、**製品UIそのものが主役になる構図**を優先する。

- ヒーロー画像は「AE画面の中の小さなパネル」ではなく、ワークスペースキャンバスを十分な大きさで見せる実機キャプチャへ変更（検索・イージング・整列・プリセット情報ウィジェットが一望できる構成）。
- 製品画像は実機の永続化済みレイアウトをそのまま撮る。未検証の機能状態を画像で補わない。プリセット未設定の空タイルを「機能紹介」として見せかけることは禁止し、再現不能な状態はテキストのみにする（#287 でシード導線を別途検討）。
- 画像を持たない機能行はテキストのみのコンパクトな行とし、余白で破綻しない情報構造にする。
- Changelog は実データのリリースノート本文から要点を抜粋表示し、全量は折りたたみで提供する。
