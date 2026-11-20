import type { Meta, StoryObj } from "@storybook/react";
import type { AppliedLoopRecord } from "@/function/widget/core/loop/applied-state";
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
	applied?: AppliedLoopRecord;
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
			<LoopWidget
				layout={layout}
				initialWave={args.wave}
				initialApplied={args.applied}
			/>
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

const appliedRecord: AppliedLoopRecord = {
	propertyId: "Layer 1.Position",
	range: { start: 0, end: 2 },
	loopParams: {
		cycles: 3,
		amplitude: 1,
		damping: 1,
		bias: 0,
		mode: "pingpong",
	},
	template: [
		[0, 0, 0, 0, 0.15, 0],
		[0.5, 0.92, -0.2, 0.2, 0.2, 0.2],
		[1, 1, -0.15, 0, 0, 0],
	],
	originalKeyframes: [],
	writtenKeyframes: [],
	appliedAt: 0,
};

/** A loop that is already applied to the AE selection. */
export const Applied: Story = {
	args: { applied: appliedRecord },
};
