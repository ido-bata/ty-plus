import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
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
		value: { control: "text" },
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
		value: "Read-only content here.",
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
