# Directory Browser Kit Unification

**Date:** 2026-09-10
**Status:** Accepted (phased implementation)
**Issues:** #64, #65, #66, #67
**Supersedes / revises:** none
**Superseded / revised by:** none yet

## Context

File/entry list+grid views grew into 7 implementations with per-place
behavior: widget `Component`, legacy preset `ListDialog`, `use-presets-catalog`,
add-widget catalog, font-viewer, online marketplace, and the
`management/storage/ui` `DirectoryBrowser`. Ctrl+wheel constants
(`0.94 / 0.65–1.75`), localStorage persistence, tile/row markup, view
toggles, and right-click menus (5 builders) were copy-pasted, so the same
gesture behaved differently per surface. The shell kit additionally kept
quasi-controlled `viewMode` state (`useState(viewMode)` initial-only) and a
dead `surface="onboarding"` branch, and imported preset-domain values
(`PresetIcon` values, `image-src-for-browser`, sibling resolution) into a
generic kit.

## Decision

1. **Single controlled kit** owned by `management/storage/ui`
   (`DirectoryBrowser.tsx` + `DirectoryBrowserIconCard.tsx` +
   `DirectoryBrowserMenu.ts`). No new top-level `features/`/`ui/` bucket
   (banned by `source-ownership.md`); `management/preset/catalog-browser`
   stays the preset-semantics owner and is not the filesystem kit owner.
2. **Fully controlled view state.** `viewMode/scale/aspect` are required
   props with change callbacks; the kit keeps no internal view state.
   Owners without zoom/aspect UI pass constants with noop changers.
   Shared domain-free hooks live in `src/shared/util/`
   (`useIconGridScale`, `useTileAspect`, `useCatalogViewMode`, #65).
3. **Single menu builder.** `buildDirectoryBrowserMenu` /
   `handleDirectoryBrowserMenuSelect` replace window-event bridges
   (`browser-go-up/open-entry/toggle-file/toggle-folder`) with direct
   action callbacks. The builder owns menu text and ids only.
4. **Render slots, not domain imports.** Tile media and row icons default
   to the shared entry-icon rendering; owners inject sibling thumbnails
   or glyphs via `renderTileMedia` / `renderRowIcon`. `allEntries`-driven
   sidekick resolution leaves the kit.
5. **One card implementation.** The inline `IconCard` is removed in favor
   of the exported `DirectoryBrowserIconCard`; footer toggles use the
   existing `DirectoryBrowserViewModeToggle`.
6. **Phased migration** (smallest first): settings preview, tool-shell
   picker, catalog-add dialog, group condition cards, onboarding, then the
   workspace widget filesystem mode. The widget migration additionally
   needs #65 merged (shared hooks) and is sequenced after it.

## Consequences

- Owners pass explicit view/scale/aspect state; behavior per surface is
  identical by construction.
- `surface`, `allEntries`, and the four legacy selection props are
  removed; all in-repo consumers migrate atomically (no aliases).
- Remaining debt (not in scope): `SiblingThumbnail` and
  `DirectoryBrowserShell.entry-icon` keep preset-domain value imports;
  `ListDialog` vs `use-presets-catalog` duplication; online/font-viewer/
  catalog views stay bespoke.
- Verification: kit unit tests (click contract, controlled view, scale,
  selection matrix, menu matrix) plus per-surface existing suites and
  `bun run ci`. Visible tile changes get After Effects host verification.

## References

- `docs/architecture/repository/source-ownership.md` (ownership, no
  `features/` bucket, UI under owning operation system)
- `docs/architecture/agent-operations.md` (ticket branch per issue,
  Draft PR to release branch)
