# Issue #88 static analysis

- Issue: `feat(widget.anchor-point): キー画像をカスタム可能にする (要求確認)` (P3, target 0.10.0)
- Base SHA: `2173b3979d31bddbc5289a91bed44ef81171c4d4` (`release-0-9-0` HEAD)
- Scope: read-only static analysis of the anchor-point widget's image-customization surface
- Verdict: **the technical surface is half there, but the per-cell contract is missing.** A persistent per-tile slot (`Layout.data`) exists and is dormant, and a full image render pipeline (`PresetIcon.image` → `GlyphCachedImage` → `ThumbnailTile`) already supports remote / local / data URLs with safety validation. What's *missing* is (a) a per-cell image payload on the widget descriptor, (b) any editor UI to assign an image to a cell, and (c) a writer for the dormant `Layout.data` slot. The issue is gated behind `要求確認`, so the analysis here is meant to clarify the three pre-implementation subquestions the author raised (one image for all 9 cells vs. nine independent cells vs. catalog-based), not to propose a fix.

---

## 1. Files and helpers read

- `src/function/widget/core/anchor-point/Component.tsx` — the panel component (239 lines).
- `src/function/widget/core/anchor-point/descriptor.ts` — `defineWidget({ type: "anchor-point", ... })`. 23 lines, no image payload.
- `src/function/widget/core/anchor-point/index.ts` — re-export shim for `script.ts`/`script.ext.ts`.
- `src/function/widget/core/anchor-point/script.ts` and `script.ext.ts` — ExtendScript template + `buildAnchorScript(position)`. No image involvement.
- `src/function/widget/core/anchor-point/Component.stories.tsx` — `Default`, `Large`, `GesturePreview`. No custom-image variant.
- `src/function/widget/core/anchor-point/index.test.tsx` — 4 direct-click regression tests; only verifies CEP `evalScript` invocation.
- `src/function/widget/define.ts` — `WidgetDescriptor` type and `defineWidget` registration.
- `src/function/widget/registry.ts`, `registry-core.ts`, `render.ts` — auto-aggregation, `renderDescriptor` mount adapter.
- `src/function/widget/contract.ts` — `WIDGET_TYPES = [..., "anchor-point", ...]`.
- `src/function/widget/index.ts` — public manifest; only API the management layer is allowed to consume.
- `src/function/widget/runtime-context.tsx` — `useWidgetRuntime()` exposes `host`, `activeWidgetInstanceId`, `setActiveWidgetInstanceId`. No settings surface.
- `src/management/workspace/layout/grid-document.ts:178-188` — `Layout` type with `data?: Record<string, unknown>`. **The dormant per-tile persistence slot.**
- `src/management/preset/contract.ts:14-78` — `ImageParams = { src: string }`, `PresetIcon` discriminated union (`text | emoji | image | canvas`), `presetIconImage(src)` constructor, `coercePresetCatalogIcon` legacy parser.
- `src/management/preset/icon-data.ts` — `tryParsePresetIconValue`, `coercePersistedPresetIcon`, `normalizePresets`.
- `src/management/preset/icon-editor.ts` — `PresetIconEditorDraft`, `presetIconToDraft`, `draftToIcon`. The four-kind icon editor (used by `IconEditor.tsx`).
- `src/management/preset/assets/icons.ts` — `resolveWorkspaceGlyphIconVisual(preset)` resolves `Preset.icon` + `descriptionImage` into a `PresetIconVisual` (`kind: "image" | "emoji" | "text" | "canvas"`).
- `src/management/preset/workspace/glyph.tsx` — `WorkspacePresetGlyph` (the in-tile renderer for all four `PresetIcon` kinds).
- `src/management/preset/workspace/GlyphCachedImage.tsx` — image-only delegate to `ThumbnailTile` via the Rust thumbnail cache pipeline.
- `src/function/widget/utility/directory-browser/ThumbnailTile.tsx` + `hooks/useThumbnail.ts` — Rust thumbnail dispatcher (`mtime_ms == 0` rejected, fixed sentinel timestamp documented).
- `src/management/preset/image-src-for-browser.ts` — `isPresetImageSrcSafe` and `imageSrcForBrowser`. The canonical image-src allowlist (`https:`, `file:`, absolute Windows/Unix paths; `javascript:`, `data:text/html`, and other schemes rejected). Used by `info` widget and DirectoryBrowser.
- `src/management/workspace/background/parse.ts:27-34` — `isSafeUrlScheme` (`https://` and `data:image/` only; rejects `javascript:` and others). The background-image allowlist. Same principle, narrower scope.
- `src/management/widget/catalog.tsx:48-62` — `WIDGET_ICONS: Record<string, LucideIcon>` maps the descriptor `icon` field to a Lucide component. Currently only `Crosshair` for `anchor-point`.
- `docs/architecture/widget/anchor-point.md` — anchor-point canonical spec. Confirms the 3×3 grid renders via `top`/`left` math and does not mention any image payload.
- `docs/architecture/widget/index.md` — index; only `anchor-point.md` is listed.
- `docs/architecture/widget-boundary.md` — interface/implementation boundary; `management` may only import `function/widget/index.ts`.
- `docs/architecture/storage/preset-assets.md` — preset assets live under `assets/workspace/...`. **No analog for "widget settings assets".**

