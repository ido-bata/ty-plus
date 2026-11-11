# Issue #89 解析: feat(widget.alignment): キー画像をカスタム可能にする (要求確認)

**ベース SHA:** `2173b3979d31bddbc5289a91bed44ef81171c4d4` (`release-0-9-0` HEAD)
**作業日:** 2026-09-11
**状態:** 解析のみ (read-only)
**Issue 番号:** [#89](https://github.com/rebuildup/ty-plus/issues/89)
**ラベル:** enhancement / P3 / Target Version 0.10.0 (要求次第)

## Summary

Issue #89 は「alignment widget のキー画像をカスタム可能にする」を要求している
が、その対象がコード上**3 通りに解釈可能**であり、現状どの解釈にも該当する
カスタマイズ経路は存在しない。

1. **ジェスチャー overlay のストローク色 / 終点マーカー** — `GestureOverlay`
   (`src/function/widget/core/align/Component.tsx:138-173`) の SVG `polyline` /
   `circle`。`var(--action-primary)` で描画されている。
2. **align widget 内のアクション sub-icon** — `AlignIcon` /
   `TargetIcon` (`src/management/workspace/surface/widget-grid-icons.tsx:63+,
   274+`) が `align-left`, `distribute-spacing-v`, `selection` 等の **21 種**
   の SVG を name 別に持ち、コード内にハードコードされている。
3. **widget catalog の icon** (`AlignCenter`) — `descriptor.ts:18` の Lucide
   参照。これは widget 選択 UI 側で表示される widget 一覧のサムネイル用。

加えて Issue 本文が参照する `src/management/workspace/events/handler.ts:432-495`
(alignGesture / renderAlignGestureOverlay / ALIGN_GESTURE_MAP) は **存在しない**
(後述 F1)。これらは Issue #77 で `useAnchorGesture` 抽出に伴い
`src/shared/component/interaction/use-anchor-gesture.ts` と
`src/function/widget/core/align/Component.tsx` の `GestureOverlay` /
`GESTURE_MAP` へ既に移動済みである。

つまり「alignment widget 本体は既に存在し、3 つのサブ画像サーフェスを
持つ」「要求はまだ絞られていない」「既存 customization surface は皆無」
という 3 点の事実を確認した。**画像カスタマイズ機能の技術サーフェスは
存在せず、追加には descriptor 拡張 + Component 書き換え + storage 追加が
必要**。最小実装は「action sub-icon のみユーザ差し替え可能」、最大実装は
「preset icon と同等 (text/emoji/image/canvas) のフル ICON_EDITOR を
21 sub-icon × 4 target × ジェスチャー overlay に適用」となる。

## Code surface

### 確認したパス

| パス | 種類 | 役割 |
|------|------|------|
| `src/function/widget/core/align/Component.tsx` | source | `Align` widget 本体 (546 行) |
| `src/function/widget/core/align/descriptor.ts` | source | `defineWidget({...})` 呼び出し (28 行) |
| `src/function/widget/core/align/Component.stories.tsx` | source | Storybook `Default`, `Compact` の 2 variant |
| `src/function/widget/core/align/index.ts` | source | 公開 API re-export (ACTIONS, buildLayersScript, time-script) |
| `src/function/widget/core/align/script.ts` | source | ExtendScript 生成 (`buildLayersScript`) |
| `src/function/widget/core/align/script.ext.ts` | source | ExtendScript テンプレート本体 |
| `src/function/widget/core/align/time-script.ts` | source | 時刻 align 用 ExtendScript |
| `src/management/workspace/surface/widget-grid-icons.tsx` | source | `AlignIcon` (21 種), `TargetIcon` (4 種) を含む SVG icon 集 |
| `src/shared/component/interaction/use-anchor-gesture.ts` | source | drag gesture hook (extracted from Issue #77) |
| `src/function/widget/core/anchor-point/Component.tsx` | source | 比較対象: Issue #77 で抽出した anchor-point widget (240 行) |
| `src/function/widget/core/anchor-point/descriptor.ts` | source | anchor-point の `defineWidget` |
| `src/function/widget/define.ts` | source | `WidgetDescriptor` 型定義 (24-83) |
| `src/management/preset/contract.ts` | source | `PresetIcon` 型 (text/emoji/image/canvas) — 既存 image インフラ |
| `src/management/preset/icon-data.ts` | source | preset icon 永続化 |
| `src/management/preset/components/IconEditor.tsx` | source | `PresetIconEditor` UI |
| `src/function/widget/core/anchor-point/Component.stories.tsx` | source | 比較対象: anchor-point stories (`Default`, `Large`, `GesturePreview`) |
| `src/management/i18n/locales/en/widgets.json` | i18n | `widgets.align.name` = "Align", 説明あり |
| `src/management/i18n/locales/ja/widgets.json` | i18n | `整列` |
| `docs/architecture/widget/anchor-point.md` | doc | Issue #77 で書いた widget 個別ドキュメント (比較対象) |

### Issue 本文の参照箇所 (432-495) は存在しない

Issue #89 の本文は `src/management/workspace/events/handler.ts:432-495` の
`alignGesture` / `renderAlignGestureOverlay` を指している。

確認:

- `rg 'alignGesture|renderAlignGestureOverlay|ALIGN_GESTURE_MAP' src/management/workspace/events/handler.ts` → **0 hit**
- `rg 'alignGesture|renderAlignGestureOverlay|ALIGN_GESTURE_MAP' src/` → 1 hit
  (legacy alias コメント in `src/shared/component/interaction/use-anchor-gesture.ts:5` のみ)
- `src/management/workspace/events/handler.ts` の長さは **1480 行** で、align 関連
  の名前は `alignLayers` IPC 呼び出し経由で残っているのみ。

→ Issue #89 の参照パスは **既に存在しない** (Issue #77 で抽出済み)。

抽出先:

- gesture ロジック: `src/shared/component/interaction/use-anchor-gesture.ts`
- gesture map: `src/function/widget/core/align/Component.tsx:45-66` `GESTURE_MAP`
- overlay 描画: `src/function/widget/core/align/Component.tsx:138-173`
  `GestureOverlay`
- 公開 API: `src/function/widget/core/align/index.ts`

### Align widget の現在の構造

`src/function/widget/core/align/Component.tsx` の構造 (546 行):

| 行範囲 | 要素 |
|--------|------|
| 1-21 | import (useAnchorGesture, AlignIcon, TargetIcon, SurfaceState, runtime) |
| 22-43 | `Action` 型 (21 種) — align / distribute / spacing / time |
| 45-66 | `GESTURE_MAP` — stroke 文字列 → Action マップ (22 entry) |
| 68-72 | `Props` (`state`, `widthPx`, `widgetInstanceId`) |
| 74-82 | predicate (`isDistributeAction`, `isSpacingAction`, `isDisabled`) |
| 84-88 | CSS class 文字列 (Tailwind only) |
| 92-132 | `AlignButtonGrid` — 3 列ボタン群 |
| 134-136 | `SectionLabel` |
| **138-173** | **`GestureOverlay` — SVG polyline + circle (key-image surface #1)** |
| 175-228 | `TargetSelectorRow` — 4 target ボタン |
| 230-545 | `Align` 本体 (state 管理 + section 配置 + overlay 配置) |

`Align` 本体は次の 4 section を縦に並べる (target が `time` のときのみ Time
section が追加):

- Align: 6 ボタン (`align-left/center-h/right/top/center-v/bottom`)
- Distribute: 6 ボタン (`distribute-left/center-h/right/top/center-v/bottom`)
- Spacing: 4 ボタン (`distribute-spacing-h/v`, `distribute-h/v`)
- Time (conditional): 5 ボタン (`align-start/end/duration`,
  `distribute-start/end`)
- Target Row: 4 ボタン (`selection`, `comp`, `key-object`, `time`)

各ボタンは `AlignIcon name={action}` または `TargetIcon name={...}` を描画する。

`AlignIcon` は 21 name を switch-case した `Svg` コンポーネントで、name 毎に
SVG path / rect / line をハードコードしている
(`widget-grid-icons.tsx:63-272`)。`TargetIcon` は 4 name の同形
(`widget-grid-icons.tsx:274+`)。

### GestureOverlay (画像カスタマイズ候補 #1)

`Component.tsx:138-173`:

```tsx
function GestureOverlay({
  isActive,
  path,
}: {
  isActive: boolean;
  path: ReadonlyArray<{ x: number; y: number }>;
}): JSX.Element | null {
  if (!isActive) return null;
  const lastPoint = path[path.length - 1];
  return (
    <svg
      className="absolute inset-0 pointer-events-none z-100 overflow-visible"
      aria-label="Gesture path overlay"
    >
      <title>Gesture path overlay</title>
      {path.length > 1 && (
        <polyline
          points={path.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="var(--action-primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {lastPoint && (
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r="3"
          fill="var(--action-primary)"
        />
      )}
    </svg>
  );
}
```

stroke と fill はどちらも `var(--action-primary)` を参照しており、現状は
**色を theme token で切り替える経路のみが存在する**。ユーザが画像
(PNG / SVG / emoji) を stroke / circle に割り当てる経路は無い。

### AlignIcon / TargetIcon (画像カスタマイズ候補 #2)

`widget-grid-icons.tsx:63-272`:

```tsx
export function AlignIcon({ name }: { name: string }): JSX.Element {
  return (
    <Svg size={20} shapeRendering="geometricPrecision">
      {name === "align-left" && ( /* 20 SVG primitives */ )}
      {name === "align-center-h" && ( /* 9 SVG primitives */ )}
      ...
      {name === "distribute-end" && ( /* 9 SVG primitives */ )}
    </Svg>
  );
}
```

各 name 分岐は **静的な SVG 要素の羅列**。props / state 経由で切り替わる
部分は `<Svg>` の size / className 程度。21 name × 各 4-15 primitive の
**完全ハードコード**。

### 比較対象: anchor-point widget

Issue #77 で抽出済みの `src/function/widget/core/anchor-point/`:

| 観点 | align | anchor-point |
|------|-------|--------------|
| Component.tsx 行数 | 546 | 240 |
| gesture map | `GESTURE_MAP` (22 entry) | `ANCHOR_GESTURE_MAP` (20 entry) |
| overlay | `GestureOverlay` (SVG polyline + circle) | `AnchorPointGestureOverlay` (SVG polyline + circle + 認識ラベル text) |
| overlay の色 | `var(--action-primary)` | `var(--action-primary)` |
| 9-position 描画 | N/A | CSS `top`/`left` での線描画 (`Component.tsx:79-110`) |
| sub-icon ライブラリ | `AlignIcon` / `TargetIcon` (21+4 SVG) | 無し (CSS のみ) |
| descriptor icon | `"AlignCenter"` (Lucide) | `"Crosshair"` (Lucide) |
| Storybook variants | `Default`, `Compact` | `Default`, `Large`, `GesturePreview` |

anchor-point には AlignIcon に相当する icon ライブラリが**無い**。9 個の
anchor 位置は CSS で 2 本の線 (horizontal + vertical) を交差させて描画
する。image カスタマイズの対象は (a) GestureOverlay の色 (b) 線の色/太さ
の 2 軸のみで、align の 21 sub-icon ほど表面が無い。

### 既存 customization surface

preset icon 側には既に `PresetIcon` 型が存在する (`src/management/preset/contract.ts:41-45`):

```ts
export type PresetIcon =
  | { type: "text"; param: TextParams }
  | { type: "emoji"; param: EmojiParams }
  | { type: "image"; param: ImageParams }
  | { type: "canvas"; param: CanvasParams };
```

`PresetIconEditor` (`src/management/preset/components/IconEditor.tsx`) と
永続化 (`icon-data.ts`) が既に動く。ただしこれは **preset catalog の
thumbnail / workspace tile 専用**で、widget action icon には適用されて
いない。

widget 側に image customization のための型・ストレージ・エディタ UI は
**全て存在しない**。

### Descriptor contract の現状

`src/function/widget/define.ts:58-84`:

```ts
export type WidgetDescriptor = {
  type: string;                  // "align"
  nameKey: string;               // "widgets.align.name"
  descriptionKey?: string;       // 説明文 i18n key (optional)
  icon: string;                  // Lucide icon name (e.g. "AlignCenter")
  minSize: WidgetSize;
  maxSize: WidgetSize;
  defaultSize: WidgetSize;
  available: boolean;
  resizable: boolean;
  category?: "core" | "utility" | "media" | "phase4";
  defaultPresetId?: string;
  component: ComponentType<WidgetRenderProps>;
};
```

`icon` は widget catalog の一覧表示用 (Lucide 名) で、widget 内部の
sub-icon とは**別の概念**。sub-icon の customization を入れるなら
descriptor に新規フィールドを追加する必要がある。

### Storybook

`src/function/widget/core/align/Component.stories.tsx`:

- `Default` (240x240)
- `Compact` (160x160)

の 2 variant のみ。custom image variant は**無い**。anchor-point 側は
`Default`, `Large`, `GesturePreview` の 3 variant。

### State persistence

`useWidgetRuntime` (`src/function/widget/runtime-context.tsx`) は
`state` を SurfaceState から取るが、widget 個別の画像メタデータを
保存する slot は無い。

workspace tree の widget レコードは `docs/architecture/data/workspace-records/widget/types.md`
に型定義があるが、`type` (widget type 文字列) と `param` (省略可) のみ
で、icon / image メタデータは持っていない。

`layout/grid-document.ts` の `Layout` も `{id, widgetType, x, y, width, height}`
のみ。widget 毎のユーザ設定を持続化するパスは workspace tree に置くか、
settings 配下に置くかの選択肢があるが、現状は **どちらも未配線**。

## Findings

### Finding F1 — Issue が参照する `handler.ts:432-495` は存在しない

`rg 'alignGesture|renderAlignGestureOverlay|ALIGN_GESTURE_MAP' src/` の結果は
`use-anchor-gesture.ts:5` の legacy alias を指すコメント 1 件のみで、
`handler.ts` 内には残っていない。これは Issue #77 (anchor-point gesture
抽出) で `useAnchorGesture` hook + `Align` widget に移された結果である。

Issue 本文の参照パスは無効。ただし Issue の「alignment widget を画像
カスタム可能にしたい」という要求自体は引き続き有効で、抽出先
(`src/function/widget/core/align/Component.tsx`) に同じ表面が存在する。

**重大度:** Issue 修正の必要はないが、Issue 本文の説明が現状と乖離しているため
参照パスの更新が必要。

### Finding F2 — alignment widget は 3 種類の画像サーフェスを持つ

1. **Gesture overlay** (stroke + circle): `Component.tsx:148-171`
2. **Action sub-icons** (21 + 4 SVG): `widget-grid-icons.tsx:63-272, 274+`
3. **Widget catalog icon** (1 Lucide name): `descriptor.ts:18`

このうちユーザが「キー画像」と言っているのはどれかが**未確定**。
gesture overlay は animation 中の 1 枚の描画、sub-icon は常時表示の 21
個、catalog icon は widget 選択 UI のみ。対象によって実装規模が大きく
変わる。

**重大度:** 要求確認の必要条件。Issue 修正のブロッカー。

### Finding F3 — descriptor contract に画像カスタマイズのフィールドが無い

`WidgetDescriptor` (`src/function/widget/define.ts:58-84`) は `icon` (Lucide
名) を持つが、widget action 内部の sub-icon を差し替えるメタデータ
フィールドは無い。preset 側に `PresetIcon` (text/emoji/image/canvas) が
あるのに対し、widget 側には相当する型が無い。

→ sub-icon customization を入れる場合、descriptor へのフィールド追加
(`subIcons?: Record<ActionName, PresetIcon>` 等) が必要。**既存型との
整合性は要検討** (function/widget 層から management/preset/contract.ts
への依存はレイヤ違反のため、共有型への昇格が必要)。

### Finding F4 — image customization surface が widget 側に皆無

preset catalog と icon editor は完備しているが、widget action icon 用
の:

- 型定義 (`PresetIcon` の widget 版)
- 永続化先 (`workspace tree` の `param` か settings か)
- editor UI (`PresetIconEditor` の widget 版)
- レンダラ (`AlignIcon` が PresetIcon を受け取れる形への変更)

が**全て未実装**。widget icon の image カスタマイズを行う場合、これらを
一通り新規追加する必要がある。

### Finding F5 — anchor-point との対比: align の方が表面が大きい

anchor-point widget (Issue #77 で抽出) は GestureOverlay のみが画像
カスタマイズ候補で、sub-icon は CSS 線描画のため画像化のメリットが
薄い。align widget は 21+4 個の sub-icon と GestureOverlay の **合計 26+
箇所** がカスタマイズ候補となり、anchor-point より遥かに実装規模が大きい。

→ Issue #88 (anchor-point 用) を先に close してから #89 に着手する
方が、descriptor 拡張の影響範囲を段階的に評価できる。

### Finding F6 — i18n には `widgets.align.name` が既に存在

`src/management/i18n/locales/en/widgets.json:91-93` に
`"align": { "name": "Align" }` が定義されている (ja: 整列, zh: 对齐 等)。
description は `selector.descriptions.align` として全 10 locale に揃って
いる。

→ sub-icon 名 (align-left, distribute-spacing-v 等) は現状 UI 露出が
少ないが、`title={action}` (button title 属性) で attribute 表示が
されている。新たな i18n key は sub-icon の tool tip やヘルプ文で必要に
なる可能性あり。

### Finding F7 — GestureOverlay は action 認識ラベルを持たない

`Component.tsx:138-173` の `GestureOverlay` は stroke と終点 circle を
描くのみで、anchor-point の `AnchorPointGestureOverlay`
(`anchor-point/Component.tsx:91-144`) のように認識 action のラベルを
overlay に出す機能はない。

これはカスタマイズ要求と直接は関係しないが、もし「ユーザがジェスチャー
中の overlay に自分の画像 (ヒットマーカー等) を表示したい」というのが
要求の真意なら、`recognizedAction` を overlay に表示する設計変更も
必要になる (現状は `gesture.recognizedAction` を deconstruct していない)。

### Finding F8 — `getSelectionCount` の戻り値が動的

`Align` 本体の `run` (`Component.tsx:344-359`) は `host("getSelectionCount",
[])` を呼び出し、selection count に応じてボタンの disable を切替える。
image customization を導入してもこの IPC 契約には影響しない (image
customization は描画層のみで完結する)。

→ 実装時に IPC / ExtendScript 側を触る必要はない。

## Verdict

Issue #89 は 3 つの異なる対象を取り得る要求で、現コードベースには
customization surface が存在しない。

- **技術サーフェスの有無:** 無し。descriptor 拡張 + Component 書き換え +
  永続化 + editor UI の 4 軸すべてが新規実装となる。
- **最小実装:** `Align` の 21 sub-icon のみを `Record<Action, PresetIcon>`
  形式でユーザ差し替え可能にする。GestureOverlay と widget catalog icon は
  既存のまま。コスト ~ S。
- **中規模:** 21 sub-icon + 4 target icon 差し替え + GestureOverlay の
  stroke / circle を PresetIcon で描画可能に。コスト ~ M。
- **最大実装:** 上記 + widget catalog icon の差し替え + 9 wave の Storybook
  variant + 10 locale i18n + descriptor contract ドキュメント。コスト ~ L。

Issue 自体が要求確認ステータスなので、**実装可否の判断は Issue #88
(anchor-point 用) の結果を見てから** 段階的に行うのが妥当。要求が
「21 sub-icon を preset icon と同様にしたい」の一点に絞られれば、
descriptor へのフィールド追加と Component のレンダラ差し替えで
最小実装は成立する。

## Suggested follow-up

優先度順 (効果 / コスト比)。

1. **Issue コメントで対象サーフェスを確認** (低コスト・即時)
   - 「ジェスチャー overlay の色」「align widget 内の sub-icon 21 個」
     「widget catalog icon (`AlignCenter` Lucide)」のどれを意図しているか
     を 1 リプライで確定させる。
   - 確定後、本 Issue を `enhancement` のまま残すか、`P3` のまま target
     version 0.10.0 で着手するか判断する。

2. **anchor-point Issue #88 を先行 close する** (低コスト)
   - #88 が「9 ポジション共通の 1 画像を編集」「9 ポジションそれぞれ独立
     編集」「preset と同様の catalog ベース」のどれに分岐するか先に確定
     させ、その分岐結果を #89 の descriptor 拡張設計にフィードバックする。
   - 共通 descriptor 拡張 (`widgetIconOverride?: PresetIcon | Record<key, PresetIcon>`)
     を #88 / #89 で共有する形にすれば、#90 以降の widget icon カスタマイ
     ズ要求にも転用できる。

3. **descriptor contract 拡張の ADR** (中コスト)
   - 対象: `src/function/widget/define.ts` の `WidgetDescriptor`。
   - 変更案: `subIcons?: Readonly<Partial<Record<ActionKey | TargetKey, PresetIcon>>>`
     のようなフィールドを追加する。
   - `PresetIcon` を `function/widget` から参照するため、`management/preset/contract.ts`
     の `PresetIcon` を `shared/contract/preset` に昇格するか、widget 用の
     縮小版 (`WidgetIcon = PresetIcon`) を shared に置くかを ADR で決定する。
   - 永続化先は `Layout.param` (workspace tree) か settings 配下かを決定
     する。`Layout.param` は widget type に依存しない汎用 slot として既に
     存在するため、こちらが第一候補。

4. **最小実装 (Issue 起票後)** (中コスト)
   - `AlignIcon` / `TargetIcon` を `PresetIcon | null` を受け取れるよう
     signature 拡張する。null / undefined のとき現状の hardcoded SVG。
   - `Align` 本体で descriptor から sub-icons マップを引き、各 `AlignButtonGrid`
     に配る。
   - Storybook に `WithCustomIcons` variant を追加する。
   - 永続化: `Layout.param.subIcons` として `Record<string, PresetIcon>` を
     保存。`useWidgetRuntime` の `state` 経由で受け取る。

5. **GestureOverlay の拡張 (Issue 起票後)** (中コスト)
   - `presetIconImage` の `src` を stroke / circle に割り当てる経路を作る。
     SVG path を stroke にするのは複雑なので、`text` / `emoji` を終点
     circle の位置に overlay する形が無難。
   - `recognizedAction` を overlay に渡してラベル表示する変更も同時に入る。

6. **テスト観点の補強** (将来 Issue)
   - `Component.test.tsx` (現状 anchor-point には `index.test.tsx` あり) を
     新設して、画像差し替え時のレンダリング分岐を pin。
   - `widget-grid-icons.test.tsx` を新設して、`PresetIcon` 入力時の
     SVG 生成を検証。

7. **クロージング判断**
   - 30 日 (2026-10-11 頃) までに要求確定コメントが無い場合、Issue を
     `wontfix` ラベルで Close。
   - 要求確定し実装に着手する場合、priority P3 → P2 / size M 程度に見直
     し、target version を 0.10.0 → 0.11.0 に後ろ倒しする可能性あり。

## 参考リンク

- Issue: <https://github.com/rebuildup/ty-plus/issues/89>
- Issue #88 (anchor-point 対応): <https://github.com/rebuildup/ty-plus/issues/88>
- Issue #77 (anchor-point 抽出): <https://github.com/rebuildup/ty-plus/issues/77>
- Align Component: `src/function/widget/core/align/Component.tsx`
- Align Descriptor: `src/function/widget/core/align/descriptor.ts`
- Align Stories: `src/function/widget/core/align/Component.stories.tsx`
- Align script (ExtendScript): `src/function/widget/core/align/script.ts`
- Align time script: `src/function/widget/core/align/time-script.ts`
- Widget icons: `src/management/workspace/surface/widget-grid-icons.tsx`
- Gesture hook: `src/shared/component/interaction/use-anchor-gesture.ts`
- Anchor-point Component: `src/function/widget/core/anchor-point/Component.tsx`
- Anchor-point Descriptor: `src/function/widget/core/anchor-point/descriptor.ts`
- Widget descriptor: `src/function/widget/define.ts`
- Preset icon contract: `src/management/preset/contract.ts`
- Preset icon editor: `src/management/preset/components/IconEditor.tsx`
- Widget boundary doc: `docs/architecture/widget-boundary.md`
- Anchor-point widget doc: `docs/architecture/widget/anchor-point.md`
- Widget records doc: `docs/architecture/data/workspace-records/widget/types.md`
- AGENTS.md: `/home/basic/work/ty-plus/AGENTS.md`
- CLAUDE.md: `/home/basic/work/ty-plus/CLAUDE.md`
