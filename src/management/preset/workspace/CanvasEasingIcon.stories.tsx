import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
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
	// Mirror the dark tile surface the icon is drawn on in product.
	backgroundColor: "surface.widget",
	color: "text.primary",
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

// Issue #457: `currentColor` used to be assigned to `ctx.strokeStyle`
// verbatim — an invalid canvas color that was silently ignored, leaving
// the curve painted in the faint axes gray (~1.25:1 on dark tiles). The
// curve must now resolve to the element's computed text color, so a
// meaningful number of bright pixels must be present.
const playCurveVisible = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement;
}): Promise<void> => {
	const canvas = canvasElement.querySelector("canvas");
	if (!canvas) throw new Error("canvas not found");
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("2d context unavailable");
	const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
	let bright = 0;
	for (let i = 0; i < data.length; i += 4) {
		if (data[i] + data[i + 1] + data[i + 2] > 400) bright += 1;
	}
	expect(bright).toBeGreaterThan(10);
};

export const Default: Story = {
	play: playCurveVisible,
};

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
