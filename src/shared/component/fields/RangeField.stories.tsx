import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { RangeField } from "./RangeField";

const meta = {
	title: "Shared/Fields/RangeField",
	component: RangeField,
	argTypes: {
		label: { control: "text" },
		value: { control: "number" },
		min: { control: "number" },
		max: { control: "number" },
		step: { control: "number" },
		unit: { control: "text" },
		className: { control: "text" },
		onChange: { action: "changed" },
	},
	args: {
		label: "Volume",
		value: 30,
		min: 0,
		max: 100,
		step: 1,
		unit: "%",
		onChange: () => {},
	},
} satisfies Meta<typeof RangeField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
};

export const FineStep: Story = {
	args: {
		label: "Rotation",
		value: 45,
		min: 0,
		max: 360,
		step: 0.5,
		unit: "°",
	},
};

export const NoLabel: Story = {
	args: {
		label: undefined,
		unit: undefined,
	},
};

export const Interactive: Story = {
	render: () => {
		const [value, setValue] = useState(60);
		return (
			<div style={{ width: 280 }}>
				<RangeField
					label="Opacity"
					value={value}
					onChange={setValue}
					min={0}
					max={100}
					step={1}
					unit="%"
				/>
			</div>
		);
	},
	args: {},
};
