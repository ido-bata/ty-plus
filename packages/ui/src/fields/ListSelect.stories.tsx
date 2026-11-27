import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect } from "storybook/test";
import { borderTopColor, resolveBorderToken } from "@/storybook/quality/border";
import { ListSelect } from "./ListSelect";

const sampleOptions = [
	{ value: "en", label: "English" },
	{ value: "ja", label: "日本語" },
	{ value: "de", label: "Deutsch" },
	{ value: "fr", label: "Français" },
	{ value: "ko", label: "한국어" },
];

const meta = {
	title: "Shared/Fields/ListSelect",
	component: ListSelect,
	argTypes: {
		value: { control: "text" },
		placeholder: { control: "text" },
		uiSize: { control: "select", options: ["sm", "md"] },
		disabled: { control: "boolean" },
		"aria-label": { control: "text" },
		onChange: { action: "changed" },
	},
	args: {
		options: sampleOptions,
		value: "en",
		placeholder: "Select…",
		uiSize: "md",
		"aria-label": "Language",
		onChange: () => {},
	},
} satisfies Meta<typeof ListSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
};

export const SmallSize: Story = {
	args: {
		uiSize: "sm",
	},
};

export const Disabled: Story = {
	args: {
		disabled: true,
	},
};

export const WithState: Story = {
	render: () => {
		const [value, setValue] = useState("ja");
		return (
			<div style={{ width: 220 }}>
				<ListSelect
					options={sampleOptions}
					value={value}
					onChange={setValue}
					aria-label="Locale"
				/>
			</div>
		);
	},
	args: {},
};

// Issue #166: open + select interaction — clicking the trigger must open the
// listbox (`aria-expanded`), and picking an option must commit the value and
// close the list. Driven with real pointer input so the post-play state is
// what the capture pipeline screenshots.
export const OpenAndSelect: Story = {
	render: () => {
		const [value, setValue] = useState("en");
		return (
			<div style={{ width: 220 }}>
				<ListSelect
					options={sampleOptions}
					value={value}
					onChange={setValue}
					aria-label="Language"
				/>
			</div>
		);
	},
	args: {},
	play: async ({ canvasElement }) => {
		const { userEvent } = await import("vitest/browser");
		const trigger = canvasElement.querySelector<HTMLButtonElement>(
			'button[aria-haspopup="listbox"]',
		);
		if (!trigger) throw new Error("listbox trigger not found");
		// Issue #754: the trigger is an identifiable control, so its resting
		// border sits on `border.control` — the same tier as Input/Textarea/
		// Checkbox — not the passive-chrome `border.subtle`.
		expect(borderTopColor(trigger)).toBe(resolveBorderToken("control"));
		expect(borderTopColor(trigger)).not.toBe(resolveBorderToken("subtle"));
		await expect(trigger.getAttribute("aria-expanded")).toBe("false");
		await userEvent.click(trigger);
		await expect(trigger.getAttribute("aria-expanded")).toBe("true");
		// The listbox is portaled to document.body by AnchoredPopover; its
		// resting border stays on the passive-chrome `border.subtle` tier —
		// only the interactive trigger escalated to `border.control`.
		const listbox = document.querySelector('[role="listbox"]');
		if (!listbox) throw new Error("listbox not found");
		expect(borderTopColor(listbox)).toBe(resolveBorderToken("subtle"));
		const optionByText = Array.from(
			document.querySelectorAll<HTMLButtonElement>('button[role="option"]'),
		).find((el) => el.textContent === "Deutsch");
		if (!optionByText) throw new Error("Deutsch option not found");
		await userEvent.click(optionByText);
		await expect(trigger.getAttribute("aria-expanded")).toBe("false");
		await expect(trigger.textContent).toContain("Deutsch");
	},
};
