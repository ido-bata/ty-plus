# UI/UX ロールバック解消の実機視覚検証 (release-0-14-0, Issue #591 系)

`release-0-14-0` に merge された UI 修正群について、Storybook / unit test
だけでなく After Effects 実機 (macOS / AE2027) 上の dev bundle
(`app.ty-plus.dev` → `dist/cep-dev`、HEAD `493cdc36` 時点の build) で
描画・操作結果を確認した記録。

## 環境・手法

- AE2027 (pid 65119) に Window > Extensions から dev panel 1–5 と
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
| #673 | preset type badge の単語途中 wrap 解消 | preset list dialog の glyph が 5 grapheme 名称で 1 行 (h=16px = font-size) に収まることを確認 (`preset-list-badges.png`) |
| #674 | dialog footer の水平 inset を shell primitive に統一 | settings dialog と preset edit dialog の `footer[data-dialog-footer]` で `padding-inline: 8px` (= `--ty-shell-pad-inline`) を確認 |
| #681 | preset edit dialog の error kind 区別 | preset edit dialog (31024) が正常系で開き、Cancel/Delete/Save が有効・footer inset 正常 (`preset-edit-dialog.png`)。失敗系 (delete 失敗後の retry) は unit test で担保 |
| #684 | 折りたたみ時 control panel の展開 affordance | panel2–5 は既定で collapsed 描画。`[data-cp]` に `data-collapsed="true"` + `ty.ctx.cp.toggle-collapse` IconButton (ChevronsUpDown) が存在し、click で 20x20 → 164x38 に展開・6 ボタン表示を確認 |

## コード・テストで担保し実機未踏の項目

| Issue | 内容 | 状態 |
| --- | --- | --- |
| #672 | Loop wave の label obstacle sampling (`waveLabelObstacles`) | canvas 描画のため DOM 検査不可。`loop-wave-labels.png` を証跡として保存。配置ロジックは unit test で担保 |
| #676 | group catalog tile の keyline / count badge | workspace catalog grid に group preset tile が必要で、ローカル catalog に group preset が存在しないため未踏 |
| #686 | MembersSection の path key 安定化 | group preset 編集面が必要。render 契約は unit test で担保 |
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

## 残件

- 上表「実機未踏」3 件は fixture (group preset) が必要。E2E fixture
  整備または Storybook 実描画との照合で補完する。
- Windows 実機での同項目検証は未実施 (v0.13.1 配布物検証は
  `distributed-0-13-1/` を参照)。
