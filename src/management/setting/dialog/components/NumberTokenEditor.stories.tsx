import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { NumberTokenEditor } from "./NumberTokenEditor";

type Args = {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	unit: string;
	description: string;
};

const noop = (): void => undefined;

const baseArgs: Args = {
	label: "Border radius",
	value: 8,
	min: 0,
	max: 32,
	step: 1,
	unit: "px",
	description: "design.token.radius",
};

const frameStyle = css({
	width: "80",
	padding: "3",
});

const meta = {
	title: "Setting/NumberTokenEditor",
	args: baseArgs,
	argTypes: {
		label: { control: "text" },
		value: { control: { type: "number", min: 0, max: 64 } },
		min: { control: { type: "number" } },
		max: { control: { type: "number" } },
		step: { control: { type: "number", min: 0.1, step: 0.1 } },
		unit: { control: "text" },
		description: { control: "text" },
	},
	render: (args: Args) => (
		<div className={frameStyle}>
			<NumberTokenEditor
				label={args.label}
				value={args.value}
				min={args.min}
				max={args.max}
				step={args.step}
				unit={args.unit}
				description={args.description}
				onChange={noop}
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Percent: Story = {
	args: { label: "Opacity", unit: "%", value: 50, min: 0, max: 100, step: 5 },
};

export const NoDescription: Story = {
	args: { description: "" },
};
