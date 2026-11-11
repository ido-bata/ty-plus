/**
 * Renders a widget by descriptor, so management never imports widget components.
 *
 * `renderDescriptor(descriptor, { layout, state, grid })` returns a React element.
 * `widgetInstanceId` (== `layout.id`) and `widthPx` (from `getTileRect`) are
 * derived and injected, so callers pass only the workspace context.
 *
 * Widget contract (M-2): components receive `{ layout, state, grid, widthPx,
 * widgetInstanceId }` and use the subset they need. `state`/`grid` are passed
 * explicitly because the components read them as props and `useWidgetRuntime()`
 * only exposes the host caller.
 *
 * NOTE (E-wave): `state` narrows to a slimmer `WorkspaceContext` (+ UUID-keyed
 * feature stores) later; this signature is intended to stay stable.
 */

import { createElement } from "react";

import { getTileRect } from "@/management/workspace/layout/engine";
import type { Layout } from "@/management/workspace/layout/grid-document";
import type { GridSettings, SurfaceState } from "@/management/workspace/state";
import type { WidgetDescriptor } from "./define";

export type RenderWidgetProps = {
	layout: Layout;
	state: SurfaceState;
	grid: GridSettings;
};

/** Returns a React element for the given descriptor, ready to render. */
export const renderDescriptor = (
	descriptor: WidgetDescriptor,
	props: RenderWidgetProps,
): ReturnType<typeof createElement> => {
	const { layout, state, grid } = props;
	return createElement(descriptor.component, {
		layout,
		state,
		grid,
		widthPx: getTileRect(layout, grid).width,
		widgetInstanceId: String(layout.id),
	});
};
