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
		// Static-state fixtures pass `checked` without a handler; a noop
		// `onChange` keeps React from logging the read-only-field warning
		// into the capture report's consoleErrors. The `Interactive` story
		// overrides it with a real state setter.
		onChange: { control: false },
	},
	args: {
		label: "Select entry",
		uiSize: "md",
		onChange: () => undefined,
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
	play: async ({ canvasElement }) => {
		const input = canvasElement.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("input not found");
		// Issue #798: the label is part of the control — it must dim and
		// stop promising interaction together with the box. It once stayed
		// at full opacity with a pointer cursor, so the disabled row read
		// as enabled.
		const label = canvasElement.querySelector("label");
		if (!label) throw new Error("label not found");
		expect(getComputedStyle(label).cursor).toBe("not-allowed");
		const text = label.querySelector("span");
		if (!text) throw new Error("label text not found");
		expect(getComputedStyle(text).opacity).toBe("0.5");
	},
};

export const SmallSize: Story = {
	args: { checked: true, uiSize: "sm" },
	play: async ({ canvasElement }) => {
		const input = canvasElement.querySelector("input");
		if (!input) throw new Error("input not found");
		const after = getComputedStyle(input, "::after");
		const sizeOf = (value: string): { v: number; unit: string } => {
			const m = value.match(/^([\d.]+)(px|%)$/);
			if (!m) throw new Error(`unexpected computed size: ${value}`);
			return { v: Number(m[1]), unit: m[2] };
		};
		const w = sizeOf(after.width);
		const h = sizeOf(after.height);
		// The check glyph must stay legible on the 14px `sm` box: it once
		// collapsed to ~4px wide and read as a stray slash.
		if (w.unit === "%") {
			expect(w.v).toBeGreaterThanOrEqual(30);
		} else {
			expect(w.v).toBeGreaterThanOrEqual(4);
		}
		if (h.unit === "%") {
			expect(h.v).toBeGreaterThanOrEqual(55);
		} else {
			expect(h.v).toBeGreaterThanOrEqual(7);
		}
	},
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
