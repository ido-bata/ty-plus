import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { ToolDialogForm } from "./DialogForm";

type Args = {
	name: string;
	description: string;
};

const baseArgs: Args = {
	name: "Header preset",
	description: "Animation preset for header fade-in transitions.",
};

const decoratorBoxClass = css({
	width: "28rem",
	padding: "2",
});

const meta = {
	title: "Preset/ToolShell/DialogForm",
	args: baseArgs,
	argTypes: {
		name: { control: "text" },
		description: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<ToolDialogForm
			description={args.description}
			leadingSlots={null}
			renderLeadingSlots={undefined}
			values={{}}
			setValue={() => undefined}
			busy={false}
			name={args.name}
			setName={() => undefined}
			fields={<div />}
			details={<div />}
			icon={<div />}
			nameLabel="Preset name"
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};
