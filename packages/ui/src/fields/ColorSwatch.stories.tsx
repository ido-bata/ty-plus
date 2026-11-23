import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect } from "storybook/test";
import { ColorSwatch } from "./ColorSwatch";

const meta = {
	title: "Shared/Fields/ColorSwatch",
	component: ColorSwatch,
	argTypes: {
		value: { control: "text" },
		disabled: { control: "boolean" },
		className: { control: "text" },
		"aria-label": { control: "text" },
		onChange: { action: "changed" },
	},
	args: {
		value: "#22c55e",
		"aria-label": "Color",
		onChange: () => {},
	},
} satisfies Meta<typeof ColorSwatch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
};

export const Disabled: Story = {
	args: {
		disabled: true,
	},
	play: async ({ canvasElement }) => {
		const swatch = canvasElement.querySelector("input[type='color']");
		if (!swatch) throw new Error("swatch not found");
		const style = getComputedStyle(swatch);
		expect(Number(style.opacity)).toBeLessThan(1);
		expect(style.cursor).toBe("not-allowed");
	},
};

export const Interactive: Story = {
	render: () => {
		const [value, setValue] = useState("#a855f7");
		return (
			<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
				<ColorSwatch
					value={value}
					onChange={setValue}
					aria-label="Pick a hue"
				/>
				<code style={{ color: "#fff" }}>{value}</code>
			</div>
		);
	},
	args: {},
};
