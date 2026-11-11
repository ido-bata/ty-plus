import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { ToolDialogDetailsSection } from "./DialogDetailsSection";

type Args = {
	description: string;
	descriptionImage: string;
};

const baseArgs: Args = {
	description: "",
	descriptionImage: "",
};

const decoratorBoxClass = css({
	width: "32rem",
	padding: "2",
});

const meta = {
	title: "Preset/ToolShell/DialogDetailsSection",
	args: baseArgs,
	argTypes: {
		description: { control: "text" },
		descriptionImage: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<ToolDialogDetailsSection
			description={args.description}
			onDescriptionChange={() => undefined}
			descriptionImage={args.descriptionImage}
			onDescriptionImageChange={() => undefined}
			browseDir="/preset/root"
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const WithDescription: Story = {
	args: { description: "Header animation preset for fade-in transitions." },
};

export const WithImage: Story = {
	args: { descriptionImage: "https://placehold.co/240x120/png" },
};
