import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
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
		defaultValue: { control: "text" },
	},
	args: {
		label: "Name",
		placeholder: "Type something…",
		uiSize: "md",
	},
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithError: Story = {
	args: {
		label: "Email",
		defaultValue: "not-an-email",
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

// Issue #166: focus state — focusing the input must repaint the border to
// `interactive.focus`. The post-play state is what the capture pipeline
// screenshots, so the play function drives a real focus.
export const Focused: Story = {
	play: async ({ canvasElement }) => {
		const input = canvasElement.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("input not found");
		const restingBorderColor = getComputedStyle(input).borderTopColor;
		input.focus();
		await expect(document.activeElement).toBe(input);
		await expect(input.matches(":focus")).toBe(true);
		// The border-color transition needs a moment to settle.
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(input).borderTopColor).not.toBe(
			restingBorderColor,
		);
	},
};
