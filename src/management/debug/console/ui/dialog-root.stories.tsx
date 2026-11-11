import type { Meta, StoryObj } from "@storybook/react";

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

export const Default: Story = {};

export const CepMode: Story = {
	args: { isCep: true, hostCode: "AE-host" },
};
