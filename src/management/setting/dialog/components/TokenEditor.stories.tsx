import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { TokenEditor } from "./TokenEditor";

type Args = {
	label: string;
	value: string;
	description: string;
};

const noop = (): void => undefined;

const baseArgs: Args = {
	label: "Cell padding",
	value: "var(--ty-space-2)",
	description: "design.token.cell-padding",
};

const frameStyle = css({
	width: "80",
	padding: "3",
});

const meta = {
	title: "Setting/TokenEditor",
	args: baseArgs,
	argTypes: {
		label: { control: "text" },
		value: { control: "text" },
		description: { control: "text" },
	},
	render: (args: Args) => (
		<div className={frameStyle}>
			<TokenEditor
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

export const LongValue: Story = {
	args: { value: "var(--ty-shell-pad-inline, 0.75rem)" },
};

export const EmptyDescription: Story = {
	args: { description: "" },
};
