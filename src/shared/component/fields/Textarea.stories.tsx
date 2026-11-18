import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect } from "storybook/test";

import { expectCanvasLayout } from "@/storybook/quality/layout";

import { Textarea } from "./Textarea";

const meta = {
	title: "Shared/Fields/Textarea",
	component: Textarea,
	argTypes: {
		uiSize: { control: "select", options: ["sm", "md", "lg"] },
		placeholder: { control: "text" },
		disabled: { control: "boolean" },
		readOnly: { control: "boolean" },
		rows: { control: "number" },
		defaultValue: { control: "text" },
	},
	args: {
		placeholder: "Write a description…",
		uiSize: "md",
		rows: 4,
	},
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LargeSize: Story = {
	args: {
		uiSize: "lg",
		rows: 6,
	},
};

export const Disabled: Story = {
	args: {
		disabled: true,
		defaultValue: "Read-only content here.",
	},
};

export const Controlled: Story = {
	render: () => {
		const [value, setValue] = useState(
			"Initial content of the textarea that demonstrates controlled state.",
		);
		return (
			<div style={{ width: 320 }}>
				<Textarea
					value={value}
					onChange={(e) => setValue(e.currentTarget.value)}
					placeholder="Notes"
					rows={5}
					aria-label="Notes"
				/>
			</div>
		);
	},
};

// Issue #166: focus-visible state — the textarea repaints its border and
// paints the inset focus ring only under `:focus-visible`. Text fields
// match `:focus-visible` even on programmatic focus in Chromium, so a
// plain `.focus()` exercises the real path.
export const Focused: Story = {
	args: {
		"aria-label": "Notes",
	},
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const textarea = canvasElement.querySelector("textarea");
		if (!textarea) throw new Error("textarea not found");
		const restingBorderColor = getComputedStyle(textarea).borderTopColor;
		const restingBoxShadow = getComputedStyle(textarea).boxShadow;
		textarea.focus();
		await expect(document.activeElement).toBe(textarea);
		await expect(textarea.matches(":focus-visible")).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 300));
		const focused = getComputedStyle(textarea);
		await expect(focused.borderTopColor).not.toBe(restingBorderColor);
		await expect(focused.boxShadow).not.toBe(restingBoxShadow);
		expectCanvasLayout(canvasElement);
	},
};
