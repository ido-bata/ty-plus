import type { Meta, StoryObj } from "@storybook/react";

import { LoopWidget } from "@/function/widget/core/loop/Component";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

const layout: Layout = {
	id: "loop-storybook-1",
	widgetType: "loop",
	x: 0,
	y: 0,
	width: 4,
	height: 5,
};

type Args = {
	widthPx: number;
	heightPx: number;
};

const baseArgs: Args = {
	widthPx: 240,
	heightPx: 240,
};

const meta = {
	title: "WidgetCore/Loop",
	args: baseArgs,
	argTypes: {
		widthPx: { control: { type: "number", min: 160, max: 480 } },
		heightPx: { control: { type: "number", min: 160, max: 480 } },
	},
	render: (args: Args) => (
		<div
			className={css({ padding: "3" })}
			style={{ width: args.widthPx, height: args.heightPx }}
		>
			<LoopWidget layout={layout} />
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
	},
};
