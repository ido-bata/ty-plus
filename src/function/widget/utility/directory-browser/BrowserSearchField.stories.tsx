import type { Meta, StoryObj } from "@storybook/react";
import { createRef, type ReactNode, type RefObject } from "react";
import { expect } from "storybook/test";
import { BrowserSearchField } from "./BrowserSearchField";

type Args = {
	inputRef: RefObject<HTMLInputElement | null>;
	value: string;
	onChange: (next: string) => void;
	onClear: () => void;
	placeholder: string;
	inlineTrailing: ReactNode;
};

const baseArgs: Args = {
	inputRef: createRef<HTMLInputElement>(),
	value: "",
	onChange: () => undefined,
	onClear: () => undefined,
	placeholder: "Search presets",
	inlineTrailing: null,
};

const meta = {
	title: "DirectoryBrowser/BrowserSearchField",
	component: BrowserSearchField,
	args: baseArgs,
	decorators: [
		(Story) => (
			<div style={{ minWidth: 280 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
	args: { value: "glow" },
};

export const WithTrailing: Story = {
	args: {
		value: "glow",
		inlineTrailing: (
			<span
				style={{
					padding: "2px 6px",
					borderRadius: 4,
					background: "#3a3a3a",
					color: "#cfcfcf",
					fontSize: 10,
				}}
			>
				3
			</span>
		),
	},
};

export const CustomPlaceholder: Story = {
	args: { placeholder: "Filter by name…" },
};

// Issue #146: focus-state capture. A real-pointer click moves DOM focus
// into the input; the wrapper's `:focus-within` ring is the post-play
// state the screenshot pipeline captures.
export const Focused: Story = {
	play: async ({ canvasElement }) => {
		const input = canvasElement.querySelector<HTMLInputElement>(
			"[data-directory-browser-search] input",
		);
		if (!input) throw new Error("search input not found");
		const wrapper = input.parentElement;
		if (!wrapper) throw new Error("search field wrapper not found");
		const restingBorderColor = getComputedStyle(wrapper).borderTopColor;

		const { userEvent } = await import("vitest/browser");
		await userEvent.click(input);
		await expect(document.activeElement).toBe(input);
		await expect(wrapper.matches(":focus-within")).toBe(true);
		// The wrapper transitions border-color/box-shadow — wait for the
		// transition to settle before comparing computed styles.
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(wrapper).borderTopColor).not.toBe(
			restingBorderColor,
		);
	},
};
