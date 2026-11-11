# Issue #91 解析: fix(editor.icon): アイコンエディタのスタイル不安定・要素重なり (要再現)

**ベース SHA:** `2173b397` (release-0-9-0 HEAD)
**作業日:** 2026-09-11
**状態:** 解析のみ (read-only)
**Issue 番号:** [#91](https://github.com/rebuildup/ty-plus/issues/91)
**ラベル:** bug / P3 / Target Version 0.10.0

## Summary

Issue #91 の前提 — "`src/management/preset/editor/View.tsx` / `Code.tsx` 配下のアイコン
エディタで、スタイルが不安定 / 要素が重なるとの報告が上がっている" — は部分的に
コードベースの実体と一致しない。ベース SHA `2173b397` 時点で

1. `src/management/preset/editor/View.tsx` は 17 行の `CodeEditor` の薄い wrapper
   であり、`editor/Code.tsx` も Monaco エディタ (`CodeEditor`) であり、どちらも
   "アイコンエディタ" ではない。
2. アイコンエディタは `src/management/preset/components/IconEditor.tsx`
   (`PresetIconEditor`) に存在し、Issue 本文が想定する "preset/editor/View.tsx"
   ではない。
3. `assets/preset/*.svg` も存在しない — `src/management/preset/assets/` のファイル
   は `icons.ts` のみで、SVG ファイルは 0 件。
4. `editor/View.tsx` と `Code.tsx` は Monaco を 1 つ出すだけの素直な縦並びで、
   `position: relative` + 子 `position: absolute` の重なりや `z-*` の競合は
   **存在しない**。
5. `IconEditor.tsx` の preview セクションには grid レイアウトに起因する
   「プレビュー tile の高さが右カラムの内容に依存して伸縮する」 instability が
   ある (Plausible bug)。
6. `IconEditor.tsx` の emoji picker は `absolute left-0 top-full z-50` で、
   親 dialog の `overflow-hidden` (`DialogShell` contentClassName) で下端が
   クリップされる。オーバーレイとして z-50 で描かれるため、後続の CodeEditor
   セクションの上に乗る。これは popup として想定された挙動だが、利用者の目には
   「要素重なり」 として観測される可能性がある。

→ Issue 本文は "未再現 (要再現)" を明示しており、本解析は仮説ベースで
  静的検査のみ行った。再現スクリーンショット無しでは根本原因の特定は不可。

## Code surface

### Issue 本文が言及したパス (存在 / 存在しない)

| パス | 種類 | ベース SHA 時点の状態 |
|---|---|---|
| `src/management/preset/editor/View.tsx` | source | 存在。17 行、`CodeEditor` の re-export ラッパー。スタイル定義なし |
| `src/management/preset/editor/Code.tsx` | source | 存在。730 行、Monaco `CodeEditor` 実装 |
| `src/management/preset/components/IconEditor.tsx` | source | 存在。287 行、`PresetIconEditor` の実体 |
| `src/management/preset/assets/preset/*.svg` | (存在しない) | ディレクトリ `src/management/preset/assets/` は存在し、ファイルは `icons.ts` 1 件のみ。SVG は 0 件 |
| `src/management/preset/editor/Code-resize.test.ts` | test | 存在。レイアウトではなく source-level 文字列 assertion |
| `src/management/preset/icon-editor.test.ts` | test | 存在。`createPresetIconDraft` / `draftToIcon` などの pure logic のみ |
| `src/management/preset/components/IconEditor.stories.tsx` | story | 存在。5 stories (`Default` / `Emoji` / `Image` / `Unframed` / `WithPresetPreview`) |

### `editor/View.tsx` の構造 (Issue 本文が言及したパス)

`src/management/preset/editor/View.tsx:1-17`:

```tsx
import type { JSX } from "react";
import type { CodeEditorValue } from "@/management/preset/editor/Code";
import { CodeEditor } from "@/management/preset/editor/Code";

export type EditorProps = {
    value: CodeEditorValue;
    onChange: (value: CodeEditorValue) => void;
    language?: string;
    readOnly?: boolean;
    className?: string;
};

export function CodeView(props: EditorProps): JSX.Element {
    return <CodeEditor {...props} />;
}

export { CodeView as Editor };
```

→ JSX は `<CodeEditor {...props} />` の 1 行のみ。**スタイル・レイアウト・
  position・z-index を一切持たない**。本ファイルが「アイコンエディタの
  スタイル不安定」の原因になることはない。

### `editor/Code.tsx` の構造 (Monaco wrapper)

`src/management/preset/editor/Code.tsx:699-729` (CodeEditor の JSX 部分):

```tsx
return (
    <div
        className={cx(
            "rounded-shell-sm border border-border-default bg-surface-widget overflow-hidden",
            className,
        )}
    >
        {volarError && (
            <div
                role="alert"
                className="flex items-start gap-2 rounded-shell-sm border border-status-error/30 bg-status-error/10 p-2 text-(length:--ty-text-size-xs) text-status-error"
            >
                [Volar] {volarError}
            </div>
        )}
        <div
            ref={containerRef}
            style={{
                width: "100%",
                height: `${editorHeight}px`,
                minHeight: `${RESIZE_MIN_HEIGHT}px`,
            }}
        />
        <ResizeHandle
            editorHeight={editorHeight}
            onResizeStart={handleResizeStart}
            onResizeMove={handleResizeMove}
            onResizeEnd={handleResizeEnd}
        />
    </div>
);
```

`ResizeHandle` (Code.tsx:404-429):

```tsx
<div
    role="separator"
    aria-orientation="horizontal"
    tabIndex={0}
    aria-label="Resize code editor"
    aria-valuenow={editorHeight}
    aria-valuemin={RESIZE_MIN_HEIGHT}
    aria-valuemax={RESIZE_MAX_HEIGHT}
    onPointerDown={onResizeStart}
    onPointerMove={onResizeMove}
    onPointerUp={onResizeEnd}
    onPointerCancel={onResizeEnd}
    className="h-3 cursor-ns-resize touch-none select-none"
    style={{ cursor: "ns-resize" }}
    data-ty-code-resize-handle=""
/>
```

観察点:

- 外側 wrapper は `overflow-hidden`。これは Monaco のクリッピング目的。
- `volarError` が出るときは Monaco container の **上** に通常フローとして
  描かれる (`Code.tsx:706-713`)。 `absolute` ではないため Monaco と重ならない。
  ただし `volarError` は内容が増えるため、CodeEditor 全体の高さは伸びる
  (`editorHeight + 12 (handle) + volarError`) — これは想定通り。
- Monaco container の inline style は `width: 100%`, `height: ${editorHeight}px`,
  `minHeight: 200px` (Code.tsx:716-720)。`RESIZE_MIN_HEIGHT = 200`,
  `RESIZE_MAX_HEIGHT = 800` (Code.tsx:22-23)。
- `ResizeHandle` は 12px の通常フローの footer strip。 **`absolute`
  配置は使われない** (`Code-resize.test.ts:80-92` で明示的に禁じている)。
- `position: relative` の親 + 子 `position: absolute` の組み合わせは **無い**。
- `z-*` ユーティリティは **無い**。

→ `Code.tsx` には「要素重なり」を引き起こす layout 構造は存在しない。
  `Code-resize.test.ts` が `absolute` 配置を明示的に禁じているのは、過去の
  regression (`absolute inset-x-0 -bottom-1` の handle が editor surface に
  overlap していた) を再発させないため (Code-resize.test.ts:80-92 参照)。

### `components/IconEditor.tsx` の構造 (本物の "アイコンエディタ")

`src/management/preset/components/IconEditor.tsx:239-285` (preview あり / なし分岐):

```tsx
const body = preview ? (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_auto] gap-x-2 gap-y-1">
        <div
            aria-label="Icon preview"
            className="row-span-2 grid aspect-square h-full w-auto shrink-0 grid-cols-1 grid-rows-1 justify-self-start overflow-hidden rounded-shell-sm bg-surface-widget"
        >
            <div className="min-h-0 min-w-0 h-full w-full overflow-hidden [&>*]:h-full [&>*]:w-full [&>*]:min-h-0 [&>*]:min-w-0">
                {preview}
            </div>
        </div>
        <div className="min-w-0">{tabs}</div>
        <div className="min-w-0">{fields}</div>
    </div>
) : (
    <div className="flex min-w-0 flex-col gap-1">
        {tabs}
        {fields}
    </div>
);

if (!framed) {
    return (
        <>
            {label ? <span className={fieldLabelClass}>{label}</span> : null}
            <div
                className={cx("flex min-w-0 flex-1 flex-col gap-1 p-2", className)}
            >
                {body}
            </div>
        </>
    );
}

return (
    <>
        {label ? <span className={fieldLabelClass}>{label}</span> : null}
        <div
            className={cx(
                "flex min-w-0 flex-1 flex-col gap-1 rounded-shell-sm border border-border-default bg-surface-widget p-2",
                className,
            )}
        >
            {body}
        </div>
    </>
);
```

`DefaultEmojiFields` 内の picker (IconEditor.tsx:90-111):

```tsx
{emojiPickerOpen ? (
    <div
        className={cx(
            "absolute left-0 top-full z-50 mt-1 max-h-[min(22rem,55vh)] w-[min(100%,22rem)] overflow-auto rounded-md border border-border-default",
            "bg-terminal-dialog p-1 shadow-lg",
        )}
    >
        <Picker
            data={data}
            theme="dark"
            previewPosition="none"
            skinTonePosition="none"
            onEmojiSelect={(emoji: { native?: string }) => {
                ...
            }}
        />
    </div>
) : null}
```

### 呼び出し元 / 配置

`src/function/preset/code/Dialog.tsx:545-557`:

```tsx
<AuthoringSection title={t("presetTool.form.icon")} span={6}>
    <PresetIconEditor
        draft={iconDraft}
        onChange={setIconDraft}
        browseDir={readUserHomeOrFallback()}
        preview={
            <FramedPresetGlyph
                preset={previewPreset}
                boxClass="h-full w-full"
            />
        }
    />
</AuthoringSection>
```

`src/management/preset/edit/Dialog.tsx:669-694` (code editor の直下):

```tsx
<PresetIconEditor
    draft={form.iconDraft}
    onChange={(next) =>
        dispatch({ type: "UPDATE_ICON_DRAFT", iconDraft: next })
    }
    disabled={busy}
    browseDir={preset.filePath}
    label="Icon"
    preview={
        <FramedPresetGlyph
            preset={
                {
                    id: "icon-preview",
                    type: "preset",
                    title: "Preview",
                    filePath: "ty-plus://icon-preview",
                    icon: presetIconDraftToPresetIcon(form.iconDraft) ?? {
                        type: "text",
                        param: { text: "?" },
                    },
                } satisfies Preset
            }
            boxClass="h-full w-full"
        />
    }
/>
```

`src/management/preset/edit/Dialog.tsx:957-958` (dialog shell content):

```tsx
contentClassName="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden !px-0 bg-surface-dialog"
```

→ Dialog のコンテンツは `overflow-hidden`。picker がダイアログ可視領域を
  超えるとクリップされる。

## Findings

### Finding F1 — Issue 本文の前提パスが指すファイルがアイコンエディタではない

**重大度:** Issue タイトル (`fix(editor.icon)`) と本文の前提が不一致

- `src/management/preset/editor/View.tsx` (17 行、`CodeEditor` の re-export)
  と `src/management/preset/editor/Code.tsx` (730 行、Monaco wrapper) は
  どちらも "code editor" であり "icon editor" ではない。
- "アイコンエディタ" は `src/management/preset/components/IconEditor.tsx`
  (`PresetIconEditor`) が実体。
- `src/management/preset/assets/preset/*.svg` は **存在しない**
  (`src/management/preset/assets/` のファイルは `icons.ts` 1 件のみ、
  SVG ファイル 0 件)。

→ Issue 起票者が「アイコンエディタ」のスタイル崩れと想定している対象は
  コードベース上は `IconEditor.tsx` である可能性が高い。`View.tsx` /
  `Code.tsx` のスタックを調査しても原因は出にくい。

### Finding F2 — `editor/View.tsx` と `Code.tsx` には要素重なりを起こし得る構造が無い

**重大度:** Issue 前提のうち "Code.tsx の monaco wrapping" を否定

- `Code.tsx` のラッパー DOM は 3 要素 (voler error 条件付き + Monaco
  container + ResizeHandle) の **通常フロー縦並び**。
- `position: relative` を持つ親は存在しない (`relative` クラスは
  `rg -n "relative" src/management/preset/editor/` で 0 件)。
- `position: absolute` を持つ子も存在しない (`Code-resize.test.ts:80-92`
  で `absolute` を明示的に禁じる assertion あり)。
- `z-*` Tailwind utility も `editor/` 配下には 0 件。
- ResizeHandle は `h-3` の 12px footer strip で、`overflow-hidden` の親で
  クリップされる Monaco container の下端に取り付く。

→ `Code.tsx` のレイアウトが「要素重なり」を引き起こす経路は存在しない。

### Finding F3 — `IconEditor.tsx` の preview グリッドが内容依存で tile サイズが変わる (Plausible bug)

**重大度:** "スタイル不安定" クレームと整合し得る

- `IconEditor.tsx:240-251` のグリッドは
  `grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_auto]` で、両行は
  `auto` 高さ。
- preview セルは `row-span-2` + `aspect-square` + `h-full` + `w-auto`
  (`IconEditor.tsx:243`)。つまり:
  - preview の高さは `h-full` で grid row span を埋める = 右カラム
    (tabs + gap + fields) の自然高さに等しい。
  - preview の幅は `w-auto` + `aspect-square` で高さに等しい。
- 右カラムの内訳:
  - row 1: `tabs` (IconEditor.tsx:249 → `IconEditor.tsx:197-211` の
    `flex ... p-0.5` の中に `h-7` の button 3〜4 個) — 高さ ~32-36px。
  - row 2: `fields` (IconEditor.tsx:250 → `IconEditor.tsx:213-237`) —
    選択中タブで高さが変わる。
- fields のタブ別高さ (実測なしの構造推定):
  - Text タブ: `DefaultTextFields` (`IconEditor.tsx:140-172`): Input +
    ColorSwatch × 2 を `flex items-center gap-2` で横並び → ~40px。
  - Emoji タブ: `DefaultEmojiFields` (`IconEditor.tsx:51-114`): button +
    ColorSwatch 横並び → ~40px。**picker は `absolute` なので fields の
    通常フロー高さに影響しない**。
  - Image タブ: `DefaultImageFields` (`IconEditor.tsx:116-138`):
    `PathField` の `uiSize="md"` → ~40px。
  - Canvas タブ: 2 つの ColorSwatch 横並び → ~40px。

→ タブ間で fields 高さは ~40px 付近で安定するため preview tile の縦方向
  サイズは比較的一定。**ただし picker を開閉した瞬間にも preview tile が
  動かない** (picker は absolute なので影響なし)。

ただし、**dialog の親幅が変わると right column の幅 (`minmax(0,1fr)`) が
変わる**。dialog が 28rem 幅 (Storybook decorator, `IconEditor.stories.tsx:35`)
より狭い場合、preview tile の `aspect-square` + `h-full` で計算された
高さが fields の自然な高さより大きく要求されるが、`w-auto` なので
preview tile の右カラム側 (minmax(0,1fr)) を侵食して縮む可能性がある。
これは dialog の幅依存で preview tile サイズが変動するシナリオ。

→ Issue 報告者が "panel-1 vs panel-2..5" や "dialog のリサイズ" で観測した
  とすれば、F3 の経路が原因である可能性が高い。ただし Storybook の
  `IconEditor.stories.tsx:35` の decorator (`w-[28rem] p-2`) で固定されて
  いるため、Storybook 単体では再現しない。

### Finding F4 — emoji picker が dialog content の `overflow-hidden` でクリップされ得る (Not a code bug, but observable)

**重大度:** "要素重なり" の観測を部分的に説明し得る

- picker の高さ上限: `max-h-[min(22rem,55vh)]` (IconEditor.tsx:93)。
- picker は `absolute left-0 top-full z-50` (IconEditor.tsx:93)。絵文字
  fields の `relative flex min-w-0 flex-col gap-2` (IconEditor.tsx:73) を
  起点に **下方向に overflow** する。
- `IconEditor.tsx` のフレーム wrapper 自体には `overflow-hidden` が **無い**
  (`IconEditor.tsx:275-279` のクラスは `flex min-w-0 flex-1 flex-col gap-1
  rounded-shell-sm border border-border-default bg-surface-widget p-2`
  のみ)。
- しかし呼び出し元の dialog content は `overflow-hidden` (例:
  `edit/Dialog.tsx:957-958`)。picker が dialog 可視領域の下端を超えると
  **dialog content でクリップ** される。
- picker の `z-50` は IconEditor の兄弟要素 (CodeEditor) よりは上に
  レンダリングされる。picker 開放時に CodeEditor (Monaco) の上端に
  picker が被ることがある。

→ popup として標準的な挙動だが、利用者が "要素重なり" として観測する
  シナリオは確かにあり得る。修正が必要な場合は (a) `DialogShell` の
  `overflow-hidden` を解除する、または (b) picker を Portal (`createPortal`)
  で `document.body` 直下に置く、または (c) picker の `max-height` を
  viewport 制約に対して控えめにする、のいずれかが候補。

### Finding F5 — `z-*` / `position: relative/absolute` のスタック競合は IconEditor 内に局在

**重大度:** Issue 仮説 "z-index 重複" を部分的に裏付け

- `src/management/preset/` 配下の `z-*` 使用箇所 (ripgrep):
  - `src/management/preset/group/ContainerCatalogTile.tsx:18` —
    `z-10` (badge)。
  - `src/management/preset/group/Panel.tsx:296` — `z-200` (debug
    overlay)。
  - `src/management/preset/components/IconEditor.tsx:93` — `z-50`
    (emoji picker popup)。
- `editor/` 配下に `z-*` / `relative` / `absolute` は **0 件** (ripgrep
  結果で確認)。
- Issue の "z-index 重複" 仮説が該当するのは `IconEditor.tsx:93` の
  `z-50` のみ。`z-10` (badge) および `z-200` (debug overlay) は
  IconEditor のダイアログ描画時に同時にアクティブになるかは別論。

→ `IconEditor.tsx:93` の `z-50` が他の popup / overlay と **stacking
  context を共有しているか**は報告者のスクリーンショット無しには確定
  できない。

### Finding F6 — レイアウトを pin する自動テストが無い

**重大度:** "スタイル不安定" を回帰検出する仕組みが皆無

- `Code.test.tsx` は module ロードのみ (`it("loads without errors", ...)`)。
- `Code-resize.test.ts` は **source-level の文字列 assertion** (DOM を
  レンダーしない)。`h-3`, `cursor-ns-resize`, `touch-none`, `select-none`,
  `role="separator"`, `aria-orientation="horizontal"` 等を source から
  grep しているだけ。
- `icon-editor.test.ts` は `createPresetIconDraft` / `draftToIcon` の
  pure logic のみ。JSX の構造・レイアウトには触れていない。
- `__e2e__/edit.test.tsx` は dialog の open / save / load のみ。
  preview tile の DOM 寸法 / 位置のアサートは無い。
- Storybook stories (`IconEditor.stories.tsx`) は 5 variants 存在するが、
  visual regression test は CI で見当たらない (`bun run ci` の出力に
  chromatic / loki / reg-suit は無し)。

→ 「タブ切替時に preview tile のサイズが変動する」「picker 開放時に
  CodeEditor が覆われる」を CI で pin する仕組みが無い。再発検出は
  人力スクリーンショット頼みとなり、Issue の "要再現" ステータスと整合。

### Finding F7 — Monaco `automaticLayout: true` + resize ロジックによる layout 競合は確認されず

**重大度:** Issue 仮説 "monaco editorのリサイズロジック (`Code-resize.test.ts`)
と外部 preview の layout 競合" を否定する根拠

- Monaco `create()` 呼び出し (`Code.tsx:359-393`) で `automaticLayout:
  true` を設定済み。これは Monaco が自身の container のリサイズを
  ResizeObserver で監視するオプション。
- 加えて `useEffect` のレイアウトパスで `requestAnimationFrame` +
  `setTimeout` の二段 layout を実行 (`Code.tsx:602-607`)。
- ResizeHandle ポインタ操作は container の inline `height` を直接更新
  (`Code.tsx:485`)。
- ResizeHandle は `<Editor>` → `<CodeEditor>` の中だけで完結する。
  外部 preview (`<FramedPresetGlyph>`) は IconEditor 側のグリッド
  (`IconEditor.tsx:240`) に属し、CodeEditor 側の DOM とは無関係。
- `dialog contentClassName` (`edit/Dialog.tsx:958`) に `overflow-hidden`
  があるので、CodeEditor を拡大しても dialog の高さは変わらない
  (CodeEditor の中身がクリップされる)。

→ "CodeEditor のリサイズと preview の layout 競合" は **構造上発生
  しない**。`Code.tsx:602-607` の `layout` 呼び出しが preview に波及する
  経路は無し。

### Finding F8 — デザインシステム token の逸脱は無い

**重大度:** Issue 仮説 "ad-hoc クラス" を否定

- `Code.tsx` / `IconEditor.tsx` / `View.tsx` のクラスはすべて Tailwind
  v4 トークン (`bg-surface-widget`, `border-border-default`,
  `rounded-shell-sm`, `text-text-muted`, `bg-status-error/30` 等) で
  構成される。`src/management/style/theme.css` で `@theme` ブロックに
  定義された `--color-*` / `--spacing-*` / `--radius-*` / `--text-*` の
  みを参照している。
- AGENTS.md の "Tailwind CSS v4 のトークン管理専用" ルールに反する
  class は見当たらない。

→ もし "不安定" の原因が token 由来だとすれば、`theme.css` 側の値が
  何らかの境界条件で破綻している可能性はあるが、本解析の範囲外
  (再現データ無しのため未検証)。

## Verdict

Issue #91 の前提のうち

- "`src/management/preset/editor/View.tsx` / `Code.tsx` 配下のアイコンエディタ"
  → **ファイル名の指す先 (View.tsx / Code.tsx) は icon editor ではない**
  (Finding F1)。
- "monaco editor のリサイズロジックと外部 preview の layout 競合" →
  **構造上発生しない** (Finding F7)。
- "z-index 重複" → **IconEditor 内の `z-50` (emoji picker) のみが該当**
  (Finding F5)。
- "要素重なり" → **picker 開放時に picker が CodeEditor の上に重なる /
  dialog の `overflow-hidden` で下端がクリップされる** シナリオは
  あり得る (Finding F4)。
- "スタイル不安定" → **IconEditor の preview grid が fields 行の
  高さに依存して tile サイズが変動する** 不安定性がある
  (Finding F3)。ただしタブ間で fields 高さは ~40px 付近で安定するため
  体感差は小さい。dialog 幅に依存した変動は起き得る。

→ 再現スクリーンショット無しには確定的な指摘は困難。F3 / F4 が報告の
  根拠である可能性は低くないが、確定はできない。Issue 本文の "30 日以内に
  再現共有されなければ Close" 方針が妥当。

## Suggested follow-up

優先度順 (効果 / コスト比)。

1. **報告者にスクリーンショットを依頼するコメント投稿** (低コスト・即時)
   - 「Tab 切替時 (Text → Emoji → Image → Canvas) に preview tile のサイズ
     が変動するか」を確認してもらう 30 秒動画。
   - 「Emoji picker を開いた瞬間、CodeEditor と picker が重なるか、
     picker の下端がクリップされるか」を確認してもらう静止画。
   - 既存 Issue コメントに "Please attach a screenshot of the dialog at
     the moment the issue occurs" とだけ書いて 30 日タイマーを走らせる
     (Issue 本文のクロージング方針に従う)。

2. **再現が来た場合のフォールバック検証手順**
   - DevTools の Elements ツリーで `aria-label="Icon preview"` ノードの
     `getBoundingClientRect()` を記録。
   - Tab を切り替えて矩形が変動するか確認。
   - `CodeEditor` の外側ラッパーの `getBoundingClientRect()` を記録し、
     `IconEditor` の `emoji picker` (`z-50`) と重なるか確認。
   - `DialogShell` の `contentClassName` (`overflow-hidden`) の影響範囲を
     DevTools で確認。

3. **F3 (preview grid instability) を pin する Storybook visual test**
   - 低コスト: `IconEditor.stories.tsx` に 28rem / 22rem / 18rem の
     decorator を追加し、3 幅 × 4 タブ = 12 variant の stories を用意。
     手動目視で "preview tile のサイズが大きく変わる" ケースを特定。
   - 中コスト: chromatic / loki などの visual regression test を CI に
     追加 (本 repo には未導入、bun run ci にも無し)。
   - 修正案: preview セルを `aspect-square h-full` ではなく **固定サイズ**
     (例: `h-12 w-12` または `aspect-square size-12`) にすれば grid 依存が
     消える。ただし preview の意味 (「実際の icon がどう見えるか」) が
     サイズ固定で損なわれるため、デザイナー判断が必要。

4. **F4 (picker overflow) を pin する test**
   - 中コスト: `IconEditor.stories.tsx` に「dialog を 320px 高さに制約
     した状態 + emoji picker 開放」の story を追加。
   - 修正案 (a) picker を Portal で `document.body` 直下に出す、
     (b) picker の `max-height` を `min(15rem, 40vh)` に下げる、
     (c) picker 開放時に IconEditor 内の他要素 (preview tile 等) を
     `visibility: hidden` にする。

5. **F6 (layout assertion が無い) の補強**
   - 中コスト: `Code-resize.test.ts` と同じ source-level assertion 方式で
     `IconEditor.tsx` のレイアウトクラスを pin するテストを追加。
     最低限: `grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_auto]`,
     `aspect-square h-full w-auto`, `absolute left-0 top-full z-50` を
     文字列 assertion。レイアウト invariant の drift を CI で検出可能。

6. **クロージング判断**
   - 30 日 (2026-10-11 頃) までに再現コメントが無い場合、Issue を
     `invalid` ラベルで Close。
   - 再現が成立し F3 / F4 が原因と確認された場合、priority P3 → P2 /
     size S 再評価。

## 参考リンク

- Issue: <https://github.com/rebuildup/ty-plus/issues/91>
- `src/management/preset/editor/View.tsx` — 17 行の wrapper
- `src/management/preset/editor/Code.tsx` — Monaco `CodeEditor`
- `src/management/preset/editor/Code-resize.test.ts` — source-level layout assertion
- `src/management/preset/components/IconEditor.tsx` — `PresetIconEditor` (アイコンeditor の実体)
- `src/management/preset/components/IconEditor.stories.tsx` — 5 variants (decorator: `w-[28rem] p-2`)
- `src/function/preset/code/Dialog.tsx:545-557` — IconEditor の呼び出し (AuthoringSection span=6)
- `src/management/preset/edit/Dialog.tsx:669-694` — IconEditor + CodeEditor 同居 (script preset)
- `src/management/preset/edit/Dialog.tsx:957-958` — `DialogShell` `contentClassName="... overflow-hidden ..."`
- `src/management/preset/workspace/glyph.tsx` — `FramedPresetGlyph` (preview content)
- AGENTS.md: `/home/basic/work/ty-plus/AGENTS.md`
- CLAUDE.md: `/home/basic/work/ty-plus/CLAUDE.md`
- theme tokens: `src/management/style/theme.css` (`@theme` ブロック)