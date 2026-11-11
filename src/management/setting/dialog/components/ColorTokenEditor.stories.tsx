import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { ColorTokenEditor } from "./ColorTokenEditor";

type Args = {
	label: string;
	value: string;
	description: string;
};

const noop = (): void => undefined;

const baseArgs: Args = {
	label: "Accent",
	value: "#4facfe",
	description: "Used for accent highlights across the panel.",
};

const frameStyle = css({
	width: "80",
	padding: "3",
});

const meta = {
	title: "Setting/ColorTokenEditor",
	args: baseArgs,
	argTypes: {
		label: { control: "text" },
		value: { control: "color" },
		description: { control: "text" },
	},
	render: (args: Args) => (
		<div className={frameStyle}>
			<ColorTokenEditor
				label={args.label}
				value={args.value}
				description={args.description}
				onChange={noop}
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Neutral: Story = {
	args: { value: "#888888", label: "Neutral" },
};

export const NoDescription: Story = {
	args: { description: "" },
};
