# Issue #87 static analysis

- Issue: `bug(widget.info): サムネイル preset 表示時に React error #185 (要再現)` (P3, 0.10.0)
- Base SHA: `2173b3979d31bddbc5289a91bed44ef81171c4d4` (`release-0-9-0` HEAD)
- Scope: read-only static analysis of `src/function/widget/utility/info/preset.tsx`
- Verdict: **the report's hypothesis does not match the actual mechanism.** React #185 here is caused by an unstable `useEffect` dependency in `PresetInfoWidget`, not by `pickPreviewImageSrc` / `isPresetImageSrcSafe`. The image-src validator already blocks the reproduction payloads named in the ticket.

---

## 1. Files and helpers read

- `src/function/widget/utility/info/preset.tsx` — the component under analysis (the file the issue names).
- `src/function/widget/utility/info/preset.stories.tsx` — Storybook stub for the widget (renders a structural mirror; does not exercise the real `PresetInfoWidget`, so no coverage of the effect path).
- `src/function/widget/utility/info/index.ts` — `defineWidget` registration entry; mounts `PresetInfoWidget` as the `info` widget's component.
- `src/function/widget/render.ts` — `renderDescriptor(...)` injects `layout`, `state`, `grid`, `widthPx`, `widgetInstanceId` via `createElement`. There is no `React.memo`, no `useCallback`, no parent-side memoization that would stabilize props or skip renders.
- `src/function/widget/define.ts` — `WidgetRenderProps = { layout, state, grid, widthPx, widgetInstanceId }`. State is passed by reference from the workspace store; stability depends on the store.
- `src/management/preset/group/info-resolution.ts` — `resolvePresetsForInfoByCatalogIds(state, ids)` returns a freshly allocated `Preset[]` on every call (`const out: Preset[] = []; ... return out;`).
- `src/management/preset/image-src-for-browser.ts` — exports a *different* `isPresetImageSrcSafe` (accepts `file:` URLs and bare paths). **Not imported by `preset.tsx`**; the file uses the local copy at `preset.tsx:291`.
- `src/management/preset/contract.ts:271-290` — `Preset` type; `descriptionImage?: string`, `icon?: PresetIcon | string`. Both fields can hold arbitrary strings.
- `src/management/workspace/state.ts:65-66,111-112` — `presetSelectedIds: readonly string[]`, `presetHoverId: string | null`. State shape consumed by the widget.

There are no unit tests for `preset.tsx`. The widget is mocked in `src/function/widget/registry.integration.test.ts:67`. Therefore the bug surface is not exercised by CI for this widget today.

---

## 2. React #185 mechanism (the actual root cause)

### Finding F1 — `useEffect` deps on a non-memoized array, unconditional `setState` when items are non-empty

Location: `src/function/widget/utility/info/preset.tsx:64-71`

```tsx
const items = resolvePresetsForInfoByCatalogIds(state, ids);
const [presetInfoLast, setPresetInfoLast] = useState<Preset[]>([]);
useEffect(() => {
    if (items.length > 0) {
        setPresetInfoLast(items);
    }
}, [items]);
const effective = items.length > 0 ? items : presetInfoLast;
```

Why this is React #185:

1. `items` is computed inline on every render. `resolvePresetsForInfoByCatalogIds` allocates a new `Preset[]` on every call (verified at `src/management/preset/group/info-resolution.ts:16,33`).
2. `useEffect` lists `items` as its sole dependency. React compares deps with `Object.is`. A new array reference always fails `Object.is`, so the effect is scheduled to run after every render.
3. The effect's body fires `setPresetInfoLast(items)` whenever `items.length > 0`. The new state value is a *different* array reference than the previous `presetInfoLast`, so `Object.is(prev, next) === false` and React commits a re-render.
4. The re-render re-runs the function body, recomputing `items` as yet another fresh array. Steps 2-3 repeat indefinitely → React aborts with #185 (Maximum update depth exceeded).

The trigger is simply "items is non-empty". The image src, the `descriptionImage` content, the protocol, and the URL length are all irrelevant to the loop. The reproduction steps in the issue (data: / javascript: URLs) cannot reach the `<img>` element at all because `isPresetImageSrcSafe` rejects them — and even if they could, the loop would still fire because the effect runs before the `<img>` is reached.

Classification: **#185 root cause; `useEffect` deps discipline (Effect-2 / Effect-3).**

Suggested mitigations (for the implementer, out of scope here):

