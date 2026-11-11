# Issue #84 静的解析レポート

- Issue: `bug(panel): 追加パネルの header / footer 左端がメイン panel と揃わない (要再現)` (P3, Target 0.10.0)
- Base SHA: `2173b3979d31bddbc5289a91bed44ef81171c4d4` (`release-0-9-0` HEAD)
- スコープ: read-only 静的解析
- 結論: **Issue が前提とする「panel 自身の header / footer」という UI 要素は
  コードベースに存在しない**。panel-1 にだけ描画される StatusBar (`<footer>`) は
  `px-2` 固定で panel-2..5 はそもそも描かれないため、「padding の 1px ずれ」と
  いう再現手順で観測される差異は、現状のコードからは説明できない。

## Issue summary

`src/management/panel/Main.tsx` の構造から panel-2..5 は panel-1 と同じ
grid レイアウトを共有しているが、追加時のレイアウト計算で header / footer の
左端 padding が panel-1 と微妙にずれる、という報告。Issue 起票時点で
release-0-9-0 HEAD `f8cfe8f3` 上では未再現。

Issue 本文が想定する修正対象:

- `src/management/panel/header/*` もしくは `src/management/panel/footer/*` の
  padding / margin 計算
- `src/shared/component/Surface*` のラッパ幅の決定
- panelId ごとに width を計算するロジックで `panel-1` だけ別の経路を持つ可能性

## Code surface read

| パス | 1 行要約 |
| --- | --- |
| `src/management/panel/Main.tsx` | panel ルート。state 取得後に `Grid` / `Toolbar` / `StatusBar` / `AddWidgetPickerOverlay` を描画する。`StatusBar` だけ `state.panelId === "panel-1"` 条件付き (L109)。 |
| `src/management/panel/boot.tsx` | `panel-1` を `isPrimaryPanel` と判定し、init / onboarding / パネル ID 解決を行う。panel-id 別のレンダ分岐はなし。 |
| `src/management/panel/control/StatusBar/Main.tsx` | `<footer data-ws-status-bar>` を返す唯一の panel chrome。padding は `px-2` 固定 (L74)。`panel-1` / `panel-2..5` での class 分岐なし。 |
| `src/management/panel/control/Toolbar.tsx` | フローティング control panel。`fixed bottom-*` で位置を取り、`panelId` は chrome state のキーと StatusBar 用の `bottom-11` / `bottom-4` 切替の判定のみに使用。 |
| `src/management/panel/control/state.ts` | `cpPositionToClasses(position, _orientation, panelId)` で `panelId === "panel-1"` のとき `bottom-11`、それ以外は `bottom-4` を返す (L84-90)。Toolbar の縦位置のみを変える。 |
| `src/management/panel/persistence/chrome-store.ts` | panel-1 のみ legacy fallback を参照する (L139)。chrome の永続化専用で描画には影響しない。 |
| `src/management/dialog/dialogs/shell/Header.tsx` | dialog 用 `<header>`。`px-(--ty-shell-pad-inline)` (= 8px) 固定。`panelId` 依存なし。 |
| `src/management/dialog/dialogs/shell/Footer.tsx` | dialog 用 `<footer>`。`bg-surface-dialog` のみ。padding は呼び出し側 (`footerClassName`) で渡す。`panelId` 依存なし。 |
| `src/management/dialog/dialogs/shell/Layout.tsx` | `Shell` (dialog 用) は `Header` + `Content` + 任意の `Footer` を縦に積む。`panelId` 依存なし。 |
| `src/management/widget/picker-overlay.tsx` | `<dialog>` 型の widget picker。`<header>` と `<footer>` を持ち、`px-(--ty-shell-pad-inline)` (= 8px) 固定。`panelId` はヘッダ内のテキスト表示にのみ使用 (L66, L76)。 |
| `src/management/workspace/layout/engine.ts` | grid tracks / rect / snap の算術。`panelId` 依存なし。 |
| `src/management/workspace/surface/Grid.tsx` | panel root 直下のスクロール可能 grid を描画。`panelId` はログのみ。 |
| `src/management/online/notification/Container.tsx` | `position: fixed` で右上に出す toast。panel と独立。 |
| `src/management/style/literals/design-tokens-defaults.ts:328` | `--ty-shell-pad-inline: 8px` の唯一の定義元。 |
| `src/management/ae/cep/entry/panel.tsx` | `#app` に対する React 19 root を作成。`bootPanel` を起動。 |
| `src/management/ae/cep/shell/panel/index.html` | `<div id="app">` のみ。CEP extension id から `panel-N` を解決。 |

