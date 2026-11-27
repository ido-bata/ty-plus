import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { expect } from "storybook/test";

import type { WidgetType } from "@/management/widget/contract";
import {
	createInitialSurfaceState,
	type SurfaceState,
} from "@/management/workspace/core/state";
import { DEFAULT_GRID } from "@/management/workspace/layout/default";
import { getTileRect } from "@/management/workspace/layout/engine";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { css } from "@/styled-system/css";

import { Widget } from "./TileContent";

/**
 * Widget tile body (Issue #610): `TileContent`'s `Widget` is the registry
 * dispatch `GridTile` mounts inside every widget placement — it resolves
 * the descriptor for `layout.widgetType` and renders the real widget
 * component through `renderDescriptorSafe` (ErrorBoundary-wrapped), or a
 * fallback card when the type no longer resolves.
 */

const state: SurfaceState = createInitialSurfaceState({ mode: "live" });
const grid = DEFAULT_GRID;

const makeLayout = (
	id: string,
	widgetType: WidgetType,
	width: number,
	height: number,
): Layout => ({
	id,
	widgetId: id,
	widgetType,
	x: 0,
	y: 0,
	width,
	height,
});

const meta = {
	title: "Management/Widget/TileContent",
	parameters: { layout: "fullscreen" },
	decorators: [
		// The production tile box comes from `GridTile`'s absolute
		// `placementStyle` (Grid.tsx); `Widget` itself has no intrinsic
		// size, so the story must bound it to the tile rect or the widget
		// stretches to the full Storybook viewport (#755).
		(Story, context) => {
			const rect = getTileRect(
				(context.args as { layout: Layout }).layout,
				DEFAULT_GRID,
			);
			return (
				<div
					className={css({
						display: "flex",
						padding: "2",
						backgroundColor: "surface.panel",
					})}
					style={{ width: rect.width + 16, height: rect.height + 16 }}
				>
					<Story />
				</div>
			);
		},
	],
	render: (args: { layout: Layout }): JSX.Element => (
		<Widget layout={args.layout} state={state} grid={grid} />
	),
} satisfies Meta<{ layout: Layout }>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Menu widget — single menu button resolved through the real registry. */
export const MenuWidget: Story = {
	args: {
		layout: makeLayout("w-menu-1", "menu", 1, 1),
	},
	play: async ({ canvasElement }) => {
		expect(
			canvasElement.querySelector(
				"[data-ws-action='open-widget-menu-context']",
			),
		).not.toBeNull();
	},
};

/** Align widget — larger 2x2 tile body. */
export const AlignWidget: Story = {
	args: {
		layout: makeLayout("w-align-1", "align", 2, 2),
	},
};

/**
 * Stale layout row whose `widgetType` no longer resolves to a descriptor —
 * the fallback card renders the raw type string instead of throwing.
 */
export const UnknownWidgetType: Story = {
	args: {
		layout: makeLayout("w-retired-1", "retired-widget", 1, 1),
	},
	play: async ({ canvasElement }) => {
		expect(canvasElement.textContent).toContain("retired-widget");
	},
};
