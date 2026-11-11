import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
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
