# Issue #85 解析: bug(panel.skeleton): skeleton が実コンテンツと乖離 (要再現)

**ベース SHA:** `2173b397` (release-0-9-0 HEAD)
**作業日:** 2026-09-11
**状態:** 解析のみ (read-only)
**Issue 番号:** [#85](https://github.com/rebuildup/ty-plus/issues/85)
**ラベル:** bug / P3 / Target Version 0.10.0

## Summary

Issue #85 の前提 — "`src/management/panel/skeleton/*` 配下のコンポーネントが `Main.tsx`
の実 widget レイアウトを完全には反映していない" — は本リポジトリの実体と一致しない。
調査の結果、ベース SHA `2173b397` 時点で

1. ディレクトリ `src/management/panel/skeleton/` が **存在しない**。
2. ファイル名に "skeleton" を含むソースファイルが `src/` 配下に **1 件も存在しない**
   (全文検索でヒットするのは無関係な 2 件のコメントのみ)。
3. `Main.tsx` は loading 中 (state 未ロード時) に skeleton ではなく `null` を返す。
4. `Main.tsx` のレイアウト分岐は `panel-1` の StatusBar 描画のみで、`panel-2..5` 専用
   パスは存在しない。

つまり Issue 起票者が報告している「skeleton コンポーネント」は存在しないため、
報告されている 3 つの差分 (widget count / padding・gap / panel-2..5) は
確認しようが無い。**未再現の根拠となる前提自体が誤り**。

これは Issue #84 と類似の "reproduce-first" Issue であり、30 日以内に再現手順が
共有されない場合は `wontfix` / `invalid` ラベルを付与して Close する方針が
Issue 本文に明記されている。本解析はその判断材料を提供する。

## Code surface

### 確認したパス

| パス | 種類 | skeleton 言及の有無 |
|---|---|---|
| `src/management/panel/skeleton/` | (存在しない) | N/A |
| `src/management/panel/` | directory | skeleton なし (下記ファイル一覧参照) |
| `src/shared/component/Surface*` | (存在しない) | N/A |
| `src/management/panel/state/` | (存在しない) | N/A |
| `src/management/panel/Main.tsx` | source | skeleton なし |
| `src/management/panel/Main.test.tsx` | test | skeleton なし |
| `src/management/panel/boot.tsx` | source | skeleton なし |
| `src/management/panel/boot.test.tsx` | test | skeleton なし |
| `src/management/panel/surfaces/SurfaceErrorBoundary.tsx` | source | skeleton なし (Error boundary のみ) |

`src/management/panel/` 直下の全ファイル
(`ls -la src/management/panel/` で列挙):

```
Main.tsx
Main.test.tsx
ErrorBoundary.tsx
ErrorBoundary.test.tsx
boot.tsx
boot.test.tsx
appearance-boot.ts
cloud-gateway-boot.ts
cloud-gateway-boot.test.tsx
inject-styles.ts
thumbnail-gateway-boot.ts
control/         # Toolbar / StatusBar / state
setting/         # geometry
styles/
surfaces/        # SurfaceErrorBoundary.tsx のみ
theme/
persistence/     # chrome-store.ts
```

`skeleton/` ディレクトリは存在せず、`control/` `setting/` `surfaces/` `styles/`
`theme/` `persistence/` のみである。

### "skeleton" 文字列を含むソース

`rg -i skeleton -g 'src/**'` の結果は 2 件のみ:

1. `src/function/widget/registry.ts:13`
   → `// Additive widget descriptor registry (Wave 0 skeleton).`
   これは widget descriptor 移行作業の名残コメントで panel skeleton とは無関係。
2. `src/function/widget/core/easing/Component.tsx:xx`
   → `// (0,0)→(1,1) skeleton. Expand to the full procedural curve here so`
   easing widget 内部の curve 実装メモであり、UI skeleton とは無関係。

`Main.tsx` `boot.tsx` `Main.test.tsx` `boot.test.tsx` のいずれにも "skeleton"
"placeholder" "loading" "pulse" 等のキーワードは出現しない (grep 済)。

### `Main.tsx` のレンダリング構造

`src/management/panel/Main.tsx:21-134` は以下の構造を持つ。

```tsx
export function Main(): ReactElement {
    // ...
    const state = useWorkspaceRuntime(mountEl); // hooks/state.ts
    // ...
    return (
        <div ref={setMountEl} data-ty-workspace-panel-root
             className="h-full min-h-0 min-w-0 flex flex-col flex-1">
            {state ? (
                <RuntimeProvider ...>
                    <SelectionProvider ...>
                        <PanelStateProvider state={state}>
                            <GridCatalogTileBodyProvider render={...}>
                                <div className="flex-1 ... bg-(--bg-app)">
                                    <div className="relative flex-1 ... bg-(--bg-app)">
                                        <SurfaceErrorBoundary surface="workspace-grid">
                                            <Grid />
                                        </SurfaceErrorBoundary>
                                        <SurfaceErrorBoundary surface="workspace-group-layer">
                                            <WorkspaceGroupLayer .../>
                                        </SurfaceErrorBoundary>
                                    </div>
                                </div>
                            </GridCatalogTileBodyProvider>
                            {/* fixed toolbar */}
                            <div className="h-0 w-full shrink-0 overflow-visible">
                                <SurfaceErrorBoundary surface="toolbar">
                                    <Toolbar panelId={state.panelId} />
                                </SurfaceErrorBoundary>
                            </div>
                            {state.panelId === "panel-1" ? (
                                <SurfaceErrorBoundary surface="status-bar">
                                    <StatusBar .../>
                                </SurfaceErrorBoundary>
                            ) : null}
                            {addWidgetPickerOpen && mountEl ? (
                                <SurfaceErrorBoundary surface="add-widget-picker">
                                    <AddWidgetPickerOverlay .../>
                                </SurfaceErrorBoundary>
                            ) : null}
                        </PanelStateProvider>
                    </SelectionProvider>
                </RuntimeProvider>
            ) : null}
        </div>
    );
}
```

観察点:

- `state === null` のとき `Main` は `<div ref={setMountEl} ...>` だけ残し、内側ツリーは
  **`null`** を返す。loading 中に skeleton を描画する経路は存在しない。
- panel-1 と panel-2..5 で構造が違うのは **StatusBar の有無のみ** (line 109)。
  `panel-1` だけ StatusBar が描かれ、panel-2..5 では描かれない。
- `Toolbar` は全 panel-id で共通。
- `Grid` / `WorkspaceGroupLayer` は全 panel-id で共通 (中身は state.surfaceTiles
  に依存)。
- 内側 `<div>` の padding/gap クラスは `flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden box-border bg-(--bg-app)` (line 89) および `relative flex-1 min-h-0 min-w-0 overflow-hidden bg-(--bg-app)` (line 90) のみ。px/py/gap は一切無い。

### `Main.tsx` レンダリングの padding/gap

`rg 'padding|gap' src/management/panel/Main.tsx` の結果は 0 件。

→ skeleton との比較対象になるような padding / gap 値は `Main.tsx` には存在しない。
  grid gap は別レイヤ (`DEFAULT_GRID.gap = 4` pixel) で決まる。

### Widget count の真実値

`src/management/workspace/layout/default.ts:27-35`:

```ts
export const DEFAULT_PRIMARY_PANEL_WIDGET_SEED: readonly SeedTile[] = [
    { widgetType: "quick-actions", x: 0, y: 0, width: 4, height: 1 },
    { widgetType: "layout-lock", x: 4, y: 0, width: 1, height: 1 },
    { widgetType: "menu", x: 5, y: 0, width: 1, height: 1 },
    { widgetType: "easing", x: 0, y: 1, width: 4, height: 5 },
    { widgetType: "align", x: 4, y: 3, width: 2, height: 3 },
    { widgetType: "anchor-point", x: 4, y: 1, width: 2, height: 2 },
    { widgetType: "info", x: 0, y: 6, width: 6, height: 3 },
];
```

→ panel-1 のデフォルト widget 数は **7** (`quick-actions`, `layout-lock`, `menu`,
  `easing`, `align`, `anchor-point`, `info`)。これが Main.tsx の Grid がレンダ
  する内容。

`src/management/workspace/state.ts:84-86`:

```ts
const panelId = opts.panelId ?? "panel-1";
const defaultWidgets =
    panelId === "panel-1" ? buildPrimaryPanelWidgets() : [];
```

`src/management/workspace/hooks/state.ts:50-96` (`ensurePrimaryPanelWidgets`):

- `panel-1` 以外のとき → state をそのまま返す (line 57-59)。
- `panel-1` で利用可能な widget が 1 つも無いときのみ `buildPrimaryPanelWidgets()`
  で seed を埋める。

→ panel-2..5 はデフォルトで **空の surface**。ユーザが widget を追加して初めて
  Grid に tile が現れる。

### Storybook stories

`find src -name "*.stories.tsx"` の一覧に skeleton 系の story は **無い**。
panel 周辺の story も存在せず、Main.tsx を対象とした story も見当たらない。

### Main.tsx と skeleton を比較するテスト

`src/management/panel/Main.test.tsx` は "renders without crashing" 1 件のみで
  skeleton との照合テストは存在しない。

`src/management/panel/boot.test.tsx` にも skeleton 関連の assertion は無い
  (SetupRequired / CepContext / panel-2..5 の workspace-N.json routing 等の
  別件のテスト)。

→ skeleton を実レイアウトと比較する自動テストは **存在しない**。再現の一次
  根拠は人力スクリーンショット頼みで、これは Issue 本文の再現手順が未記入と
  整合する。

## Findings

### Finding F1 — skeleton ディレクトリ・ファイルが存在しない (Issue 前提の崩壊)

**重大度:** Issue 全体の前提を否定する

- `ls src/management/panel/skeleton/` → No such file or directory。
- `find src -type d -name "skeleton*"` → 0 件。
- `find src -type f -name "*keleton*"` → 0 件。
- `rg -i skeleton src/` → 無関係なコメント 2 件のみ (widget registry の
  Wave 0 注記、easing widget の curve 実装メモ)。

→ Issue が指摘する `src/management/panel/skeleton/*` はコードベースに存在
  しないため、報告されている widget-count / padding・gap / panel-2..5 の差分
  は確認しようが無い。

**Issue #84 との対比:** #84 は `Main.tsx` の構造差分 (header / footer padding)
  を主張していたが、`Main.tsx` 自体には `padding` も `gap` も含まれておらず、
  報告との不一致は「定義された CSS が無いため再現不能」という点で共通する。

### Finding F2 — Main.tsx は loading 中に skeleton ではなく `null` を返す

`src/management/panel/Main.tsx:66-72, 131` の構造より、`state === null` のとき
`Main` の内側ツリーは `null`。これは「loading 中は何も見せない」設計であり、
skeleton を持つ経路がそもそも無い。

`src/management/panel/boot.tsx:127-148` も、init 未完了かつ非 primary panel の
ときは `<SetupRequired />` を出し、それ以外は `<Main />` を直接出す。skeleton
でフェードする経路は無い。

→ skeleton の不在はバグではなく、現状の設計は "loading 中は panel を空で出す"
  という選択。これと Issue の前提 (skeleton が存在して実コンテンツと乖離) は
  矛盾する。

### Finding F3 — `Main.tsx` の panel-1 / panel-2..5 差は StatusBar の有無のみ

`src/management/panel/Main.tsx:109-118`:

```tsx
{state.panelId === "panel-1" ? (
    <SurfaceErrorBoundary surface="status-bar">
        <StatusBar .../>
    </SurfaceErrorBoundary>
) : null}
```

`Toolbar` / `Grid` / `WorkspaceGroupLayer` / `AddWidgetPickerOverlay` は全
panel-id で共有される。よって panel-id による構造差は 1 箇所のみ。

これは Issue が主張する "panel-2..5 の場合の差分" の存在を裏付けるものでは
ない。仮に skeleton が存在するとすれば、それは (a) StatusBar を描かない / 描
く の差を反映していないか、(b) panel-2..5 の空 surface を反映する必要があ
るかのいずれかになるが、定義上 skeleton コンポーネントは存在しないため未確認。

### Finding F4 — Main.tsx の padding / gap 値は 0 件

`rg 'padding|gap' src/management/panel/Main.tsx` で 0 件。`Main.tsx` の
クラスは flex / min-* / bg / overflow 系のみで padding/gap を持たない。

grid gap は `src/management/workspace/layout/default.ts:11` の `DEFAULT_GRID.gap = 4`
で固定。`Main.tsx` レンダリングに影響する padding 値は無い。

→ skeleton との比較対象が Main.tsx に存在しない。

### Finding F5 — default widget count は 7 で一意

`DEFAULT_PRIMARY_PANEL_WIDGET_SEED` (Finding で引用済) の 7 widget が
panel-1 の唯一のレイアウト。Main.tsx はこれをそのまま Grid 経由で描画する
(`Grid.tsx:128-319` の `derivePlacementCells` → `computeGridTracks` → tile
rendering)。

widget count に panel-id 別の差は無いため、panel-1 と panel-2..5 で widget
count の差を主張するならば、その差の正体は「panel-2..5 は 0 widget」=
「空の Grid」となる。これも skeleton コンポーネントの存在を前提とする。

### Finding F6 — skeleton の story / test が皆無

Storybook に panel / Main / skeleton の story は無い (search 済)。
`Main.test.tsx` はクラッシュしないことのみ確認。`boot.test.tsx` は workspace
JSON routing のみ。skeleton の構造をアサートするテストは無い。

→ 報告者が「視覚的に一致しない」と判断する根拠はスクリーンショットのみで、
  自動的な再現手段が無い。これは Issue が "要再現" ステータスを維持する
  理由と整合する。

### Finding F7 — 報告経路の分類

Issue の再現手順は「1. preset 数 0 で AE 起動、2. skeleton 撮影、3. 描画後
撮影、4. 比較」だが、preset 0 の状態は Issue #85 起票時点の運用では
onboarding 中の状態であり、そのとき panel-1 は onboarding view が支配する
(`boot.tsx:135-144`)。よって「preset 0 = skeleton 表示」という観測自体が
現在の実装と噛み合わない可能性が高い。

→ 報告者は skeleton の存在を前提としているが、実装上は onboarding view /
  SetupRequired / Main (state=null → null) の 3 状態しか無く skeleton 状態
  は無い。報告者が観測しているのはおそらく「onboarding 終了直後」と
  「onboarding view が出ている途中」の差分であり、それは本 Issue の対象外
  (onboarding の遷移設計)。

## Verdict

Issue #85 の前提 "`src/management/panel/skeleton/*` が `Main.tsx` と乖離" は
**コードベースに skeleton が存在しないため検証不能**。

- widget count 乖離 → 主張の前提 (skeleton) が無いので未確認
- padding / gap 乖離 → Main.tsx 自体に padding/gap が無いので skeleton と比較
  する値が無い
- panel-2..5 差分 → Main.tsx 上の panel-id 分岐は StatusBar の 1 箇所のみ

再現手順が「skeleton 撮影 → 実コンテンツ撮影」となっており、観測したい
skeleton 状態が無い以上、現状のコメント "再現手順が 30 日以内に共有されない
場合、`wontfix` または `invalid` ラベルを付与して Close する" がそのまま
適用可能。

再現報告が来た場合のフォールバック検証手順は Suggested follow-up に記載する
が、現時点で確定的なバグの指摘は無い。

## Suggested follow-up

優先度順 (効果 / コスト比)。

1. **報告者に観測対象の確認を依頼するコメント投稿** (低コスト・即時)
   - 「具体的にどの画面要素が skeleton に該当するか」を 1 枚スクリーンショット
     で共有してもらう。観測対象が onboarding view / SetupRequired / Main の
     いずれの遷移かを切り分ける。
   - Issue に "Please attach the skeleton screenshot you are comparing against"
     とだけコメントして 30 日タイマーを走らせる (Issue 本文のクロージング方針に
     従う)。

2. **既存ドキュメントの参照誘導** (低コスト・低リスク)
   - 報告者が `Main.tsx` を読み違えている可能性が高いため、ADR や
     `docs/architecture/runtime/ui-composition.md` の Main レイアウト図を
     共有する。
   - 報告者が「skeleton」と呼んでいるものが実は `SetupRequired` /
     `OnboardingView` ならば別 Issue として切り出す。

3. **万一 skeleton を再導入する判断になった場合の実装メモ** (Issue 再 Open 時)
   - 配置先: 仮置きで `src/management/panel/surfaces/Skeleton.tsx` ないし
     `src/management/panel/Main.Loading.tsx` を新設する選択肢がある。
   - ただし現状の "state=null で null を返す" 設計を破壊するため、合意形成が
     必要 (デザインレビュー + AGENTS.md の "後方互換シムを作らない" ルールと
     の整合確認)。
   - panel-2..5 用のレイアウトが必要なら `DEFAULT_PRIMARY_PANEL_WIDGET_SEED`
     ではなく panel-id 別の seed 定義を `layout/default.ts` に追加する。

4. **テスト観点の補強** (将来 Issue)
   - skeleton を導入する場合、`Main.test.tsx` に「state=null のとき何を描画
     するか」の assertion を入れる。
   - panel-1 / panel-2..5 で `Grid` が受け取る `surfaceTiles` 件数を assertion
     するテストを `src/management/workspace/hooks/state.test.ts` に追加する
     (現状の panel-2..5 → 空配列 の振る舞いを pin)。

5. **クロージング判断**
   - 30 日 (2026-10-11 頃) までに再現コメントが無い場合、Issue を
     `invalid` ラベルで Close。
   - 再現が成立しかつ skeleton が実在した場合は priority P3 → P2 / size S 再評価。

## 参考リンク

- Issue: <https://github.com/rebuildup/ty-plus/issues/85>
- Main: `src/management/panel/Main.tsx`
- Boot: `src/management/panel/boot.tsx`
- Layout default: `src/management/workspace/layout/default.ts`
- Workspace state: `src/management/workspace/state.ts`
- ensurePrimaryPanelWidgets: `src/management/workspace/hooks/state.ts`
- Grid: `src/management/workspace/surface/Grid.tsx`
- AGENTS.md: `/home/basic/work/ty-plus/AGENTS.md`
- CLAUDE.md: `/home/basic/work/ty-plus/CLAUDE.md`