- Memoize `items` with `useMemo(() => resolvePresetsForInfoByCatalogIds(state, ids), [state.presets, state.groupCatalogEntries, idsKey])` and key `ids` by string content instead of by array reference. The current `ids` is already a fresh array (`[...selectedCatalog]` or `[hover]`), so the memo key needs to be the joined string.
- Or drop the "previous value" pattern entirely and switch to `useDeferredValue` / a derived selector that does not require `useState` mirror state. The mirror exists only to keep showing the last non-empty selection once the user clears it; that intent is better served by reading from `state.presetSelectedIds` / `state.presetHoverId` directly through a stable selector.
- If the mirror must stay, gate the effect with a content-stable key (length + ids key + a content hash) rather than the array reference.

### Finding F2 — Issue hypothesis about the trigger condition is inverted

Issue text (from `gh issue view 87`):

> 仮説: `presetInfoLast` state (line 65) の `useEffect` で `items.length === 0` のときに無限ループに入る条件がある可能性

This is incorrect. Tracing the effect:

```tsx
useEffect(() => {
    if (items.length > 0) {
        setPresetInfoLast(items);   // <-- setState fires only here
    }
}, [items]);
```

The setState is *gated by* `items.length > 0`. When `items.length === 0`, the effect runs (because the dep is a fresh array) but does not call `setPresetInfoLast`, so no re-render is triggered and the loop does not start. The infinite loop occurs when `items.length > 0`, the opposite of the stated hypothesis.

Classification: **incorrect diagnosis in the ticket.** Any reproduction attempt that follows the ticket's hypothesis (force `items` to be empty, e.g. by clearing selection) will fail to reproduce #185 — which matches the "(要再現)" annotation in the title.

### Finding F3 — Reproduction steps in the issue cannot reach the `<img>` element

Issue text:

> 1. preset icon に base64 data URL もしくは javascript: 形式の descriptionImage を仕込む
> 2. 該当 widget (presetInfo) を hover / selection で表示
> 3. コンソールに React error #185 が出るか確認

The image-src validator at `preset.tsx:291-305` already rejects these payloads:

```tsx
function isPresetImageSrcSafe(src: string): boolean {
    const t = src.trim();
    if (t.length === 0 || t.length > 2048) return false;
    const lower = t.toLowerCase();
    if (
        lower.startsWith("javascript:") ||
        lower.startsWith("data:") ||
        lower.startsWith("vbscript:")
    ) {
        return false;
    }
    if (/^https?:\/\//i.test(t)) return true;
    if (t.includes("://")) return false;
    return true;
}
```

`pickPreviewImageSrc` (lines 223-245) consults `descriptionImage` first, falls through to `icon.param.src`, and returns `null` if neither passes `isPresetImageSrcSafe`. With `data:` or `javascript:` in `descriptionImage`, `previewSrc` is `null`, `hasImage` is `false`, and the `<img>` branch at lines 194-204 is not rendered. So the ticket's reproduction cannot trigger any code that depends on the rendered `<img>`.

That said, **#185 still fires** for any non-empty `items`, regardless of `previewSrc`, because the loop is in `PresetInfoWidget` (line 66-70), not in `PresetCard`.

Classification: **reproduction steps misdirect the investigation.** The `<img>` rendering is a red herring for #185. Closing the loop requires fixing F1, not the image validator.

---

## 3. Image src validation review

### Finding F4 — `isPresetImageSrcSafe` (local copy) is correct for the use site

`src/function/widget/utility/info/preset.tsx:291-305` rejects:

- empty strings
- strings longer than 2048 chars
- `javascript:`, `data:`, `vbscript:` schemes (case-insensitive)
- any string containing `://` that is not `http(s)://`

That is sufficient to keep the `<img>` from being handed an executable or oversized source from the catalog. The validation does not call `setState`, does not interact with `useEffect`, and does not recurse — it is pure and side-effect-free.

