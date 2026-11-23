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

/*
 * Issue #481: overshooting easings leave the 0..1 range, so the icon must
 * scale to the curve's real extrema. The stroke (1.5px) must still keep a
 * margin inside the canvas — a bright pixel on the outermost ring means
 * the curve was clipped by the frame.
 */
const playCurveInsideFrame = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement;
}): Promise<void> => {
	const canvas = canvasElement.querySelector("canvas");
	if (!canvas) throw new Error("canvas not found");
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("2d context unavailable");
	const { width, height } = canvas;
	const { data } = ctx.getImageData(0, 0, width, height);
	let bright = 0;
	let edgeBright = 0;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const i = (y * width + x) * 4;
			if (data[i] + data[i + 1] + data[i + 2] > 400) {
				bright += 1;
				if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
					edgeBright += 1;
				}
			}
		}
	}
	expect(bright).toBeGreaterThan(10);
	expect(edgeBright).toBe(0);
};

export const Overshoot: Story = {
	args: { cubic: [0.68, -0.55, 0.27, 1.55] },
	play: playCurveInsideFrame,
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
