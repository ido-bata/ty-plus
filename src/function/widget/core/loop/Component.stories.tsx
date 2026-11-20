import type { Meta, StoryObj } from "@storybook/react";

import { LoopWidget } from "@/function/widget/core/loop/Component";
import type { CyclicWaveParams } from "@/function/widget/curve-editor/cyclic-wave";
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
	wave: CyclicWaveParams;
};

const baseWave: CyclicWaveParams = {
	cycles: 3,
	amplitude: 1,
	damping: 1,
	bias: 0,
	mode: "pingpong",
};

const meta = {
	title: "WidgetCore/Loop",
	args: { widthPx: 320, heightPx: 260, wave: baseWave },
	argTypes: {
		widthPx: { control: { type: "number", min: 140, max: 480 } },
		heightPx: { control: { type: "number", min: 140, max: 480 } },
	},
	render: (args: Args) => (
		<div
			className={css({ padding: "3" })}
			style={{ width: args.widthPx, height: args.heightPx }}
		>
			<LoopWidget layout={layout} initialWave={args.wave} />
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

/** Damping: the oscillation settles toward the final value. */
export const Damped: Story = {
	args: { wave: { ...baseWave, damping: 0.6 } },
};

/** Bias: the attack leg takes more of the cycle than the return leg. */
export const Biased: Story = {
	args: { wave: { ...baseWave, bias: 0.5 } },
};

/** One-way repeat instead of the ping-pong oscillation. */
export const OneWay: Story = {
	args: { wave: { ...baseWave, mode: "cycle" } },
};

/** Many cycles (the frequency handle at its high end). */
export const HighFrequency: Story = {
	args: { wave: { ...baseWave, cycles: 8 } },
};

/** Narrow panel: the compact layout must stay usable. */
export const Narrow: Story = {
	args: { widthPx: 170, heightPx: 260 },
};
