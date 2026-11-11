import type { Meta, StoryObj } from "@storybook/react";
import { createRef, type ReactNode, type RefObject } from "react";
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
