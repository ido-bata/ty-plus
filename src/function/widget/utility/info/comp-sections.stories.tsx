import type { Meta, StoryObj } from "@storybook/react";

import { CompSections } from "@/function/widget/utility/info/comp-sections";
import type { CompInfo } from "@/management/workspace/state";
import { css } from "@/styled-system/css";

type Args = {
	showBackground: boolean;
	dropFrame: boolean;
	motionBlur: boolean;
	draft3d: boolean;
	selectedLayers: number;
};

const buildComp = (args: Args): CompInfo => ({
	name: "Main comp",
	width: 1920,
	height: 1080,
	pixelAspect: 1,
	bgColor: args.showBackground ? [0.06, 0.07, 0.09] : null,
	frameRate: args.dropFrame ? 29.97 : 24,
	dropFrame: args.dropFrame,
	duration: 4.5,
	shutterAngle: 180,
	shutterPhase: 0,
	layers: 12,
	selectedLayers: args.selectedLayers,
	motionBlur: args.motionBlur,
	draft3d: args.draft3d,
});

const baseArgs: Args = {
	showBackground: true,
	dropFrame: false,
	motionBlur: true,
	draft3d: false,
	selectedLayers: 2,
};

const meta = {
	title: "Info/CompSections",
	args: baseArgs,
	argTypes: {
		showBackground: { control: "boolean" },
		dropFrame: { control: "boolean" },
		motionBlur: { control: "boolean" },
		draft3d: { control: "boolean" },
		selectedLayers: { control: { type: "number", min: 0, max: 32 } },
	},
	render: (args: Args) => (
		<div className={css({ width: "320px", padding: "3" })}>
			<CompSections comp={buildComp(args)} />
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const DropFrame: Story = {
	args: { dropFrame: true },
};

export const NoBackground: Story = {
	args: { showBackground: false },
};

export const ManySelected: Story = {
	args: { selectedLayers: 8 },
};