## Findings

### Finding F1 — Issue が想定する `panel/header/*` ディレクトリは存在しない

**重大度:** Issue 全体の前提を否定する (not-a-bug)

検証:

- `find src/management/panel -name 'header*' -o -name 'Header*'` → 0 件。
- `find src/management/panel -name 'footer*' -o -name 'Footer*'` → 0 件。
- `rg '<header|</header' src/management` のうち panel 配下にヒットするものは 0 件
  (該当するのは dialog / online notification / widget picker-overlay のみ)。
- `rg '<footer|</footer' src/management` のうち panel 配下でヒットするのは
  `src/management/panel/control/StatusBar/Main.tsx:72` の 1 件のみ。

→ panel の "header" コンポーネントはコードベース上に存在しない。報告者が
  「左端 padding が panel-1 とずれる」と観測した "header" は、別の UI 要素を
  見誤っている可能性が高い。

### Finding F2 — `<footer>` は panel-1 のみが描画し、panel-2..5 は描画しない (存在差)

`src/management/panel/Main.tsx:109-118`:

```tsx
{state.panelId === "panel-1" ? (
    <SurfaceErrorBoundary surface="status-bar">
        <StatusBar
            state={state}
            canUndo={ui.canUndo}
            canRedo={ui.canRedo}
            snapshots={ui.snapshots}
        />
    </SurfaceErrorBoundary>
) : null}
```

- 重大度: **confirmed-bug (ただし意味は "padding ずれ" ではなく "存在の有無")**
- 証跡: `Main.tsx:109` の `state.panelId === "panel-1"` 三項が StatusBar の
  描画そのものを gating している。`panel-2..5` は `<footer>` を一切持たない。
- 推論: 「左端 padding が panel-1 と panel-2..5 で揃わない」と報告者が
  観測した値は、padding の差分ではなく「footer 自体が無い vs 有る」の差に
  起因する可能性が高い。例えば panel-1 の左端を StatusBar の左端 (= flex row
  の左端、`px-2` の分 8px 内側) で測り、panel-2..5 の "同じ左端" を
  StatusBar の **存在しない** 親要素 (= Main.tsx ルート div の左端) で測って
  いる場合、8px の差として観測され得る。

これは「1px のずれ」報告とは桁が違うため、報告者が指す対象はこの StatusBar
そのものではない可能性が高い (詳細は F5 参照)。

### Finding F3 — StatusBar の padding は panel-id で変わらない (`px-2` 固定)

`src/management/panel/control/StatusBar/Main.tsx:74`:

```tsx
<footer
    data-ws-status-bar=""
    className="status-bar m-0 flex h-6 w-full shrink-0 items-center justify-between border-t border-(--color-border-subtle) bg-surface-dialog px-2 text-shell-sm select-none"
>
```

- 重大度: **not-a-bug**
- 証跡: `px-2` (= 8px) は panel-id によって変わらない。`px-2` は Tailwind
  トークンで `0.5rem` (= 8px) 相当。条件分岐は component 内に存在しない。
- 推論: StatusBar 内の left padding は panel-1 でも panel-2..5 でも同じ値に
  なる。ただし F2 の通り panel-2..5 では StatusBar が描かれないため、この
  「8px」を観測できるのは panel-1 だけ。報告の前提は「panel-1 と panel-2..5
  の **両方** に footer が存在し、左端 padding が違う」だが、実装は
  「panel-1 のみ footer が存在し、padding は 8px」となる。

