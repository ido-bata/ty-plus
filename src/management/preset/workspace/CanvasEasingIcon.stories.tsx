import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { CanvasEasingIcon } from "./CanvasEasingIcon";

type Args = {
	color: string;
	cubic: [number, number, number, number];
	points?: [number, number, number, number, number, number][];
};

const baseArgs: Args = {
	color: "currentColor",
	cubic: [0.42, 0, 0.58, 1],
};

const decoratorBoxClass = css({
	height: "24",
	width: "24",
	padding: "4",
});

const meta = {
	title: "Preset/Workspace/CanvasEasingIcon",
	component: CanvasEasingIcon,
	args: baseArgs,
	argTypes: {
		color: { control: { type: "color" } },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<CanvasEasingIcon
			color={args.color}
			cubic={args.cubic}
			points={args.points}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const EaseInOut: Story = {
	args: { cubic: [0.42, 0, 0.58, 1] },
};

export const EaseIn: Story = {
	args: { cubic: [0.42, 0, 1, 1] },
};

export const Linear: Story = {
	args: { cubic: [0, 0, 1, 1] },
};

export const MultiSegment: Story = {
	args: {
		points: [
			[0, 0, 0, 0, 0.2, 0],
			[0.5, 0.6, 0.3, 0, 0.2, 0],
			[1, 1, 0, 0, 0, 0],
		],
	},
};
