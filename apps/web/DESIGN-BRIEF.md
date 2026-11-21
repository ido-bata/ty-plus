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

## Hero variant comparison (#289)

トップページのヒーローについて3案を実装し、ブラウザで描画・計測比較した（証跡: `docs/verification/web-redesign/lab-289/`）。

| 案 | 構図 | desktop製品画像サイズ | 判定 |
|---|---|---|---|
| A 対称分割（従来） | 本文左・画像右の非対称グリッド | 585×350px | 製品UIが小さく認識困難 |
| B プロダクトステージ | 見出しブロックの下に大判製品画像 | 1174×703px | **採用** — 製品UIが約2倍の面積で主役になる |
| C コンタクトシート | 細いコピー列＋製品画像2枚縦積み | 651×390px＋第2画像 | 情報密度は高いが1枚あたりの視認性が不足 |

採用: **B**。製品の魅力を伝えるにはUIの実寸が最優先であり、見出し・CTA・メタ情報はその上のコンパクトなブロックに集約する。モバイルでは横長ワークスペース画像を左側ウィジェット密集領域へクロップし、縮小版ではなく製品寄りの構図を維持する。

## Revision (#291–#293): shared-component design system

「Precision Instrument」をデザイン方針として撤回し、T3 Code (`pingdotgg/t3code`, `docs/internals/web-ui.md`) のUI規律を参考に、**共有コンポーネントと共有トークンだけでサイトを構築する**方針へ転換した。

- 視覚的UIはすべて `@ty-plus/ui` の共有プリミティブ（Button / IconButton / Surface / Badge / Notice / MediaFrame / ScrollArea 等）で構成する。コントロール外観はコンポーネントが所有し、variant/size/tone/slot の型安全APIで選択する。
- `Button` は `as` prop でポリモーフィック描画に対応し、`<Button as={Link}>` / `as="a"` でルーティングリンクに共有外観を適用する（`<a className="btn">` の再実装は禁止）。
- `--site-*` 独自トークン体系とWeb専用のコントロールCSSは廃止。`apps/web/src/styles/app.css` はドキュメントリセットと `--ty-*` テーマ供給（フォントスタックのみ）のみに縮小した。色・文字・余白・角丸・境界線・シャドウは `--ty-*` セマンティックトークン経由。
- 表示用タイポグラフィが必要なため、共有トークンに `ty-text-size-display-md/lg`・`ty-text-size-lead`・`ty-font-mono` を追加（CEPパネルでは未使用。両環境で同一契約）。
- ページ側は `apps/web/src/styles/site.ts` のレイアウトrecipe（css()）と共有コンポーネントのcompositionのみを担当する。装飾目的のeyebrow/番号/罫線要素は削除した。
- 恒久対策として `scripts/check/check-web-design.ts`（Design lint）を `lint` ゲートへ組み込み、rawコントロール・style属性・リテラル色/フォント/角丸/境界線・Web専用トークン・コントロール類似セレクタをTSX ASTとCSS宣言解析で静的に禁止する。allowlist機構で既存違反を管理し、#293 で全違反を解消（0件）。
- 検証: `docs/verification/web-redesign/review-293/`（6ルート×desktop/tablet/mobile、menu-open状態含む、violations 0）。

## Revision (#298–#299): platform split + lint hardening

外部レビューで判明した基盤欠陥を修正した。

- **Panda設定の分離**: root `panda.config.ts` の `sm/md/lg/xl/2xl: 0rem` は CEP パネル（固定サイズ面）がメディアクエリを出さないための意図的仕様だが、Web が同一生成物を消費していたため全レスポンシブvariantが常時適用に退化していた。トークン値を `panda.tokens.ts` に抽出し、root は CEP 専用（0rem 維持）、`apps/web/panda.config.ts` が実ブレークポイント（40/48/64/80/96rem）と Web globalCss を所有する。共有するのはトークン値とコンポーネント実装のみで、レイアウト条件はプラットフォーム毎に分離する。
- **Design lint v2**: `check-web-design.ts` をトークン正本照合へ強化。`DEFINED_VARS`（`themeVarsToCssBlock(DESIGN_TOKENS_DEFAULTS)` の実出力）と `PANDA_TOKENS`（`panda.tokens.ts` のフラット化パス）をレジストリとして、ネストしたレスポンシブ/条件オブジェクト内のリテラル・任意 `--*` 定義/参照・未定義トークンパス・`@ty-plus/ui` への `className`/`css` 上書きを FAIL にする。`packages/ui` は shared モードで走査し、ブレークポイント条件の混入を禁止しつつ raw コントロール実装を許可する。spacing/size リテラルはレイアウト recipe の管轄として意図的に対象外。
- **検証**: `docs/verification/web-redesign/review-298/`（6ルート×desktop/tablet/mobile + menu-open）、中間幅 700/1000/1100px のグリッド遷移を実ブラウザ計測で確認。