### Finding F4 — Layout engine は panel-id を見ない

`src/management/workspace/layout/engine.ts` の全関数
(`computeGridTracks` / `tracksToPixels` / `getTileRect` / `snapPosition` /
`snapSpan` / `packTopLeft`) は引数で `GridSettings` を取り、`panelId` /
`panelSurfaceId` / `panel-1` のいずれも参照しない。

- 重大度: **not-a-bug**
- 証跡: `rg 'panelId|panel-1' src/management/workspace/layout/engine.ts` → 0 件。
- 推論: Issue の仮説「panelId ごとに width を計算するロジックで `panel-1`
  だけ別の経路」は layout engine には存在しない。grid の `width` /
  `tracksToPixels` の結果は panel-id 非依存。

### Finding F5 — Issue 想定の `shared/component/Surface*` は存在しない

- `find src/shared -name 'Surface*' -type f` → 0 件。
- `src/shared/component/` 直下は `controls/` `feedback/` `fields/` `icons/`
  `interaction/` `layout/` `shell/` のみ。`Surface*` は無い。

→ 報告者が指す "Surface ラッパ" が存在するなら、それは panel / workspace 層
  から見つけられない (例: CEP shell の index.html に `<div id="app">` が
  あるのみで、これは React mount ポイント)。

### Finding F6 — Toolbar の `panelId` 依存は縦位置のみ

`src/management/panel/control/state.ts:84-90`:

```ts
export function cpPositionToClasses(
    position: CpPosition,
    _orientation: CpOrientation,
    panelId = "panel-1",
): string {
    const hasStatusBar = panelId === "panel-1";
    const inset = hasStatusBar ? "bottom-11" : "bottom-4";
    ...
}
```

- 重大度: **wai (Works As Intended)**
- 証跡: panel-1 は StatusBar (h-6 = 24px) を予約するため Toolbar は `bottom-11`
  (= 44px) で配置。panel-2..5 は StatusBar がないため `bottom-4` (= 16px)。
- 推論: panel-id 別の差分は存在するが、これは panel-2..5 に StatusBar を
  持たない設計判断と整合する。Toolbar 自体の padding (`p-1 gap-0.5`) は
  panel-id 非依存。**Toolbar は panel 内の "header" でも "footer" でもない**
  (position: fixed でフローティング) ため、報告者の言う "header / footer
  左端 padding" とは別物。

### Finding F7 — `<header>` を持つ panel 配下の UI はない

`rg '<header|</header|<footer|</footer' src/` のうち、`src/management/panel/`
配下でヒットするのは:

- `src/management/panel/control/StatusBar/Main.tsx:72,226` (`<footer>` のみ)

のみ。`<header>` を返す panel 配下のコンポーネントは存在しない。
`<header>` を返すのは次の dialog / online 経路のみ:

- `src/management/widget/picker-overlay.tsx:57` (AddWidget picker の modal header)
- `src/management/ae/cep/dialogs/DialogShell.tsx:32` (CEP dialog shell header)
- `src/management/dialog/dialogs/shell/Header.tsx:21` (dialog header)
- `src/management/online/notification/Center.tsx:349, 653` (notification center)

これらは panel に属さず、panel-2..5 でも同じ className
(`px-(--ty-shell-pad-inline)` = 8px, `py-2.5` / `py-3` / `px-4`) を
共有する。panel-id による分岐はない。

- 重大度: **not-a-bug**
- 推論: panel 上に header は無い。報告者が観測した "header" が、もし panel
  内の何かであれば、それは dialog / picker / notification を指している可能性
  が高い (これらは panel と独立した fixed ポジショニング)。

### Finding F8 — panel 内の padding / margin 値の網羅

`src/management/panel/` 直下のソースファイルから `px-*` / `pl-*` / `pr-*` /
`p-*` / `mx-*` / `my-*` / `m-*` を抽出:

