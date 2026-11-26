# UI/UX ロールバック解消の実機視覚検証 (release-0-14-0, Issue #591 系)

`release-0-14-0` に merge された UI 修正群について、Storybook / unit test
だけでなく After Effects 実機 (macOS / AE2026 26.5.3) 上の dev bundle
(`app.ty-plus.dev` → `dist/cep-dev`、HEAD `493cdc36` 時点の build) で
描画・操作結果を確認した記録。

> **ホストに関する注意**: 検証時に AE2026 (pid 55912) と AE2027 (pid 65119)
> の両方が起動しており、`.debug` の debug port (31010–) は先に bind した
> **AE2026 側の CEPHtmlEngine が占有**していた (`lsof` で確認)。
> したがって本記録の実機確認は全て AE2026 / 26.5.3 上の描画である。
> AE2027 側の panel は同一 dev bundle を読み込んでいるが CDP port が
> 衝突しており、本記録の DOM 検査は AE2027 では未実施。

## 環境・手法

- AE2026 (pid 55912) に Window > Extensions から dev panel 1–5 と
  modeless dialog 群を起動。`.debug` の debug port (panel1=31010、
  widget-selector=31030、preset-edit=31024、settings=31029 等) 経由で
  CDP (`Runtime.evaluate` / `Page.captureScreenshot`) を使用。
- 判定は DOM の computed style・矩形・テキスト構造に対する機械的検査と、
  `Page.captureScreenshot` の証跡画像の組み合わせ。画像の目視評価は
  本記録の対象外 (別途視覚レビューで実施)。

## 実機で確認した修正

| Issue | 修正 | 実機での確認内容 |
| --- | --- | --- |
| #670 | align 対象切替行を常時表示・下部固定 | panel1 の align widget で対象ボタン 4 個が target=time でも描画され続けることを DOM で確認 (`align-target-row.png`) |
| #668 / #685 | Quick Actions パレットの dropdown を検索フィールド直下に固定 | widget tile `8f89155e` で検索 focus 後、portal dropdown が input 下端 +4px・tile 幅一致で出現 (top=210 / input bottom=208 / w=338) |
| #675 | FontViewer compact 幅で結果ペインが潰れない | font viewer tile 内に `w_min(34%,12rem)` + `flex-sh_0` + `min-w_0` の結果ペインが実描画 (160px)、font row 265 件 |
| #677 | WidgetTutorialLayer の tooltip を widget 領域基準に | panel1 で tutorial bubble「Shape the cycle」が widget highlight (518,722,346x191) 直上 (566,621) に表示 |
| #679 | RangeField のラベル値二重表示を解消 | settings `#component-preview` の「Slider with numeric input」でラベルは名前のみ、NumberField の aria-label が `... value %`、unit `%` は 1 箇所のみ (`settings-component-preview.png`) |
| #680 | StatusBar の badge / aria-label / status text | panel1 status bar に「After Effects」+ 件数 badge (1 / 36) と全ボタンの aria-label を確認 |
| #673 | preset type badge の単語途中 wrap 解消 | preset list dialog の glyph が 5 grapheme 名称で 1 行 (h=16px = font-size) に収まることを確認。group edit dialog の FFX badge 301 件も全て単一行 (h=16px) (`preset-list-badges.png`, `group-edit-members.png`) |
| #674 | dialog footer の水平 inset を shell primitive に統一 | settings dialog と preset edit dialog の `footer[data-dialog-footer]` で `padding-inline: 8px` (= `--ty-shell-pad-inline`) を確認 |
| #681 | preset edit dialog の error kind 区別 | preset edit dialog (31024) が正常系で開き、Cancel/Delete/Save が有効・footer inset 正常 (`preset-edit-dialog.png`)。失敗系 (delete 失敗後の retry) は unit test で担保 |
| #684 | 折りたたみ時 control panel の展開 affordance | panel2–5 は既定で collapsed 描画。`[data-cp]` に `data-collapsed="true"` + `ty.ctx.cp.toggle-collapse` IconButton (ChevronsUpDown) が存在し、click で 20x20 → 164x38 に展開・6 ボタン表示を確認 |
| #676 | group catalog tile の keyline / count badge | group preset「Verify Group」(300 members) を作成し workspace catalog tile で確認。surface は `inset:1px` + `1px solid border.subtle` + `surface.widget`、badge は「99+」chip (surface.dialog / border.subtle / radius full) (`group-catalog-tile.png`) |
| #686 | MembersSection の path key 安定化 | group preset edit dialog で MEMBER PRESETS (300) が描画され、各行に FFX badge + 名前を確認。300 行で render 破綻なし (`group-edit-members.png`)。key 安定性自体は unit test で担保 |