## Revision (#302): LP layout system + homepage rebuild

外部レビューで「視覚要素をすべて共有コンポーネントで構築する」制約は過剰と判断された。責務境界を修正する。

- **境界**: Button/Input/Badge 等のコントロール、共有トークン、状態表現は `@ty-plus/ui` が所有する。LP固有のレイアウト・セクション構成・グリッド・ビジュアル演出は Web 側の責務であり、アプリ内UIとマーケティングサイトを同一画面構成へ強制しない。Design lint はこの境界に合わせ、共有UI外観の再実装（`ui-override`）は禁止を維持しつつ、Web固有レイアウト recipe の表現を許可する（spacing/size リテラルは従来どおり recipe 管轄）。

- **参照正本**: `ido-bata/ido-bata.github.io` の `src/styles/recipes.ts`、`src/app/page.tsx`、`.agents/skills/layout-system/SKILL.md`、`references/marketing.md` を Inspect → Extract → Translate → Implement → Verify で確認。抽出した構造ルール: 単一の container 正本（幅+ガター）、用途別サイズ、セクション毎の垂直リズム variant、12カラム grid + span による非対称構成、Grid/Stack/Cluster プリミティブ。色・コピー・個別寸法はコピーしない。

- **レイアウト契約**: `apps/web/src/styles/layout.ts` に Web 専用 recipe として実装。
  - `container({size})`: narrow 48rem / content 72rem / wide 90rem。ページの外幅とガター（1.25/2/2.5rem）の単一正本。Header/Footer も同じ container に揃え、ページ端の整列軸を統一した。
  - `section({variant})`: flow（hero/showcase, py 4→7rem）/ band（標準, 3→5rem）/ prose（参照系, 2.5→3.5rem）/ flush。セクション単位の垂直リズムを recipe が所有し、ページ側で paddingBlock を書かない。
  - `grid({cols,gap})`: 12カラム座標系（mobile は1カラム）。`cols` で対称グリッド（2/3/4）へ切替。
  - `span3..span9`: 12カラム上の span。mobile では全幅へ退避。**Panda の静的抽出はリテラルオブジェクトしか読めないため、関数で値を返す span ヘルパーは禁止**（`css(span(n))` は class 名だけ生成され CSS が出ない欠陥を実測で確認し、リテラル recipe へ変更した）。
  - `stack` / `cluster`: 縦リズムと折返し行。
  - `breakout`: 意図的なフル幅表現のルール（現状未使用。安易な使用は禁止）。
  - `site.ts` はタイポグラフィとコンテンツ primitive（h1-h3/lead/body/link/figure/defList/releaseList 等）に縮小し、`page`/`section`/`pageHead`/`grid`/`cardBody`/`btnRow`/`ctaBand` のページ毎レイアウト recipe は削除した。

- **トップページ再構築**: 縦積みHero＋大判画像＋均等カードの反復を廃止し、セクション毎に異なる構図を共通座標系上に配置した。
  - Hero: 5:7 非対称グリッド（コピー列 + `hero.png` 実機キャプチャ 780×467px@desktop）。
  - Features: 3:9 — 左に section label + 見出し + 本文 + 導線、右に入れ子の text+capture 行2件（Add Widget / Code Preset ダイアログ、各 443×265px）。
  - Showcase: 8:4 — `workspace.png` ワークスペースキャンバス + コピー/CTA。
  - Resources: 密度の高い3カラムグリッドで Download / Docs / Changelog へ誘導。
  - Footer は container(content) でページ端の整列軸に接続。

