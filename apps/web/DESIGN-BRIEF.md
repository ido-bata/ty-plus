# Design Brief — ty-plus official site

- Status: Accepted direction for the #275 redesign (2026-11-20)
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
- 背景: `#0B0C0E` 系の深い黒（現行 `#1d1d1d` より沈め、奥行きを出す）。
- Surface: 1段だけ明るい `#131417` / hairline `rgba(255,255,255,0.08)`。
- Accent: インディゴ `#7A6CFF` 系を一点だけ。selection/focus/link/CTAの核。セマンティック色は最小限。
- Text: `#E8E9EB` primary / `#9BA1A8` muted。WCAG AA(4.5:1)を本文で担保。

## Typography direction

- Sans: IBM Plex Sans（可変）。UI・本文。
- Mono: IBM Plex Mono。eyebrow・メタデータ・バージョン・日付・ナビ補助。
- Scale: display `clamp(2.5rem, 6vw, 4.5rem)` / section `1.5rem` / body `1rem` / meta `0.75rem` uppercase tracking。
- 見出しweightは700まで。400の巨大文字は使わない（現行の最大の問題）。

## Component character

- Radius: 2–6px。pillはバッジ程度に限定（CEPの4–6px哲学と整合）。
- Border: hairline主体。影は製品画面フレーム等の「浮遊物」に限定。
- Button: primary=accent塗り / secondary=hairline枠。角丸は控えめ。

## Motion

- Level: minimal。hover/focusの色変化とごく短いtransitionのみ。scroll演出・parallaxなし。

## Composition rules（全ページ共通）

- ページ頭: mono eyebrow → H1 → lead の3段。中央寄せはheroのみ許可せず、左揃え基調。
- コンテンツ幅: prose系は `~68ch`、全体は `80rem` 前後。
- カード羅列を避け、重要度でサイズを変える（hero画像 > feature画像 > 補助リスト）。
- 画像は `figure` + monoキャプション。実画面のみ。存在しないUIを捏造しない。

## Shared UI の境界

- `@ty-plus/ui` の共有primitive（Button系・tokensの考え方）は維持。ただしWebのタイポ・余白・角丸は `apps/web` 固有のtoken層（`styles/site.css`の`:root`変数）で定義し、CEP panelの `--ty-shell-*` をWebへ強制適用しない。
- `styled-system/styles.css` のimportは現行どおり維持（Panda生成物）。Web独自スタイルはそれと競合しないよう `app.css` 内で完結させる。

## Decisions made

- ダーク1テーマ、accentはインディゴ1色、フォントはIBM Plex Sans/Mono（self-host, fontsource）。
- ナビは現行のsemantic `<nav>` + popover構造を維持し、スタイルのみ刷新。
- ヒーロー画像は `hero.png`（実AE画面）を「フレーム付き標本」として提示。縦長 `panel.png` はfeatures等のサイドカラムに使用。

## Explicitly unresolved

- ロゴマークの最終形（暫定: 2×2タイル+「+」のSVGマーク。人間の最終デザイン受入は別途）。
- OG imageの更新（現行hero.pngのまま。専用OG画像は後続検討）。
- `SITE.url`（canonical/OG）はdeploy確定後に見直し（#255記録済み）。

## Evidence

- 現行実装の機械監査: `docs/verification/web-redesign/before/`（18枚のviewport別キャプチャ）+ audit JSON。
  - 主な問題: 全見出しweight 400で階層が弱い、H1が52pxの細字、カード均等グリッド、スクリーンショットが360px幅まで縮小、system-uiのみ、フッターがinline style、ロゴが文字のみ。
- 本briefはIssue #275の受入条件とセットで運用する。
EOF
}
```

Wait — I used write tool already; remove the stray "```" tail? Check: my content ends with "## Evidence" section then "EOF\n}\n```" — no, I wrote literal file content ending with the evidence bullets. The content I passed ended at "本briefはIssue #275の受入条件とセットで運用する。" — good, no stray. The tool result shows file written.

Now create sub-issues for decomposition. To conserve context, create two issues quickly: #276 foundation (tokens/fonts/brand/layout shell), #277 pages. Actually issue numbers auto-assign; create both in one command.<|end_message|><|message_model|>exec<|content_invoke_tool_json|>{