| ファイル:行 | クラス | panel-id 依存 |
| --- | --- | --- |
| `panel/ErrorBoundary.tsx:132` | `px-2 py-1` | 無 |
| `panel/ErrorBoundary.tsx:139` | `px-2 py-0.5` | 無 |
| `panel/control/StatusBar/Main.tsx:74` | `px-2` | 無 (F3) |
| `panel/control/StatusBar/Main.tsx:141` | `px-2 py-1` | 無 |
| `panel/control/StatusBar/Main.tsx:159` | `px-2 py-1` | 無 |
| `panel/control/StatusBar/Main.tsx:138` | `p-1` | 無 |

`Main.tsx` 自体には padding / margin 値が無い (`rg 'padding|gap' src/management/panel/Main.tsx` → 0 件)。
panel-id 別 padding 値は検出できない。

### Finding F9 — panel-id 別の分岐は StatusBar の有無 / Toolbar の縦位置 / chrome-store の legacy fallback のみ

全 panel-id 別分岐を列挙:

1. `Main.tsx:109` — StatusBar 描画 gating (`panel-1` のみ)。
2. `panel/control/state.ts:89` — Toolbar の縦位置 (`bottom-11` vs `bottom-4`)。
3. `panel/persistence/chrome-store.ts:139` — legacy `settings/control-panel.json`
   fallback (panel-1 のみ)。
4. `workspace/state.ts:84-86` — `buildPrimaryPanelWidgets()` の seed を
   panel-1 のみに埋める。
5. `workspace/surface/tiles.ts:194` — `panel-1` のとき default panel tiles を
   構築。
6. `workspace/hooks/state.ts:57` — `ensurePrimaryPanelWidgets` のスキップ判定。
7. `workspace/hook.ts:689` — `allowImplicitAllPresetsWhenLayoutEmpty` の判定。
8. `workspace/undo/history.ts:104, 169` — undo history の panel-1 フォールバック。
9. `workspace/persistence/store.ts:337, 1235` — panel-1 default `panelId`。

これらはいずれも:

- panel padding / margin の決定因子ではない。
- panel header / footer のレンダ条件ではない。
- `panel-2..5` に "別経路の padding 計算" を与える分岐ではない。

→ 報告者が言う "header / footer の padding が panel-id で別計算される"
  ロジックは検出できない。

### Finding F10 — 自動テスト・Storybook に padding 揃い検証はない

- `src/management/panel/Main.test.tsx` は "renders without crashing" 1 件のみ。
- `src/management/panel/boot.test.tsx` も setup / routing 中心で padding 検証なし。
- panel header / footer の padding 揃えを assertion する test / story は皆無。
  (`rg 'padding|getBoundingClientRect' src/management/panel -t tsx` → 0 件相当)。

→ 報告されたずれはスクリーンショット / ruler 頼みで、再現と回帰防止の両面で
  自動化の網が掛かっていない。Issue 自体が「要再現」としている状態と整合。

## Verdict

**Issue の前提「panel 自身の header / footer」がコードベースに存在しないため、
報告されている "padding の 1px ずれ" は静的解析からは再現不能。**

- 仮説 1: `panel/header/*` または `panel/footer/*` の padding 計算 → その
  ディレクトリは存在しない (F1)。
- 仮説 2: `shared/component/Surface*` のラッパ幅 → そのファイル群は存在しない
  (F5)。
- 仮説 3: panelId ごとに width を計算するロジックで `panel-1` だけ別経路 →
  layout engine / persistence / state を全検索しても検出できない (F4, F9)。
- 観察される実差分: panel-1 のみ StatusBar が描画され panel-2..5 には描かれない
  (F2)。これは "padding ずれ" ではなく "存在の有無" の差。StatusBar 自体の
  padding は panel-id に対し一定 (`px-2`) (F3)。

### No code bug found (in the sense the issue hypothesizes)