---

## 2. Where the 3×3 grid is actually drawn

The issue body cites lines 79-110 of `Component.tsx` for the CSS-only rendering. That range is the **gesture-overlay SVG** (`AnchorPointGestureOverlay`, lines 91-144). The actual 3×3 grid lives at `Component.tsx:189-238`. The relevant structure:

```tsx
// lines 195-231 (paraphrased)
<div className="grid h-[94%] w-[94%] aspect-square grid-cols-3 grid-rows-3 ...">
  {ANCHOR_POSITIONS.map(([pos, xPct, yPct]) => {
    const isSelected = pos === currentAnchor;
    return (
      <button key={pos} type="button" data-ws-action="anchor-point" data-anchor={pos} title={pos} ...>
        <span className="absolute inset-[10%]">
          {/* Horizontal line */}
          <span className={`absolute left-0 right-0 block h-[2px] w-full ...`}
            style={{ top: yPct }} />
          {/* Vertical line */}
          <span className={`absolute top-0 bottom-0 block h-full w-[2px] ...`}
            style={{ left: xPct }} />
        </span>
      </button>
    );
  })}
</div>
```

`ANCHOR_POSITIONS` (lines 36-47) is the 9-row table `["top-left", "12%", "12%"]`, ..., `["bottom-right", "88%", "88%"]`. Each cell button renders **only** the intersecting horizontal + vertical line spans at the cell's `%` coordinates. There is no `<img>` or `WorkspacePresetGlyph` anywhere in the file. The visual is purely CSS lines.

The selected-vs-default state is rendered via inline Tailwind classes (`bg-[rgba(...)]`) on the two line spans (lines 219-226). The same `<button>` also handles gesture rejection (`gesture.isActive` short-circuits the click, lines 206-208) and the CEP `evalScript` dispatch on click (lines 205-213).

For an image-per-cell feature, the cell content (lines 216-227) is the slot to replace. The `top`/`left` math is **not on the button**; it is on the inner spans. Replacing just the spans (not the button grid) keeps the click / gesture / data-attribute behavior intact.

---

## 3. Widget descriptor contract (what's there, what's missing)

`src/function/widget/define.ts:58-84` defines `WidgetDescriptor`:

