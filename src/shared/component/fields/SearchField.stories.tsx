import type { Meta, StoryObj } from "@storybook/react";
import { Search } from "lucide-react";
import { useState } from "react";
import { expect } from "storybook/test";
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

// Issue #146 / #144 regression: the wrapper owns the only focus indicator.
// Focusing the input must paint exactly one ring (wrapper _focusWithin
// border + inset shadow) and the inner input must not paint a second
// border or box-shadow of its own.
export const FocusVisible: Story = {
	args: {
		placeholder: "Search…",
	},
	play: async ({ canvasElement }) => {
		const input = canvasElement.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("search input not found");
		const wrapper = input.parentElement;
		if (!wrapper) throw new Error("search field wrapper not found");
		const restingBorderColor = getComputedStyle(wrapper).borderTopColor;

		input.focus();
		await expect(document.activeElement).toBe(input);
		await expect(wrapper.matches(":focus-within")).toBe(true);
		// The wrapper transitions border-color/box-shadow — wait for the
		// transition to settle before reading computed styles.
		await new Promise((resolve) => setTimeout(resolve, 300));

		const innerStyle = getComputedStyle(input);
		expect(innerStyle.boxShadow).toBe("none");
		expect(innerStyle.borderTopWidth).toBe("0px");

		const wrapperStyle = getComputedStyle(wrapper);
		expect(wrapperStyle.borderTopColor).not.toBe(restingBorderColor);
		expect(wrapperStyle.boxShadow).not.toBe("none");
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
