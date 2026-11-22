import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { NameField } from "./NameField";

type Args = {
	name: string;
	busy: boolean;
};

const baseArgs: Args = {
	name: "Header Animations",
	busy: false,
};

const decoratorBoxClass = css({
	width: "18rem",
	padding: "2",
});

const meta = {
	title: "Preset/Group/NameField",
	args: baseArgs,
	argTypes: {
		name: { control: "text" },
		busy: { control: "boolean" },
	},
	render: (args: Args) => (
		<div className={decoratorBoxClass}>
			<NameField
				name={args.name}
				busy={args.busy}
				onNameChange={() => undefined}
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Busy: Story = {
	args: { busy: true },
};