```ts
export type WidgetDescriptor = {
  type: string;
  nameKey: string;
  descriptionKey?: string;
  icon: string;                            // Lucide icon NAME (not URL)
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

The `icon` field is resolved by `src/management/widget/catalog.tsx:48-58` (`WIDGET_ICONS: Record<string, LucideIcon>`) — the descriptor's `icon` is a **key into a static Lucide map**, not an arbitrary URL. There is no parallel field for image-URL overrides.

`WidgetRenderProps` (lines 44-54) is what the component receives:

```ts
export type WidgetRenderProps = {
  layout: Layout;
  state: SurfaceState;
  grid: GridSettings;
  widthPx: number;
  widgetInstanceId: string;            // == layout.id
};
```

The component receives the full `Layout` object (so it could read `layout.data` if populated), but the registry contract itself does not carry any per-widget payload beyond the static metadata above.

**Finding — the descriptor contract is closed against image overrides.** There is no `customImage`, `iconUrl`, `presetImage`, `keyImage`, or any analog field anywhere in the descriptor or render-props shape. A full grep of `src/function/widget/` for `customImage|iconUrl|presetImage|customIcon|imageUrl|keyImage` returns **zero hits**.

**Finding — every widget descriptor currently uses the `icon: string` Lucide field identically.** `align` → `"AlignCenter"`, `easing` → `"TrendingUp"`, `anchor-point` → `"Crosshair"`, `menu` → `"Menu"`, etc. (`grep -n "icon:" src/function/widget/`). The pattern is consistent; extending it is mechanical.

---

## 4. Persistence surface — three candidate locations, none obvious

### 4a. `Layout.data` — dormant, but the closest fit

`src/management/workspace/layout/grid-document.ts:178-188`:

```ts
export type Layout = {
  id: InstanceId;
  widgetId?: InstanceId;
  widgetType: WidgetType;
  x: number;
  y: number;
  width: number;
  height: number;
  data?: Record<string, unknown>;     // ← dormant
};
```

The slot is declared, typed, and survives the persistence round-trip (`grid-document.ts:60-150` parses arbitrary `data` via `Record<string, unknown>` coercion — verified by reading the parse path; no consumer reads it back today).

A grep across `src/` for `layout\.data|tile\.data|widget\.data` returns zero hits. The slot is unused.

For "custom image per cell", the natural payload would be:

```ts
// conceptual, not implemented
type AnchorPointLayoutData = {
  cells?: Partial<Record<AnchorPosition, PresetIcon | string>>;
};
```

…stored under `layout.data` and read by `AnchorPointWidget` from `layout.data` at render time. Per-cell entries map cleanly to `ANCHOR_POSITIONS`. Persistence is automatic because `Layout.data` is part of the grid document that `cross-panel-write.ts:112` already reads and writes.

**Finding — `Layout.data` is a perfect fit for the persistence requirement, but adding a writer/reader is new contract.** The slot exists; nothing has ever populated or consumed it.

### 4b. `Preset` rows — wrong semantics

The existing `Preset` (`src/management/preset/contract.ts:271-290`) has `icon?: PresetIcon | string` and `descriptionImage?: string`. Persisting a 9-cell payload as a `Preset` would:

- Imply the anchor-point widget is "a preset", which it isn't (it's a widget, not a catalog entry).
- Drag in the full `presets.json` read/write path, sibling-thumbnail resolution, catalog-id stripping, and `normalizePresets` (`icon-data.ts:81-84`).
- Force a `PresetType` ("preset" | "script" | "plugin" | "footage") on a non-catalog entry.

This is the wrong layer. A widget-level image override should live in the grid document, not in `presets.json`.

### 4c. Global user preferences — doesn't exist

There is no `userPreferences` / `widgetSettings` / global config surface in `src/management/storage/`. The grid document is the only "user state" the codebase reads/writes today outside of preset assets. A global widget-settings file would be a new system.

**Finding — the persistence path is non-obvious.** The cleanest fit is `Layout.data`, but writing to it requires a new mutation path (the grid document is currently mutated only through tile add / move / resize flows, not arbitrary per-widget payloads). Building a writer is part of the feature cost.

---

## 5. Image / icon render infrastructure — already there

The codebase has a full image-render pipeline:

| Concern | Path |
|---------|------|
| Discriminated icon type (`text` / `emoji` / `image` / `canvas`) | `src/management/preset/contract.ts:41-78` |
| `image` constructor `presetIconImage(src)` | `src/management/preset/contract.ts:72-74` |
| Editor draft ↔ icon conversion (all 4 kinds) | `src/management/preset/icon-editor.ts` |
| URL safety allowlist (`https:`, `file:`, absolute paths; `javascript:`/`data:text/html` rejected) | `src/management/preset/image-src-for-browser.ts` |
| Tile renderer that delegates to all 4 kinds | `src/management/preset/workspace/glyph.tsx` (`WorkspacePresetGlyph`) |
| Image-only render → Rust thumbnail cache | `src/management/preset/workspace/GlyphCachedImage.tsx` → `ThumbnailTile.tsx` |
| Background-image safety allowlist (narrower) | `src/management/workspace/background/parse.ts:27-34` |

`WorkspacePresetGlyph` (`glyph.tsx:331-437`) handles all four icon kinds. For `kind: "image"` it returns `<GlyphCachedImage imagePath={visual.value} />`. `GlyphCachedImage` (`GlyphCachedImage.tsx:35-62`) builds a synthetic `FileBrowserEntry` (sentinel `modifiedAt = "2026-01-01T00:00:00.000Z"` because Rust dispatcher rejects `mtime_ms == 0`) and delegates to `ThumbnailTile`, which goes through the `useThumbnail` Rust gateway. This is the same pipeline the DirectoryBrowser uses.

The `info` widget already imports `WorkspacePresetGlyph` (per `grep -rn "WorkspacePresetGlyph" src/function/widget/`) at `src/function/widget/utility/info/preset.tsx:164` and `src/function/widget/utility/quick-actions/ActionList.tsx:180`. The dependency direction `function/widget/* → management/preset/workspace/glyph` is already established.

**Finding — image render infrastructure is fully built and already imported across the widget layer.** Adopting it inside `anchor-point/Component.tsx` requires no new pipeline; the existing `<WorkspacePresetGlyph preset={{ id, type: "preset", title: "", filePath: "", icon: cellIcon }} />` (or the lighter `GlyphCachedImage` directly) can be inserted inside each cell `<button>` to replace the line-spans.

**Finding — the existing safety validator rejects `javascript:` and `data:text/html` schemes**, which is the right security posture for an arbitrary user-supplied image. A new anchor-point cell renderer must funnel through the same `imageSrcForBrowser` / `isPresetImageSrcSafe` (or equivalent) to inherit this protection.

---

## 6. Storybook / test surface

- `Component.stories.tsx` — `Default`, `Large`, `GesturePreview`. No custom-image variant.
- `index.test.tsx` — 4 direct-click regression tests. None exercise an image path.
- No other widget story explores a per-cell image override.
- No directory-browser image variant is a useful analog (the browser shows preset tiles; it doesn't let the user assign an image *to* a cell).

**Finding — no existing test or story seed for "per-cell custom image".** A new story variant + new tests are part of the implementation cost regardless of which persistence path is chosen.

---

## 7. The three pre-implementation subquestions in the issue

The author named three branches the requirement could go down. Each maps to a different surface:

### Q1. "1 image for all 9 cells" vs. "9 independent cells"

- Single shared image: trivially fits `Layout.data = { sharedImage: PresetIcon | string }`. One slot in the editor, one render branch.
- Nine independent images: fits `Layout.data = { cells: Partial<Record<AnchorPosition, PresetIcon>> }`. Nine slots in the editor, nine render branches.
- Both are equally cheap on the read/render side. The cost difference is entirely in the editor UI.

### Q2. "Catalog-based" (preset picker) vs. "AE local file" vs. "SVG string" vs. "Standard presets"

- **Catalog-based** (preset picker): already supported by `PresetIconEditorDraft.type = "image"` with `imagePath` (`icon-editor.ts:13`), but the picker would be a new UI widget — there is no existing "pick a preset as cell image" surface. The catalog-add dialog (`src/management/preset/catalog-add/`) and the dialog icon section (`src/management/preset/tool-shell/DialogIconSection.tsx`) are the closest analogs.
- **AE local file**: file-path input. `GlyphCachedImage` already renders arbitrary file paths through the Rust thumbnail pipeline (with `file://` URL coercion via `imageSrcForBrowser`).
- **SVG string**: not currently supported by `PresetIcon` (the `image` kind is raster-only). Adding SVG would mean a new `PresetIcon` variant or a parallel "raw SVG" branch.
- **Standard presets** (built-in gallery): would require a curated list under `src/shared/` or `src/management/preset/assets/`. There is no such list today.

### Q3. "Alignment widget vs. anchor-point widget" confusion

The issue body notes that the user may be conflating this with `renderAlignGestureOverlay`. Verified by reading the align widget at `src/function/widget/core/align/Component.tsx`: `renderAlignGestureOverlay` is a drag-stroke visualizer (SVG lines drawn during gesture), not a configurable image per cell. The two are different concerns; this is a clarification the implementer should add to the closing comment if the issue ends up being closed as duplicate / out-of-scope.

---

## 8. Findings table

| ID | Finding | Classification |
|----|---------|----------------|
| F1 | The descriptor contract (`define.ts:58-84`) carries no image payload; `icon: string` is a Lucide name only. `WidgetRenderProps` carries no image override. | **Contract gap** |
| F2 | `Layout.data?: Record<string, unknown>` exists in `grid-document.ts:178-188`, is parsed through the persistence round-trip, and is currently **unused** by any consumer in `src/`. | **Dormant slot available** |
| F3 | Image render infrastructure is complete: `PresetIcon.image` (`contract.ts:72-74`), `WorkspacePresetGlyph` (`glyph.tsx`), `GlyphCachedImage` (`GlyphCachedImage.tsx`), `ThumbnailTile` (Rust gateway), `isPresetImageSrcSafe` + `imageSrcForBrowser` (`image-src-for-browser.ts`). | **Infrastructure present** |
| F4 | No existing per-cell editor UI for any widget. `icon-editor.ts` provides the 4-kind draft model but no widget-specific picker that lets the user assign images to a 3×3 grid. | **Editor UI missing** |
| F5 | No `presets.json`-style writer/reader for arbitrary widget payloads. The grid document mutation paths today cover only tile add / move / resize. | **Persistence writer missing** |
| F6 | Tests (`index.test.tsx`) and stories (`Component.stories.tsx`) cover click + gesture paths only. No regression net for "cell renders a custom image" or "cell falls back to default line span when no image is set". | **Test/story gap** |
| F7 | The dependency direction `function/widget/* → management/preset/workspace/glyph` is already established by `info` and `quick-actions` widgets, so importing `WorkspacePresetGlyph` (or `GlyphCachedImage`) inside `anchor-point/Component.tsx` does not violate the layer boundary. | **Architecture compatibility** |
| F8 | The 3×3 grid math is on the inner line spans (`style.top` / `style.left` at `Component.tsx:219-226`), not on the buttons themselves. Replacing the spans with an image render keeps the click / gesture / data-attribute behavior intact. | **Refactor scope localized** |
| F9 | The 9 anchor-position keys (`ANCHOR_POSITIONS` at `Component.tsx:36-47`) match the `AnchorPosition` union re-exported from `index.ts`. A `Partial<Record<AnchorPosition, …>>` map is a type-safe fit for the per-cell payload. | **Type fit** |
| F10 | Issue's hypothesis about confusion with `renderAlignGestureOverlay` is plausible but unverified — there is no concrete evidence in the issue body that the user wants alignment-style overlay images vs. per-cell icons. | **Requirement ambiguity (intentional — gated behind `要求確認`)** |

---

## 9. Verdict

The feature is a **plausible-feature-gap with rich infrastructure already in place** but no contract on the widget side and no editor UI.

| Question | Answer |
|----------|--------|
| Is the technical surface already there but unused? | **Partly.** Image render infrastructure (F3) and dormant per-tile persistence (F2) are ready. The descriptor contract (F1) and editor UI (F4) are not. |
| What would a minimal change look like? | (a) Pick `Layout.data` as the storage path. (b) Define a typed payload like `cells?: Partial<Record<AnchorPosition, PresetIcon>>`. (c) Replace the two line spans inside each cell button with a conditional render: default line spans when no `cells[pos]`, `<WorkspacePresetGlyph preset={{ id, type: "preset", title: "", filePath: "", icon: cells[pos] }} />` (or `<GlyphCachedImage>`) when set. (d) Add a context-menu / settings entry that opens an image picker per cell. (e) Persist via the grid-document writer. (f) Add a story variant + a test asserting the image path is rendered. |
| What would a full implementation cost? | Roughly: 1 contract edit (`WidgetDescriptor` or new `WidgetSettings` type), 1 persistence writer (grid document mutation), 1 editor dialog with 9 image pickers (or a single shared picker in Q1's case), 1 render branch in `Component.tsx`, 1 Storybook variant, 1 test, 10-locale i18n strings for the editor UI, ADR if a `WidgetDescriptor` extension is chosen (per AGENTS.md "ADR を残す" rules). The biggest line-count cost is the editor UI; the contract and render sides are small. |

The issue's three open subquestions (Q1: one image vs. nine; Q2: catalog vs. local vs. SVG vs. built-in; Q3: alignment-widget confusion) are all upstream of this analysis. None of the answers changes the verdict materially — the technical surface is ready; the contract and editor are the work.

---

## 10. Suggested follow-up (out of scope, not implemented)

For the implementer, after the requirement is confirmed:

1. **Resolve Q1-Q3 in the issue comment** before any code change. Q1 is the only one that changes the persistence shape (`sharedImage` vs. `cells: Record<AnchorPosition, …>`).
2. **Persist via `Layout.data`** rather than introducing a new global widget-settings surface. This reuses the existing grid-document round-trip and respects the per-tile scope of the widget.
3. **Reuse `WorkspacePresetGlyph` / `GlyphCachedImage`** for the cell image render. Both are already imported by other widgets in the same layer.
4. **Funnel image URLs through `isPresetImageSrcSafe` / `imageSrcForBrowser`** to inherit the existing allowlist (`https:`, `file:`, absolute paths; reject `javascript:` and other schemes).
5. **Add an editor UI in a sibling file** (e.g. `anchor-point/Editor.tsx` or a context-menu entry), not inline in `Component.tsx`. The component file is already busy with click/gesture/CEP logic; mixing editor UI in would obscure both.
6. **If `WidgetDescriptor` needs to grow** (e.g. a `settings: Record<string, unknown>` field that all widgets may opt into), write an ADR before extending the contract. Per AGENTS.md, contract changes for a shared interface (`define.ts` is consumed by every widget) require ADR-level review.
7. **Add at minimum a Storybook variant `CustomCells`** and a Vitest test that pins the fallback-to-line-span behavior when no image is set.
8. **If Q3 confirms alignment confusion**, close the issue and link to `alignment` widget story (`src/function/widget/core/align/Component.stories.tsx`) for the user to confirm intent.

Out of scope (not requested): proposing the actual fix, writing the test, opening the PR. This document is read-only analysis.
