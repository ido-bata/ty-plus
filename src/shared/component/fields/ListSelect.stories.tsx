import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
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
