import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import {
	assertBorderToken,
	resolveBorderToken,
} from "@/storybook/quality/border";
import { expectCanvasLayout } from "@/storybook/quality/layout";

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
	play: async ({ canvasElement }) => {
		const input = canvasElement.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("input not found");
		// Issue #761: the error signal is the `status.error` border plus the
		// error label — the control itself must stay fully opaque. The old
		// `opacity: 0.6` error state washed out text and background, reading
		// as a disabled-ish field instead of an active error.
		expect(getComputedStyle(input).opacity).toBe("1");
		assertBorderToken(input, "error");
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
		expectCanvasLayout(canvasElement);
		const input = canvasElement.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("input not found");
		// Issue #722: genuine text entry keeps the identifiable
		// `border.control` resting border — only passive chrome demoted to
		// `border.subtle`. Focus must still move off the resting color.
		const restingBorderColor = getComputedStyle(input).borderTopColor;
		expect(restingBorderColor).toBe(resolveBorderToken("control"));
		expect(restingBorderColor).not.toBe(resolveBorderToken("subtle"));
		input.focus();
		await expect(document.activeElement).toBe(input);
		await expect(input.matches(":focus")).toBe(true);
		// The border-color transition needs a moment to settle.
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(input).borderTopColor).not.toBe(
			restingBorderColor,
		);
		// Issue #726: the focused state must resolve to the contracted
		// `interactive.focus` token — not just "a different color".
		assertBorderToken(input, "focus");
		expectCanvasLayout(canvasElement);
	},
};
