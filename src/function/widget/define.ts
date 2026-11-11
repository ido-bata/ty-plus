/**
 * Widget self-registration descriptor.
 *
 * Each widget folder provides a `widget.ts` that calls `defineWidget` with its
 * metadata + component. The descriptor registers itself into `registry.ts`
 * as a side-effect of being imported (see `registry.ts` for auto-aggregation
 * via `import.meta.glob`).
 *
 * Widget contract (M-2): Components receive only `{ layout, widgetInstanceId }`.
 * All other context (`state`, `grid`, `widthPx`, `host`) is accessed via the
 * `useWidgetRuntime()` hook.
 *
 * Side-effect: calling `defineWidget(...)` calls `register(descriptor)` in
 * `registry-core` to add the descriptor to the canonical registry.
 *
 * INV-6: widgets are an open index, not a closed enum -- the registry is the
 * authority; types are validated against it rather than hand-maintained.
 */

import type { ComponentType } from "react";

import type { Layout } from "@/management/workspace/layout/grid-document";
import type { GridSettings, SurfaceState } from "@/management/workspace/state";
import { register } from "./registry-core";

// ── Size constraint ──────────────────────────────────────────────────────────────

type WidgetSize = {
	cols: number;
	rows: number;
};

/**
 * Props every widget panel component receives from `renderDescriptor` (M-2 contract).
 *
 * Widgets may use only the subset of props they need. `state`/`grid` are passed
 * explicitly because the current widget components read them as props and
 * `useWidgetRuntime()` only exposes the host caller (not workspace state/grid).
 *
 * NOTE (M-2 / E-wave): `state` is the current `SurfaceState`. It will be narrowed
 * to a slimmer `WorkspaceContext` (+ feature stores keyed by UUID) during the
 * state-decomposition wave; `renderDescriptor`'s shape stays stable.
 */
export type WidgetRenderProps = {
	layout: Layout;
	/** Workspace context (current `SurfaceState`; narrows in the E-wave). */
	state: SurfaceState;
	/** Grid settings (cell size, gap, radius). */
	grid: GridSettings;
	/** Tile pixel width (computed from `layout`+`grid`); used e.g. by align. */
	widthPx: number;
	/** Opaque widget instance id (== `layout.id`); provided for convenience. */
	widgetInstanceId: string;
};

// ── Descriptor ─────────────────────────────────────────────────────────────────

export type WidgetDescriptor = {
	/** Stable type identifier, e.g. "easing", "align". */
	type: string;
	/** i18n key for the display name, e.g. "widgets.easing.name". */
	nameKey: string;
	/** Optional i18n key for a longer description. */
	descriptionKey?: string;
	/** Lucide icon name, e.g. "TrendingUp". */
	icon: string;
	minSize: WidgetSize;
	maxSize: WidgetSize;
	defaultSize: WidgetSize;
	/** Whether the widget is currently available. */
	available: boolean;
	/** Whether the widget size can be changed by the user. */
	resizable: boolean;
	/** Optional category for grouping in tooling. */
	category?: "core" | "utility" | "media" | "phase4";
	/** Optional default preset id that this widget opens when activated. */
	defaultPresetId?: string;
	/**
	 * The React panel component. Receives `WidgetRenderProps`
	 * (`{ layout, state, grid, widthPx, widgetInstanceId }`). A widget uses only
	 * the subset of props it needs.
	 */
	component: ComponentType<WidgetRenderProps>;
};

/**
 * Register a widget with its metadata and panel component.
 *
 * Returns the descriptor unchanged. Registration is a side-effect: importing the
 * widget's `widget.ts` (done eagerly via `import.meta.glob` in `registry.ts`)
 * runs this call and populates the registry.
 */
export const defineWidget = (
	descriptor: WidgetDescriptor,
): WidgetDescriptor => {
	register(descriptor);
	return descriptor;
};