- **構図案の比較**: 実装した2案をブラウザ描画・DOM計測で比較した（証跡: `docs/verification/web-redesign/lab-302/`）。

  | 案 | 構図 | 特徴 | 判定 |
  |---|---|---|---|
  | A 非対称グリッド | 5:7 Hero → 3:9 Features（右に入れ子行）→ 8:4 Showcase → 3列 Resources | セクション毎に構図と面積配分が異なり、共通の水平・垂直整列軸で接続。docH 2496px@desktop | **採用** |
  | B センタードヒーロー | 中央寄せコピー帯 + 21:9 シネマティックステージ → 3列概要 → 交互 4:8 行 → defList Resources | ヒーローが従来の「コピー→大判画像」縦積みに近く、ステージは hero.png を約28%水平クロップして製品端を切る | 不採用 |

  採用理由: 要求された「セクション毎に異なる構図・共通整列軸」に A が直接対応し、製品画像をクロップなしで実寸提示できる。B の 21:9 クロップは実機画面の端を欠くため不採用。

- **他ページ**: Features は操作体験の説明として 5:7 / 7:5 交互グリッドのフィーチャー行（画像は実機キャプチャのみ）。Download は 4:8 でリリース情報列と OS 別ダウンロードカードへ集中。Docs / Changelog / Support は情報参照ページとして prose リズム + defList/releaseList の高密度構成とし、LP的 Hero や大型ビジュアルを強制しない。6ページが同一テンプレートを共有しない。

- **検証**: `docs/verification/web-redesign/review-302/`（6ルート×desktop/tablet/mobile、menu-open 含む 85枚、overflowX なし）。Desktop 計測: `/` docH=2496、セクション高 720/733/425/286 でリズムに変化あり。Typecheck / lint（biome + design lint 0 violations）/ `check-web-design.test.ts` 10 pass / `vite build`（7ページ prerender）成功。

- **未決**: 最終ビジュアル受入は外部レビュー待ち。`release-0-12-0 → main`・本番公開は行わない。

## Revision (#306): Notice content contract + product-first LP

外部レビューで共有 Notice の表示不具合と、製品ビジュアル・LP構成の不合格が指摘された。

- **Notice の子構造契約**: ルートは `display:flex` のまま、children を単一の content block（`flex:1; min-width:0`）で包む。テキスト・インラインリンク・複数段落・アイコン・アクションは通常の文書フローで描画され、flex item として分断されない。見た目は引き続き `@ty-plus/ui` が所有し、Web 側で workaround しない。契約は `Notice.test.tsx`（unit）と `Notice.stories.tsx` の `RichContent`（Storybook play 関数）で固定した。
- **Hero の製品ファースト化**: 5:7 の比率自体を目的にせず、コピー/アクション/メタ情報のコンパクトな帯の下に `hero.png` を content 幅いっぱいで提示する構成へ変更。モバイルは `object-fit: cover` + `4/3` crop で左側のウィジェット密集領域を優先する。
- **Features の画像-説明対応**: 同一種類のスクリーンショットの単純交互をやめ、機能ごとに対応する実機キャプチャと媒体幅（wide / std）を割り当てる。説明のない未検証画像は使わない。
- **比率の扱い**: 5:7 / 3:9 / 8:4 は座標系上の表現手段であり目標ではない。面積配分・余白・タイポグラフィ・画像倍率はブラウザ実画面で評価する。

## Revision (#309): real product-state captures + LP recomposition

外部レビューで「Hero の画像サイズ・列比率の反復ではなく、製品の利用体験を視覚的に説明する構成」が要求された。

