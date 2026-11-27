import type { Meta, StoryObj } from "@storybook/react";
import { Search } from "lucide-react";
import { useState } from "react";
import { expect } from "storybook/test";

import {
	assertMatchesWidth,
	expectContainerWidthTracking,
} from "@/storybook/quality/fit";
import { expectCanvasLayout } from "@/storybook/quality/layout";

import { SearchField } from "./SearchField";

const meta = {
	title: "Shared/Fields/SearchField",
	component: SearchField,
	argTypes: {
		uiSize: { control: "select", options: ["sm", "md", "lg"] },
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
// Focusing the input must change the wrapper's border color via
// `_focusWithin`, and the inner input must not paint a second border or
// box-shadow of its own.
export const FocusVisible: Story = {
	args: {
		placeholder: "Search…",
	},
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
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
		expectCanvasLayout(canvasElement);
	},
};

// Issue #726 / #721 shape: the field root must fill its container and keep
// tracking it across resizes — the regression class where `flexShrink: 0`
// (no grow, no explicit width) collapsed the wrapper to content width on
// CEP/CEF. `expectContainerWidthTracking` probes a real resize; the static
// half asserts the fills-width contract up front.
export const TracksContainerWidth: Story = {
	render: () => (
		<div data-testid="search-field-frame" style={{ width: 320 }}>
			<SearchField icon={Search} placeholder="Search…" aria-label="Search" />
		</div>
	),
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const input = canvasElement.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("search input not found");
		// input → SearchField root (the width-tracking element).
		const field = input.parentElement;
		const frame = canvasElement.querySelector<HTMLElement>(
			"[data-testid='search-field-frame']",
		);
		if (!field || !frame) throw new Error("search field frame not found");
		assertMatchesWidth(field, frame);
		await expectContainerWidthTracking(frame, field, {
			resizeTo: "160px",
			expectedRatio: 1,
		});
		// The probe restores the original width; the contract still holds.
		assertMatchesWidth(field, frame);
		expectCanvasLayout(canvasElement);
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
