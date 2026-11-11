# Issue #90 — `bug(directory-browser.list): list view の「上へ」ボタンがスクロールで流れないこと (要再現)`

**Status:** Open (P3, Target 0.10.0)
**Area/Component:** management (directory browser)
**Base SHA:** `2173b3979d31bddbc5289a91bed44ef81171c4d4` (`release-0-9-0` HEAD)
**Analysis mode:** Strict read-only. No code modified. No PR opened.

## 1. Issue claim

`src/management/storage/ui/DirectoryBrowser.tsx:441-444` の list mode 「上へ」行は
`border-b border-border-default` 付きの固定行として描画される。報告ではスクロールで
流れるとのことだが、現コード上はスクロール先頭で「上へ」行が毎回見えても不思議ではない
(スクロール終端で隠れる挙動とは別物)。

Acceptance conditions (要再現 → 修正後):

- list mode の「上へ」行がスクロール後も意図した位置 (スクロール領域の先頭 or 末尾) に維持される。
- `bun run ci` が green。

Closing policy: 30 日以内に再現手順が共有されない場合は Close。`wontfix` 経路あり。

## 2. Render structure under analysis

Source file: `src/management/storage/ui/DirectoryBrowser.tsx` (read at base SHA).

### 2.1 List-mode return value (lines 424-459)

```tsx
return (
    <div
        data-directory-browser-body=""
        className="ty-shell-directory-browser flex min-w-0 flex-col rounded-md border border-border-default bg-surface-dialog overflow-hidden h-full"
    >
        <div className="ty-shell-directory-scroll overflow-y-auto flex-1 min-h-0">
            {loading ? (
                <div className="grid min-h-28 place-items-center text-(length:--ty-shell-text-size-sm) text-text-muted">
                    {loadingLabel}
                </div>
            ) : (
                <>
                    {canGoUp ? (
                        <div className="ty-shell-directory-up border-b border-border-default bg-[color-mix(in_oklab,var(--color-surface-widget)_50%,var(--color-surface-dialog))]">
                            {renderListRow(previewEntry, handleUpRowClick, undefined)}
                        </div>
                    ) : null}
                    {displayedEntries.length === 0 ? (
                        <div className="px-2 py-3 text-(length:--ty-shell-text-size-sm) text-text-muted">
                            {emptyLabel}
                        </div>
                    ) : (
                        displayedEntries.map((entry) =>
                            renderListRow(
                                entry,
                                () => handleRowClick(entry),
                                () => handleRowActivate(entry),
                            ),
                        )
                    )}
                </>
            )}
        </div>
        {footer}
    </div>
);
```

### 2.2 `renderListRow` and `shellRowWrap` (lines 132-135, 213-295)

```tsx
const shellRowWrap = "border-b border-border-default last:border-b-0";
```

```tsx
const renderListRow = (
    entry: DirectoryBrowserEntry,
    entryOnClick: () => void,
    entryOnActivate?: () => void,
): JSX.Element => {
    ...
    return (
        <div key={entry.path} className={shellRowWrap}>
            <div ...>
                <button ...>
                    ...
                </button>
                ...
            </div>
        </div>
    );
};
```

### 2.3 Footer (lines 331-350)

```tsx
const footer = (
    <div
        className={cx(
            "flex items-center gap-2 border-t border-border-default bg-surface-widget py-0 px-1 shrink-0",
        )}
    >
        ...
    </div>
);
```

### 2.4 Grid-mode comparison (lines 353-423)

The grid (icons) branch has a `listHeader` slot that is rendered with sticky
positioning, but the 「上へ」 button itself is NOT sticky in either mode:

```tsx
<div
    className="ty-shell-directory-scroll grid auto-rows-min content-start items-start gap-1 p-1.5 overflow-y-auto flex-1 min-h-0"
    style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cellBaseRem * scale}rem, 1fr))` }}
>
    {loading ? (...) : (
        <>
            {listHeader ? (
                <div className="sticky top-0 z-10">{listHeader}</div>   // sticky
            ) : null}
            {canGoUp ? (
                <button
                    type="button"
                    className="group relative flex h-auto flex-col items-stretch self-stretch overflow-hidden rounded-shell-sm border border-border-default bg-surface-dialog transition-colors hover:bg-interactive-hover min-w-0 max-w-full"
                    onClick={onGoUp}
                >
                    ...                                                            // not sticky
                </button>
            ) : null}
            ...
        </>
    )}
