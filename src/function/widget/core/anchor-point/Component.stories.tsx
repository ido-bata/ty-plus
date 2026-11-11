import type { Meta, StoryObj } from "@storybook/react";

import { AnchorPointWidget } from "@/function/widget/core/anchor-point/Component";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { css } from "@/styled-system/css";

const layout: Layout = {
	id: "anchor-point-1",
	widgetType: "anchor-point",
	x: 0,
	y: 0,
	width: 1,
	height: 1,
};

type Args = {
	widthPx: number;
};

const baseArgs: Args = {
	widthPx: 240,
};

const meta = {
	title: "WidgetCore/AnchorPoint",
	args: baseArgs,
	argTypes: {
		widthPx: { control: { type: "number", min: 96, max: 480 } },
	},
	render: (args: Args) => (
		<div
			className={css({ padding: "3" })}
			style={{
				width: Math.min(args.widthPx, 320),
				height: Math.min(args.widthPx, 320),
			}}
		>
			<AnchorPointWidget
				{...({
					layout,
					widgetInstanceId: "anchor-point-storybook-1",
				} as unknown as Parameters<typeof AnchorPointWidget>[0])}
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Large: Story = {
	args: { widthPx: 320 },
};

/**
 * Story variant designed for exercising the drag gesture (Issue #77).
 *
 * Hover the widget, press the left mouse button anywhere on the grid, drag
 * straight toward a corner or edge, release. The stroke is mirrored to the
 * same anchor positions that the alignment widget exposes via
 * `useAnchorGesture`.
 */
export const GesturePreview: Story = {
	args: { widthPx: 280 },
	parameters: {
		docs: {
			description: {
				story:
					"Drag the widget's surface to commit an anchor position. Cardinally snapped strokes land on edge anchors; L-shape diagonals land on corners; back-and-forth sweeps over the start point land on `center`.",
			},
		},
	},
};
