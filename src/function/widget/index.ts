/**
 * **Public API** for the workspace widget **catalog** (widget types, registry, legacy id parse).
 *
 * - Import **only** from this module (`@/function/widget`). Do not import
 *   `./contract`, `./registry` or `./legacy-parse` directly.
 * - **Panel grid** UI for each widget kind lives under `function/widget/<category>/<kind>/`.
 * - Persisted grid geometry and layout document helpers live in `management/workspace/layout/grid-document.ts`.
 * - Opaque id helpers live in `management/storage/ids` — import them from there.
 * - Prefer `shared/contract/surface` for types (e.g. `AlignTargetId`, `SurfaceInfo`) needed by scripts here
 *   without importing `management/workspace/state` where a narrower contract suffices.
 *
 * `shared/contract/widget` re-exports catalog types from **this** entry.
 */

export type { WidgetType } from "./contract";