- **撮影環境**: `scripts/verify/web-product-capture.ts` を追加。`scripts/verify/e2e` の E2EContext/CDP 基盤を再利用し、managed root を snapshot → `workspaces/workspace-1.json` の gridCells に `presets/presets.json` のカタログIDを持つプリセットタイルをシード → パネルを reload → スクロール位置別の実画面を `Page.captureScreenshot` で取得 → Local Presets / Add Widget ダイアログを実際に開いて撮影 → managed root を restore。捏造したUI状態は使わない。#287 の初期状態問題に対し、カタログ登録済みプリセットを gridCells の id 参照でタイル化する fixture 手法を確立した（レイアウト項目の type はカタログ lookup で解決される既存契約）。
- **実画像**: `hero.png` / `workspace.png` / `preset-tiles.png`（新規）/ `add-widget.png` / `preset-dialog.png` を、After Effects 2026 + `app.ty-plus.dev` パネル（1706×1022 CSS px、Retina 2x）からの実機 CDP キャプチャへ差し替え。撮影条件・対象SHAは `docs/verification/web-redesign/` の記録に従う。
- **LP 再構成**: Hero はコピーrail(span5) + プリセットタイル入りワークスペース実写(span7) の非対称分割。Workspace 帯は utility widget 領域のワイド提示(span8+span4)。Features 帯は Local Presets と Add Widget の2ダイアログを入れ子2列で並置し、同種スクリーンショットの積層をやめた。モバイルではコピー→画像→CTAの順で製品ビジュアルを早期に提示する。
- **capture-meta 修正**: `capture-screens.ts` が `commitSha` に加えて `sourceTree.dirty` / `dirtyPaths` を記録し、`--require-clean` で未コミット差分がある場合は撮影を拒否する。

## Revision (#319): identifiable product assets + honest DOM order

review-309 で「プリセットタイルが同一の低コントラストカーブで識別不能」「モバイル順序の報告と実装の不一致」が指摘された。製品側の問題は #316 / PR #318 で分離して修正し、本 Revision は素材と構図のみを扱う。

- **素材**: #316 の fixture（退化 canvas アイコンを title text へ正規化 + `data-preset-id` 識別 assert + CDP 実ポインタ hover 検証）で再撮影した実機キャプチャへ差替。`hero.png` / `preset-tiles.png` / `workspace.png` / `preset-dialog.png` は名前付きプリセットタイルと利用者向けオフライン通知を含む。`add-widget.png` は既存の実機キャプチャを維持。
- **Hero の DOM 順序**: グリッド子要素を copy / figure / actions の3要素に分割。DOM 順は全 viewport で copy → image → actions（モバイルは CTA が画像の後）。md+ では figure が左右2行を span し、copy/actions が左 rail を構成する。前回報告した「コピー→画像→CTA」と実装を一致させた。
- **セクション構図の差別化**: Workspace 帯は説明 rail(span4) → 画像(span8) の読み順へ反転。Features 帯は左 rail を廃し、全幅ヘッダ + キャプション付き2ダイアログ横並びへ変更（各 surface に名前を付与）。Resources の3列グリッドは維持。
- **Features 行**: flagship を「Preset tiles from your catalog」（preset-tiles.png, wide）へ変更。`mediaSpan: "narrow"`（text span7 / media span5）を追加し行毎の密度を変化。featureRow / orderFirst のブレークポイントを span 系と同じ `md` に揃え、md–lg 帯での潜在的な暗黙カラム生成を解消。

## Revision (#328): verified state-transition material, role-separated crops

#322 / PR #326 で hover→info widget・Shift+click 選択・プレーンクリック実行（Effect Parade 差分検証済み）の実機キャプチャが確立された。本 Revision はその検証済み成果のみを素材化し、機能ごとに異なる情報役割を持つ領域cropへ分解する。

- **素材の役割分離**: `preset-grid.png`（名前付きプリセットタイル行、Hero/flagship）、`preset-selected.png`（選択タイル + info widget の関係、専用「Hover, select, run」セクション/行）、`workspace-widgets.png`（utility widget 帯）、`presets-dialog.png`（Local Presets 実ダイアログ）。同一ワークスペース画像の使い回しを廃止。
- **正直な検証範囲の明記**: コピーと figcaption で「hover で info widget に詳細、Shift+click で選択、プレーンクリックで実行（実プロジェクトで検証済み）」を記述。タイルアイコンは撮影 fixture が設定した説明用グリフであり、実 `.ffx` の動作を可視化したものではない旨を明記。実行の視覚的 Before/After は未取得のため捏造しない。
- **未解決の分離**: Add Widget ダイアログは CEP ホストが新規 modeless extension を spawn しない環境ブロッカー（#322 記録済み）のため既存検証済み `add-widget.png` を継続使用。LP 収束を妨げない。

