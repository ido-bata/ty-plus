import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect } from "storybook/test";
import { Checkbox } from "./Checkbox";

const meta = {
	title: "Shared/Fields/Checkbox",
	component: Checkbox,
	argTypes: {
		label: { control: "text" },
		uiSize: { control: "select", options: ["sm", "md"] },
		disabled: { control: "boolean" },
		indeterminate: { control: "boolean" },
	},
	args: {
		label: "Select entry",
		uiSize: "md",
	},
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: { checked: true },
};

export const Unchecked: Story = {
	args: { checked: false },
};

export const Indeterminate: Story = {
	args: { checked: false, indeterminate: true },
};

export const WithoutLabel: Story = {
	args: { checked: true, label: undefined },
};

export const Disabled: Story = {
	args: { checked: true, disabled: true },
};

export const SmallSize: Story = {
	args: { checked: true, uiSize: "sm" },
};

export const Interactive: Story = {
	render: function Interactive(args) {
		const [checked, setChecked] = useState(false);
		return (
			<Checkbox
				{...args}
				checked={checked}
				onChange={(event) => {
					setChecked(event.currentTarget.checked);
				}}
			/>
		);
	},
	play: async ({ canvasElement }) => {
		const input = canvasElement.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("input not found");
		await expect(input.checked).toBe(false);
		input.click();
		await expect(input.checked).toBe(true);
	},
};
