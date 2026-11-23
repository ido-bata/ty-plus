import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect, within } from "storybook/test";
import { ColorField } from "./ColorField";

const meta = {
	title: "Shared/Fields/ColorField",
	component: ColorField,
	argTypes: {
		label: { control: "text" },
		value: { control: "text" },
		description: { control: "text" },
		className: { control: "text" },
		onChange: { action: "changed" },
	},
	args: {
		label: "Primary color",
		value: "#3b82f6",
		description: "Pick a hex color for the layer fill.",
		onChange: () => {},
	},
} satisfies Meta<typeof ColorField>;

export default meta;
type Story = StoryObj<typeof meta>;

// The swatch and the hex input must share one grid row: the column template
// once used a unitless `8` that browsers dropped, stacking them vertically.
const expectSwatchAndInputInline = async (
	canvasElement: HTMLElement,
): Promise<void> => {
	const canvas = within(canvasElement);
	const input = canvas.getByLabelText(/value$/);
	const swatch = canvasElement.querySelector(
		"button, [role='button'], input[type='color']",
	);
	expect(swatch).not.toBeNull();
	const swatchRect = swatch?.getBoundingClientRect();
	const inputRect = input.getBoundingClientRect();
	expect(
		Math.abs(
			(swatchRect?.top ?? 0) +
				(swatchRect?.height ?? 0) / 2 -
				(inputRect.top + inputRect.height / 2),
		),
	).toBeLessThan(8);
	expect(inputRect.left).toBeGreaterThan((swatchRect?.right ?? 0) - 1);
};

export const Default: Story = {
	args: {},
	play: async ({ canvasElement }) => {
		await expectSwatchAndInputInline(canvasElement);
	},
};

export const WithoutLabel: Story = {
	args: {
		label: undefined,
		description: undefined,
	},
	play: async ({ canvasElement }) => {
		await expectSwatchAndInputInline(canvasElement);
	},
};

export const WithLongPath: Story = {
	render: () => {
		const [value, setValue] = useState("#ff00aa");
		return (
			<div style={{ width: 320 }}>
				<ColorField
					label="Accent"
					value={value}
					onChange={setValue}
					description="Updates the swatch and hex input in sync."
				/>
			</div>
		);
	},
	args: {},
};

// Issue #166: focus state — the hex text input repaints its border to
// `interactive.focus` on `:focus`; the color swatch is a separate control.
export const Focused: Story = {
	args: {},
	play: async ({ canvasElement }) => {
		const inputs = Array.from(
			canvasElement.querySelectorAll<HTMLInputElement>("input"),
		);
		const input = inputs.find((el) => el.type === "text");
		if (!input) throw new Error("hex input not found");
		const restingBorderColor = getComputedStyle(input).borderTopColor;
		input.focus();
		await expect(document.activeElement).toBe(input);
		await expect(input.matches(":focus")).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(input).borderTopColor).not.toBe(
			restingBorderColor,
		);
	},
};