## Revision (#331): product UI components rendered on the web

スクリーンショット依存を部分的に脱却し、モノレポの実装をWebで直接再利用する第一歩。

- **再利用経路**: `@ty-plus/product` エイリアス（vite + tsconfig paths）で `src/` 配下の製品モジュールを Web から import 可能にした。現時点の採用対象は `CanvasEasingIcon`（canvas 描画のみ・ホスト非依存）のみ。Tile / glyph / workspace grid / dialogs は storage・widget runtime・i18n・CEP transport へ依存するため、ホストアダプタ分離が済むまでスクリーンショットを併用する（後続 Issue で分解予定）。
- **Web デモ**: `components/PresetStage.tsx` — 製品の `CanvasEasingIcon` で描くプリセットタイル群 + 選択状態（ローカル React state）+ info readout。`lib/demo-presets.ts` の easing 曲線は fixture 定義の説明用グリフであり、実 `.ffx` 解析結果ではないことをコピーで明記。AE 実行は Web では偽装しない。
- **Hero**: スクリーンショットを `PresetRail`（実イージングアイコンの staggered 構成）へ置換。DOM 順 copy → visual → actions を維持。
- **Interaction セクション**: `preset-selected.png` を廃し、操作可能な `PresetStage` へ置換。実機検証済みの状態遷移（hover/Shift+click/実行）はコピーで説明し、Web 側は選択状態のみを実装。
- **Features**: `featureRow` テンプレートの反復をやめ、flagship を全幅 `PresetStage` バンド、以降は media 位置・span・密度の異なる非対称行 + text-only 行へ再構成。
- **スクリーンショットの残存用途**: workspace 全体・実ダイアログ・選択状態の実機関係性は、Web 非対応コンポーネントの証拠として引き続き使用。

## Revision (#333): real preset tile layer shared with the product

`PresetStage` の Web 専用再実装をやめ、製品の preset tile レンダラを直接利用する。

- **モジュール分割**: `glyph.tsx` から catalog id 解決（`getPreset` → storage/CEP 依存）を行う `PresetGlyphById` を `glyph-by-id.tsx` へ分離。`glyph.tsx` は `PresetCatalogGlyphHost` / `FramedPresetGlyph` / `WorkspacePresetGlyph` のみを持ち、ホスト非依存になった。`preset/index.ts` と `ListDialog.tsx` の import を更新し、`ListDialog.issue145.test.tsx` の mock 対象も追従。
- **Web 解決経路**: vite に `@/…` → `src/` の catch-all alias（`@/styled-system` より後段）を追加し、製品モジュール内部の `@/management/…` import を解決。web panda.config の include に `../../src/**` を追加し、製品側 `css()` クラスを web バンドルへ生成。vitest.config にも `@ty-plus/product` alias を追加。
- **再利用した実装**: `Tile`（`data-preset-id` + hover 通知）→ `PresetCatalogGlyphHost` → `WorkspacePresetGlyph` → `resolveWorkspaceGlyphIconVisual` → `CanvasEasingIcon`。デモ preset は実 `Preset` contract オブジェクトで、icon は製品の `presetIconCanvas` で構築（canvas 曲線は fixture 定義の説明用グリフと明記）。
- **状態モデル**: 選択（ローカル state）を初期値ありで表示し、hover は製品と同じ precedence（selection → hover fallback）で info readout に反映。AE 実行は Web では偽装しない。
- **契約テスト**: `PresetStage.contract.test.tsx` が製品 `Tile` の SSR 出力に `data-preset-id` / `ws-preset-icon--canvas` / `<canvas>` が含まれることを assert — Web 側の模倣実装への退行を検出する。
- **修正**: Hero の `PresetRail` で使っていた `translateY` stagger が figcaption と重なっていた問題を、transform 撤去で解消（DOM 計測で overlap=false を確認）。
- **残課題**: Info Widget 本体・Workspace Grid・ダイアログの再利用は widget runtime / workspace state 依存のため #333 の後続段階。スクリーンショットはそれらの実機証拠として継続使用。
