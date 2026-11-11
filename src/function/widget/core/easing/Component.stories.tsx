import type { Meta, StoryObj } from "@storybook/react";

import { EasingWidget } from "@/function/widget/core/easing/Component";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { css } from "@/styled-system/css";

const layout: Layout = {
	id: "easing-storybook-1",
	widgetType: "easing",
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
	title: "WidgetCore/Easing",
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
			<EasingWidget layout={layout} />
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Compact: Story = {
	args: { widthPx: 180, heightPx: 220 },
};

// Loop mode renders the curve editor (the points array is the single-
// cycle template) plus the cycle-count input. We force the mode into
// "loop" via the segmented control's aria-label + data attribute pair
// so the loop controls row becomes visible in Storybook without needing
// a runtime click sequence.
export const LoopMode: Story = {
	args: { widthPx: 280, heightPx: 280 },
	play: async ({ canvasElement }) => {
		const buttons = canvasElement.querySelectorAll<HTMLButtonElement>(
			"[role='toolbar'] button",
		);
		for (const button of buttons) {
			if (button.textContent?.trim() === "Loop") {
				button.click();
				break;
			}
		}
	},
};