</div>
```

## 3. Static-analysis findings

### 3.1 Scroll parent

The scroll parent is the `.ty-shell-directory-scroll` div at line 429. Its classes
are `overflow-y-auto flex-1 min-h-0`. The 「上へ」 div (`.ty-shell-directory-up`,
line 437) is a direct child of this scroll parent. The footer is a sibling of
the scroll parent (placed after it in the JSX at line 457).

DOM hierarchy (list mode):

```
div.ty-shell-directory-browser                    // flex column, overflow-hidden, h-full
├── div.ty-shell-directory-scroll                 // overflow-y-auto, flex-1, min-h-0  <-- SCROLL PARENT
│   ├── div.ty-shell-directory-up                 // list-mode "Up" row (normal flow, no positioning)
│   │   └── div (shellRowWrap = border-b ...)
│   │       └── div.flex.min-w-0.items-stretch.gap-1
│   │           └── button (the up-row button)
│   ├── div (entry rows)                          // repeated for each entry
│   │   └── ...
│   └── div (emptyLabel, if no entries)
└── div (footer)                                  // sibling of scroll parent, NOT inside it
```

### 3.2 Positioning on the 「上へ」 row

- No `sticky`, `fixed`, or `absolute` positioning is applied to the up-row.
- No `top`, `bottom`, `left`, or `right` value is set.
- `position` resolves to `static` (the default).
- The Tailwind class `border-b border-border-default` is purely a 1px bottom
  border; it has no effect on positioning.
- `bg-[color-mix(...)]` is a static background; no positioning impact.

The className `ty-shell-directory-up` is not declared anywhere in any `.css`
file in the repository (`src/management/style/theme.css`,
`src/management/panel/styles/app.css`). It is used purely as a stable DOM
identifier / E2E selector hook.

### 3.3 Comparison to the grid-mode 「上へ」 affordance

In grid mode the up-affordance is a grid cell that scrolls along with the rest
of the grid for the same reason — no sticky positioning. The only sticky element
in the DirectoryBrowser body is `listHeader` (icons mode, line 372), which the
owner-supplied header can rely on for pinned column-titles. The 「上へ」 affordance
is intentionally not made sticky in either mode.

### 3.4 Comparison to the `listHeader` owner header

The owner (e.g. `src/function/widget/utility/directory-browser/Component.tsx:1974-1986`)
supplies `listHeader` with a non-sticky wrapper, and the kit upgrades it to
`sticky top-0 z-10` only inside the icons-mode scroll container (line 372).
There is no equivalent sticky wrapper for `listHeader` in the list-mode scroll
container. The list-mode owner header, if any, is not pinned.

### 3.5 Footer overlap

The footer is a sibling of `.ty-shell-directory-scroll`, not a descendant. It
is rendered after the scroll div in source order, and the outer
`.ty-shell-directory-browser` is `flex flex-col overflow-hidden`. The footer
itself uses `shrink-0`. There is no z-index stacking that would cause the
footer to overlap the scroll area: `flex-col` reserves height for the footer
first, then gives the remaining flex space to the `flex-1 min-h-0` scroll
child. The scroll container cannot bleed into the footer's footprint.

### 3.6 Existing tests

`src/management/storage/ui/DirectoryBrowser.test.tsx` covers click handlers,
controlled `viewMode`, and grid column scaling. No test asserts:

- That the up-row is sticky during scroll.
- That the up-row is NOT sticky during scroll.
- The scroll position of any row after a wheel event.
- The order/layout of up-row vs footer in the DOM.

Searches across `src/` for `scrollIntoView`, `scrollTop`, `position.*sticky`,
and `sticky top` returned only the `listHeader` line (372) and unrelated uses
in `src/management/widget/catalog.tsx` and `src/management/online/catalog/*`.

## 4. Classification

**Not a bug (in the rendering-defect sense).** The current code places the
list-mode 「上へ」 row inside the scroll container with no `sticky`/`fixed`/
`absolute` positioning. As a result:

- At scroll offset 0, the row is visible at the top of the scroll area.
- When the user scrolls, the row scrolls out of view together with the
  entries.
- The footer is a sibling outside the scroll container and cannot overlap the
  row.

This is exactly the "scrolls with content" behavior described in the report.
The issue submitter's framing ("`border-b` 付きの固定行として描画される", "the row
is rendered as a fixed row with a bottom border") does not match what the code
does — `border-b` does not pin anything; the row is in normal flow.

If the *intended* behavior is for the row to remain pinned at the top of the
scroll area while the user scrolls the entry list, that is a product/design
question rather than a rendering bug: the current code deliberately omits
`sticky top-0` from `.ty-shell-directory-up`. There is precedent for applying
that upgrade in the icons-mode `listHeader` (line 372), so a parallel change
for the list-mode up-row would be a one-line Tailwind addition, not a layout
redesign.

## 5. Open questions for reproduction

The issue remains in the 「要再現」 state. To confirm any change, the
following would have to be observed in the After Effects CEP host (which uses
Chromium Embedded; sticky-positioning behavior is the same as desktop Chrome
but the panel viewport height is constrained by AE's panel frame):

1. Open a folder with ≥ 50 entries in the directory browser at list view.
2. Scroll the list to the bottom. Does the up-row remain visible, scroll
   out of view, or get covered by the footer?
3. Scroll back to the top. Is the up-row visible at the top, or does the
   listHeader / first entry overlap it?
4. DevTools measurement of `.ty-shell-directory-browser`,
   `.ty-shell-directory-scroll`, and the footer `offsetHeight`s.

The repo has no jsdom-level scroll-position test for this row; only click and
controlled-mode contracts are covered (`src/management/storage/ui/DirectoryBrowser.test.tsx`).
Any new behavior should add a focused test for the chosen sticky/non-sticky
contract before landing.

## 6. Relevant file paths

- `src/management/storage/ui/DirectoryBrowser.tsx` — list-mode render (lines 424-459),
  icons-mode render (lines 353-423), `renderListRow` (lines 213-295), footer
  (lines 331-350), `shellRowWrap` constant (line 135).
- `src/management/storage/ui/DirectoryBrowser.test.tsx` — current test surface;
  no scroll-position assertions.
- `src/function/widget/utility/directory-browser/Component.tsx` — primary
  consumer (uses `<DirectoryBrowser>` at line 1866 and supplies `listHeader`
  at line 1974).
- `docs/architecture/widget-boundary.md` — DirectoryBrowser ownership
  statement (storage-managed).

## 7. Recommendation

Mark this issue `wontfix` until a reproduction is filed, per the issue's own
closing policy. The static layout is consistent and the report's described
behavior matches the code. If a maintainer decides the up-row should be
pinned, the fix is a localized Tailwind change on the list-mode wrapper at
line 437 (add `sticky top-0 z-10`) plus a targeted test. No structural refactor
is implied.
