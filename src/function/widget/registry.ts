/**
 * Additive widget descriptor registry (Wave 0 skeleton).
 *
 * Auto-aggregates all widget descriptors via Vite's `import.meta.glob` (M-1).
 * Widget modules under core/utility call `defineWidget(...)` as a side-effect on
 * load; the glob (run at the BOTTOM of this file) triggers those calls.
 *
 * IMPORTANT (circular-init): the eager glob imports each descriptor `index.ts`
 * or `descriptor.ts`,
 * imports `define.ts`, which imports `register` from THIS module. The glob
 * must therefore run only AFTER `register`/`descriptors` are initialized,
 * otherwise widget registration hits a temporal-dead-zone ReferenceError.
 *
 * Wave 3 (D13) wires this as the single authoritative registry, renames it to
 * `registry.ts`, and deletes legacy `grid-registry.ts` + the union in `kinds.ts`.
 *
 * INV-6: widgets are an open index -- the registry is the authority.
 * INV-8: additive only during parallel waves; never deletes or overwrites.
 *
 * Wave N (Issue #67): the registry is also the canonical widget **mount
 * adapter**. `renderDescriptorSafe` wraps the bare `renderDescriptor` in a
 * `SurfaceErrorBoundary`-equivalent `ErrorBoundary` so a single widget render
 * exception is contained to that tile and never blanks the panel. Long-term
 * every consumer should call `renderDescriptorSafe` (NOT `renderDescriptor`
 * directly) -- the bare function is kept only as an escape hatch for tests
 * that exercise the boundary in isolation.
 */

import { createElement } from "react";
import { ErrorBoundary } from "@/management/panel/ErrorBoundary";
import { type RenderWidgetProps, renderDescriptor } from "./render";

export * from "./registry-core";
export type { RenderWidgetProps };

import type { WidgetDescriptor } from "./define";

/**
 * Canonical widget mount adapter. Wraps the descriptor component in an
 * `ErrorBoundary` keyed by the descriptor `type` so the panel can recover
 * from a single widget throwing.
 */
export const renderDescriptorSafe = (
	descriptor: WidgetDescriptor,
	props: RenderWidgetProps,
): ReturnType<typeof createElement> => {
	return createElement(
		ErrorBoundary,
		{ name: descriptor.type, key: descriptor.type },
		renderDescriptor(descriptor, props),
	);
};

// ── Auto-aggregation (MUST stay at the bottom; see circular-init note above) ──────
// Eager glob: importing each descriptor `index.ts` or `descriptor.ts` runs its top-level `defineWidget(...)`,
// which calls the already-initialized `register` from registry-core.
// NOTE: paths are relative to THIS file (src/function/widget/registry.ts),
// so "./core/" resolves to "src/function/widget/core/".
const coreWidgets = import.meta.glob("./core/*/{index,descriptor}.ts", {
	eager: true,
});
const utilityWidgets = import.meta.glob("./utility/*/{index,descriptor}.ts", {
	eager: true,
});

// Export to prevent tree-shaking by Rollup
export const _widgetGlobs = [coreWidgets, utilityWidgets];
