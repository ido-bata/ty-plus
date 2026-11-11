import type { Meta, StoryObj } from "@storybook/react";
import { Search } from "lucide-react";
import { useState } from "react";
import { SearchField } from "./SearchField";

const meta = {
	title: "Shared/Fields/SearchField",
	component: SearchField,
	argTypes: {
		placeholder: { control: "text" },
		disabled: { control: "boolean" },
		showClearButton: { control: "boolean" },
		showInlineTrailing: { control: "boolean" },
		uncontrolled: { control: "boolean" },
		value: { control: "text" },
	},
	args: {
		icon: Search,
		placeholder: "Search…",
		showClearButton: true,
	},
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithClear: Story = {
	args: {
		showClearButton: true,
		defaultValue: "alpha",
		uncontrolled: true,
	},
};

export const WithInlineTrailing: Story = {
	args: {
		showInlineTrailing: true,
		inlineTrailing: "12 results",
		showClearButton: true,
		defaultValue: "foo",
		uncontrolled: true,
	},
};

export const Disabled: Story = {
	args: {
		disabled: true,
	},
};

export const Controlled: Story = {
	render: () => {
		const [value, setValue] = useState("hello");
		return (
			<div style={{ width: 280 }}>
				<SearchField
					icon={Search}
					value={value}
					onChange={(e) => setValue(e.currentTarget.value)}
					showClearButton
					placeholder="Type to search"
					aria-label="Search"
				/>
			</div>
		);
	},
};
