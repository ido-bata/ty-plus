import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./Input";

const meta = {
	title: "Shared/Fields/Input",
	component: Input,
	argTypes: {
		label: { control: "text" },
		error: { control: "text" },
		uiSize: { control: "select", options: ["sm", "md", "lg"] },
		placeholder: { control: "text" },
		disabled: { control: "boolean" },
		numberSpinners: { control: "boolean" },
		value: { control: "text" },
	},
	args: {
		label: "Name",
		placeholder: "Type something…",
		uiSize: "md",
		value: "",
	},
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithError: Story = {
	args: {
		label: "Email",
		value: "not-an-email",
		error: "Must be a valid email address.",
	},
};

export const LargeSize: Story = {
	args: {
		uiSize: "lg",
		placeholder: "Large input",
	},
};

export const NumberInput: Story = {
	args: {
		type: "number",
		label: "Count",
		placeholder: "0",
		defaultValue: 5,
	},
};