One small observation (not a #185 cause): the function accepts arbitrary non-URL strings (`return true;` for paths without `://`). `<img src="C:\\foo.png">` will fail to load in the CEP panel, but that is a render-time browser behavior, not a React render loop. Out of scope for this ticket.

Classification: **no #185 contribution.** Safe as-is for the current `<img>` use.

### Finding F5 — Two divergent `isPresetImageSrcSafe` implementations exist

- `src/function/widget/utility/info/preset.tsx:291` — local copy. Used by `pickPreviewImageSrc`. Rejects `data:` / `javascript:` / `vbscript:`; allows `http(s)://` and bare non-`://` strings.
- `src/management/preset/image-src-for-browser.ts:1` — exports the same name but a different body: accepts `https:` and `file:` URLs and POSIX / Windows paths; rejects any other `scheme:` and any `://`. Used by `imageSrcForBrowser` for callers that need to coerce bare paths into `file:///...`.

Neither file imports the other. The two functions share a name but do not share semantics. This is not a #185 cause, but it is a latent maintenance hazard: any future contributor could assume they are the same and merge / import across files.

Classification: **not a #185 trigger; maintenance hazard.** Not blocking for this ticket; worth noting in the fix PR to prevent regression by picking the wrong copy.

### Finding F6 — `<img>` has no `onError` / `onLoad` handlers

Lines 196-202:

```tsx
<img
    className="max-h-48 w-full object-contain"
    src={previewSrc}
    alt=""
    loading="lazy"
    decoding="async"
/>
```

No `onError`, no `onLoad`. There is no `img.failure → setState` chain that could cause a render loop driven by image load events. Confirms that the image element itself is not a #185 source.

Classification: **not a #185 trigger.**

---

## 4. Other render-loop candidates ruled out

- **`useState` initializers**: `useState<Preset[]>([])` at line 65. Initial value is a static literal; no function form, no side effects. Cannot trigger #185 on its own.
- **`PresetInfoEmpty` / `HostFooter` / `PresetCard`**: pure render, no `useEffect`, no `useState`, no callbacks that call `setState` on a parent.
- **`formatPresetDescription` / `fileNameFromExecutionData` / `pickPreviewImageSrc` / `isPresetImageSrcSafe`**: pure functions, no hooks.
- **`<img>` callbacks**: none (F6).
- **Recursion**: none. `PresetInfoWidget` does not call itself; `PresetCard` does not recurse.
- **`useEffect` with `[]` deps and conditional setState**: not present. Only the items effect (F1) exists.

The only #185 candidate in the file is F1.

---

## 5. Cross-file checks (no findings, evidence only)

- `src/function/widget/render.ts:31-43` — `renderDescriptor` creates the element fresh on every call. No `React.memo` boundary, no prop stabilization. Confirms the widget re-renders whenever the parent re-renders.
- `src/management/preset/group/info-resolution.ts:16,33` — `const out: Preset[] = []` and `return out` always allocate fresh. Confirms the `items` reference is unstable across renders.
- `src/management/workspace/state.ts:65-66,111-112` — `presetSelectedIds` and `presetHoverId` are fields of the shared `SurfaceState`. They are typically stable across non-selection renders, but the widget does not memoize on them — it just feeds them through `resolvePresetsForInfoByCatalogIds`, which produces a fresh array anyway.
- `src/function/widget/utility/info/preset.stories.tsx:3-11` — Storybook renders a structural stub, not the real component, so the `useEffect` path is not covered by Storybook either.

---

## 6. Summary and recommendation for the implementer

| ID | Finding | Severity for #185 | Fix area |
|----|---------|-------------------|----------|
| F1 | `useEffect` deps on a fresh `items` array; unconditional `setState` when non-empty | Root cause | `preset.tsx:64-71` (memoize `items`, or rewrite the "previous value" pattern) |
| F2 | Issue hypothesis says loop fires when `items.length === 0`; actual condition is `items.length > 0` | Misdiagnosis in ticket | Re-orient the reproducer; loop fires with any non-empty selection/hover, no data:/javascript: payload needed |
| F3 | Reproduction steps target `data:` / `javascript:` URLs that the validator already rejects | Misdirection | Skip image-src manipulation in the reproducer; just trigger a non-empty hover/selection |
| F4 | Local `isPresetImageSrcSafe` is correct for the use site | None | No change |
| F5 | Two divergent `isPresetImageSrcSafe` implementations under different ownership | Latent hazard | Note in PR; do not unify mid-fix |
| F6 | `<img>` has no `onError` / `onLoad` | None | No change |

The fix for #185 is to stabilize the `useEffect` dependency in `PresetInfoWidget` (F1). The image-src validator and `<img>` rendering do not contribute to the bug and need no change for #185. Closing conditions listed in the ticket ("30 日以内に再現手順が共有されない場合は Close") remain valid: with F2/F3 corrected, the reproducer is trivial (hover or select any non-empty preset), so this ticket should be promoted out of P3 only after F1 is fixed, not on the strength of the original reproduction steps.

Out of scope (not requested): proposing the actual fix, writing the test, or opening the PR. This document is read-only analysis.