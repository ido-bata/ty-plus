import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect } from "storybook/test";
import { ColorOpacityField } from "./ColorOpacityField";

const meta = {
	title: "Shared/Fields/ColorOpacityField",
	component: ColorOpacityField,
	argTypes: {
		label: { control: "text" },
		color: { control: "text" },
		opacity: { control: { type: "range", min: 0, max: 100, step: 1 } },
		className: { control: "text" },
		onColorChange: { action: "colorChanged" },
		onOpacityChange: { action: "opacityChanged" },
	},
	args: {
		label: "Widget Background",
		color: "#1a1a1a",
		opacity: 80,
		onColorChange: () => {},
		onOpacityChange: () => {},
	},
} satisfies Meta<typeof ColorOpacityField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
};

export const FullyTransparent: Story = {
	render: () => {
		const [color, setColor] = useState("#5886ff");
		const [opacity, setOpacity] = useState(0);
		return (
			<div style={{ width: 480 }}>
				<ColorOpacityField
					label="Panel Background"
					color={color}
					onColorChange={setColor}
					opacity={opacity}
					onOpacityChange={setOpacity}
				/>
			</div>
		);
	},
	args: {},
};

export const Interactive: Story = {
	render: () => {
		const [color, setColor] = useState("#7a4dd8");
		const [opacity, setOpacity] = useState(60);
		return (
			<div style={{ width: 480 }}>
				<ColorOpacityField
					label="Widget Background"
					color={color}
					onColorChange={setColor}
					opacity={opacity}
					onOpacityChange={setOpacity}
				/>
			</div>
		);
	},
	args: {},
	play: async ({ canvasElement }) => {
		const range = canvasElement.querySelector<HTMLInputElement>(
			'input[type="range"]',
		);
		if (!range) throw new Error("range input not found");
		range.focus();
		await expect(document.activeElement).toBe(range);
		const before = Number(range.value);
		const { userEvent } = await import("vitest/browser");
		await userEvent.keyboard("{ArrowRight}");
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(Number(range.value)).toBe(before + 1);
	},
};
