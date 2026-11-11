import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { PlaceholderOverlay } from "./PlaceholderOverlay";

type Args = {
	placeholder: string;
	showContainer: boolean;
};

const baseArgs: Args = {
	placeholder: "Type markdown…",
	showContainer: true,
};

const decoratorBoxClass = css({
	width: "24rem",
	padding: "2",
	color: "text.primary",
});

const surfaceBoxClass = css({
	position: "relative",
	height: "32",
	width: "full",
	borderRadius: "sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
});

const meta = {
	title: "Preset/Markdown/PlaceholderOverlay",
	args: baseArgs,
	argTypes: {
		placeholder: { control: "text" },
		showContainer: { control: "boolean" },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<div className={surfaceBoxClass}>
			<PlaceholderOverlay placeholder={args.placeholder} />
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Empty: Story = {
	args: { placeholder: "" },
};

export const LongHint: Story = {
	args: {
		placeholder:
			"Write a short description for the preset (markdown supported)…",
	},
};