## コード・テストで担保し実機未踏の項目

| Issue | 内容 | 状態 |
| --- | --- | --- |
| #672 | Loop wave の label obstacle sampling (`waveLabelObstacles`) | canvas 描画のため DOM 検査不可。`loop-wave-labels.png` を証跡として保存。配置ロジックは unit test で担保 |
| #682 | `.debug` port band 修正 | build 時の port 採番であり、今回の build (31010–31031) が ephemeral range (49152+) を避けていることを `.debug` で確認済み |

## 証跡ファイル

| ファイル | 内容 |
| --- | --- |
| `workspace-panel.png` | panel1 全体 (16 widget tile 配置、status bar) |
| `loop-wave-labels.png` | Loop widget の wave canvas (clip) |
| `preset-edit-dialog.png` | preset edit dialog (ICON Text/Emoji/Image、footer) |
| `preset-list-badges.png` | preset list dialog (glyph + type 表記) |
| `settings-component-preview.png` | settings Component Preview (RangeField 等) |
| `align-target-row.png` | align widget の対象切替行 |
| `widget-selector.png` | Add widget modeless dialog |
| `group-catalog-tile.png` | workspace catalog の group tile (FFX + 99+ badge) |
| `group-edit-members.png` | group preset edit dialog (MEMBER PRESETS 300) |
| `cef-font-floor-glyphs-0-14-0.png` | preset catalog dialog の text glyph 310 件 (#704 修正後、10px+scale 描画) |

## 追記: CEF 描画制約の修正検証 (#700 / #701 / #704)

#665 の実機 DOM 監査で発見した CEF 固有の 2 制約について、修正 merge 後の
build (`909c2a89`、`dist/cep-dev`) で AE2026 実機再検証を実施した。

### #700: container query 無効 → px 実測 fit

- `CSS.supports('container-type','inline-size')` / `CSS.supports('width','1cqi')`
  が本番 CEF (Chromium 99 系) で共に `false` であることを再確認。
- 修正後は glyph の font-size / borderRadius を JS 実測 px + CSS custom
  property (`--ws-glyph-text-font-px`) 経由で適用するため、container query
  非対応環境でも値が落ちない。

### #704: font-size 10px フロア → 10px 描画 + transform scale

- CEF は computed font-size を ~10px 未満にできない (inline
  `font-size:3px` でも computed は `10px`)。#700 の fit 値が 10px 未満に
  なるケースで文字が overflow する問題を、`resolveFittedTextFont` で
  「10px 描画 + `transform: scale(desired/10)`」に分解して解消。
- **実機確認**: preset catalog dialog (`dialog-presets`) に実 preset
  310 件分の text glyph が描画され、全件で `--ws-glyph-text-font-px=10`、
  `--ws-glyph-text-scale` = 0.343–0.396、wrapper に
  `transform: matrix(scale,…)` が適用されていることを DOM で確認。
  全 glyph の行が frame 内に収まり (`inside=true`)、text clip なし
  (`badLines=0`)。証跡: `cef-font-floor-glyphs-0-14-0.png`。
- #701 (preset/group 削除後の ghost info widget) は #703 で修正済み。
  削除後の info widget 残留は本検証では preset 削除を再実施していない
  ため unit test 担保の範囲。

## 残件

- #672 の label 配置は canvas 描画のため DOM 検査が効かず、
  `loop-wave-labels.png` の証跡 + unit test が現状の保証範囲。
- 検証用に作成した group preset「Verify Group」(300 members) は
  preset list dialog から削除済み (native confirm dialog
  「Delete group "Verify Group"? This cannot be undone.」の Yes を
  AX 経由で押下。`presets.json` から消失・孤立 .ffx なしを確認)。
- **AE2027 での同項目検証は未実施**。両 AE 同時起動時は `.debug` port が
  衝突するため、AE2027 側を検証するには AE2026 の dev panel を閉じるか
  port 割当を分離する必要がある (#682 の port band は 31010– 固定のため
  同一マシン複数 AE ホストでは常に先勝ち)。
- Windows 実機での同項目検証は未実施 (v0.13.1 配布物検証は
  `distributed-0-13-1/` を参照)。
- 副次的観察: preset/group の削除確認は `window.confirm`
  (`src/management/preset/delete-confirm.ts`) で、CEF では **native
  modal dialog** として描画され応答まで renderer 全体 (CDP 含む) が
  ブロックされる。実利用では問題ないが、自動化経路では AX 経由の
  ダイアログ操作が必要になる。
