import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { NumberField } from "./NumberField";

const meta = {
	title: "Shared/Fields/NumberField",
	component: NumberField,
	argTypes: {
		label: { control: "text" },
		value: { control: "number" },
		min: { control: "number" },
		max: { control: "number" },
		step: { control: "number" },
		unit: { control: "text" },
		description: { control: "text" },
		uiSize: { control: "select", options: ["sm", "md", "lg"] },
		disabled: { control: "boolean" },
		numberSpinners: { control: "boolean" },
		onChange: { action: "changed" },
	},
	args: {
		label: "Scale",
		value: 50,
		min: 0,
		max: 100,
		step: 1,
		unit: "%",
		description: "Resize the layer uniformly.",
		uiSize: "md",
		onChange: () => {},
	},
} satisfies Meta<typeof NumberField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
};

export const WithBoundedRange: Story = {
	args: {
		label: "Opacity",
		value: 75,
		min: 0,
		max: 255,
		step: 1,
		unit: "px",
		description: undefined,
	},
};

export const Disabled: Story = {
	args: {
		disabled: true,
	},
};

export const Interactive: Story = {
	render: () => {
		const [value, setValue] = useState("12");
		return (
			<div style={{ width: 240 }}>
				<NumberField
					label="Frames"
					value={value}
					onChange={setValue}
					min={1}
					max={120}
					step={1}
					unit="frames"
				/>
			</div>
		);
	},
	args: {},
};
