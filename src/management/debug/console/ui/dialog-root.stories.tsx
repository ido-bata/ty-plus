import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";

import { DebugDialogRoot } from "./dialog-root";

type Args = {
	isCep: boolean;
	hostCode: string;
};

const baseArgs: Args = {
	isCep: false,
	hostCode: "",
};

const renderRoot = (args: Args) => (
	<DebugDialogRoot
		surfaceId="debug-console"
		isCep={args.isCep}
		hostCode={args.hostCode}
	/>
);

const meta = {
	title: "Debug/Console/DebugDialogRoot",
	args: baseArgs,
	argTypes: {
		isCep: { control: "boolean" },
		hostCode: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div style={{ height: 360, width: 360 }}>
				<Story />
			</div>
		),
	],
	render: renderRoot,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
	play: async ({ canvasElement }) => {
		// Issue #752: the embedded console panel keeps every segmented
		// filter strip on a single row (nowrap + scroll contract).
		const strips =
			canvasElement.querySelectorAll<HTMLElement>('[role="toolbar"]');
		expect(strips.length).toBeGreaterThan(0);
		for (const strip of strips) {
			const buttons = strip.querySelectorAll("button");
			const tops = new Set(
				[...buttons].map((b) => Math.round(b.getBoundingClientRect().top)),
			);
			expect(tops.size, `segmented strip wrapped into ${tops.size} rows`).toBe(
				1,
			);
		}
	},
};

export const CepMode: Story = {
	args: { isCep: true, hostCode: "AE-host" },
};