Issue が指す "panel header" も "panel footer padding の panel-id 別計算" も
存在しない。StatusBar は panel-1 のみ描画され、その padding は panel-id
非依存の `px-2` (= 8px)。

**Reproduction likely requires runtime environment:**

- 報告者が測った "左端" が何を指すか (panel root 左端 / Toolbar 左端 /
  StatusBar 左端 / スクロール領域左端) が不明。
- 報告者が "header" と思っている UI 要素が何かが不明 (panel 内に header は
  存在しないため、別のものを指している可能性が高い)。
- 1px 差の計測では、CEP ブラウザズーム / デバイスピクセル比 / OS DPI 差 /
  font fallback / WebKit のサブピクセル rounding が支配的になり得る。

Issue 本文のクロージング方針「30 日以内に再現手順が共有されない場合は
`wontfix` または `invalid` ラベルを付与して Close」がそのまま妥当。

## Suggested follow-up

1. **(最優先・低コスト)** 報告者に「観測した "header" / "footer" の
   スクリーンショット」と「DevTools のインスペクタで選択した element の
   className」をコメントで共有してもらう。`Main.tsx` の panel root /
   `Toolbar` / `StatusBar` / `AddWidgetPickerOverlay` / `NotificationContainer`
   のどれが観測対象かを切り分ける。
2. **(中コスト)** 報告者の言う "header" が `Toolbar` のことならば、
   `Toolbar` の position は `fixed` で `left-4` (panel-2..5) / `left-4`
   (panel-1) で同一 (Toolbar 位置は position でなく `inset`)。もし
   `Toolbar` の左端座標が違うように見えるなら、それは CEP の panel 起点
   座標 (panel-1 の docking と panel-2..5 の undocked floating) 由来の可能性
   が高い。これは CEP 環境依存であり、コードベース側で揃える対象ではない。
3. **(将来 Issue)** 再現報告が来た場合のみ、テストとして
   `panel-1..5` で `Main` を render し、`querySelector('[data-ty-workspace-panel-root]').getBoundingClientRect()`
   と内部要素 (Toolbar / StatusBar) の `getBoundingClientRect()` を snapshot
   比較する e2e (Playwright + happy-dom) を `tests/panel/` に追加する。
   ただし現状の design は panel-2..5 に StatusBar を持たないため、assertion
   は「要素が存在するか / しないか」の pin に留める。
4. **(クロージング)** 30 日 (2026-10-11 頃) までに再現コメントが無い場合、
   Issue を `invalid` ラベルで Close。再現成立時は priority P3 → P2 / size S
   を再評価。

## 参考リンク

- Issue: <https://github.com/rebuildup/ty-plus/issues/84>
- Main: `src/management/panel/Main.tsx`
- Boot: `src/management/panel/boot.tsx`
- StatusBar: `src/management/panel/control/StatusBar/Main.tsx`
- Toolbar: `src/management/panel/control/Toolbar.tsx`
- Toolbar positioning: `src/management/panel/control/state.ts`
- Panel chrome persistence: `src/management/panel/persistence/chrome-store.ts`
- Workspace grid engine: `src/management/workspace/layout/engine.ts`
- Workspace grid render: `src/management/workspace/surface/Grid.tsx`
- AddWidget picker header/footer: `src/management/widget/picker-overlay.tsx`
- Dialog shell header: `src/management/dialog/dialogs/shell/Header.tsx`
- Dialog shell footer: `src/management/dialog/dialogs/shell/Footer.tsx`
- `--ty-shell-pad-inline` token: `src/management/style/literals/design-tokens-defaults.ts:328`
- AGENTS.md: `/home/basic/work/ty-plus/AGENTS.md`
- CLAUDE.md: `/home/basic/work/ty-plus/CLAUDE.md`
- 類似 Issue 解析 (同パターン): [Issue #85](./issue-85.md), [Issue #86](./issue-86.md), [Issue #87](./issue-87.md)
