import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";

import { ToolDialogDetailsSection } from "./DetailsSection";

type Args = {
	description: string;
	descriptionImage: string;
	defaultOpen: boolean;
};

const baseArgs: Args = {
	description: "",
	descriptionImage: "",
	defaultOpen: false,
};

const decoratorBoxClass = css({
	width: "32rem",
	padding: "2",
});

const meta = {
	title: "Preset/ToolShell/Dialog/DetailsSection",
	args: baseArgs,
	argTypes: {
		description: { control: "text" },
		descriptionImage: { control: "text" },
		defaultOpen: { control: "boolean" },
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
			defaultOpen={args.defaultOpen}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

// Issue #546: content-bearing stories must open the accordion — the
// section starts closed (`defaultOpen ?? false`), so without it the
// stories rendered identically to Default.
const expectContentField = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement;
}): Promise<void> => {
	const field = canvasElement.querySelector("textarea, input[type='text']");
	expect(field).not.toBeNull();
};

export const WithDescription: Story = {
	args: {
		description: "Header animation preset for fade-in transitions.",
		defaultOpen: true,
	},
	play: expectContentField,
};

export const WithImage: Story = {
	args: {
		descriptionImage: "https://placehold.co/240x120/png",
		defaultOpen: true,
	},
	play: expectContentField,
};
