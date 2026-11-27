import type { Meta, StoryObj } from "@storybook/react";
import { Icon } from "@ty-plus/ui/Icon";
import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { expect } from "storybook/test";

import { borderTopColor, resolveBorderToken } from "@/storybook/quality/border";
import { expectCanvasLayout } from "@/storybook/quality/layout";

import { PathField } from "./PathField";

const meta = {
	title: "Shared/Fields/PathField",
	component: PathField,
	argTypes: {
		value: { control: "text" },
		placeholder: { control: "text" },
		uiSize: { control: "select", options: ["sm", "md", "lg"] },
		size: { control: "select", options: ["sm", "md", "lg"] },
		browseAriaLabel: { control: "text" },
		disabled: { control: "boolean" },
		readOnly: { control: "boolean" },
		onChange: { action: "changed" },
		onBrowse: { action: "browse" },
	},
	args: {
		value: "/Users/example/Documents/project/file.aep",
		placeholder: "Select a path…",
		uiSize: "md",
		browseAriaLabel: "Browse for file",
		onChange: () => {},
		onBrowse: () => {},
	},
} satisfies Meta<typeof PathField>;

export default meta;
type Story = StoryObj<typeof meta>;

const BrowseIcon = <Icon icon={FolderOpen} size={12} aria-hidden />;

export const Default: Story = {
	args: {
		browseSlot: BrowseIcon,
	},
	play: async ({ canvasElement }) => {
		const button = canvasElement.querySelector<HTMLButtonElement>(
			"[data-path-field] button",
		);
		if (!button) throw new Error("browse button not found");
		expect(button.disabled).toBe(false);
		// The enabled browse button must not carry the disabled dim: it once
		// rendered at opacity 0.5 and looked identical to the disabled state.
		expect(getComputedStyle(button).opacity).toBe("1");
		// The browse button sits flush (gap 1.5) against the path input, so
		// its resting border must resolve to the same `border.control` tier
		// as the input's `border.input` — not the weaker `border.subtle`.
		const input = canvasElement.querySelector<HTMLInputElement>(
			"[data-path-field] input",
		);
		if (!input) throw new Error("path input not found");
		expect(borderTopColor(button)).toBe(borderTopColor(input));
		expect(borderTopColor(button)).toBe(resolveBorderToken("control"));
		expect(borderTopColor(button)).not.toBe(resolveBorderToken("subtle"));
	},
};

// Without an `onBrowse` handler the browse button stays mounted but
// disabled — the affordance communicates "no picker in this context"
// rather than disappearing. Pin that contract.
export const WithoutBrowse: Story = {
	args: {
		browseSlot: BrowseIcon,
		onBrowse: undefined,
	},
	play: async ({ canvasElement }) => {
		const button = canvasElement.querySelector<HTMLButtonElement>(
			"[data-path-field] button",
		);
		if (!button) throw new Error("browse button not found");
		expect(button.disabled).toBe(true);
	},
};

export const Disabled: Story = {
	args: {
		browseSlot: BrowseIcon,
		disabled: true,
	},
};

export const Interactive: Story = {
	render: () => {
		const [value, setValue] = useState(
			"/Users/example/Documents/very/deep/nested/folder/structure/file.aep",
		);
		return (
			<div style={{ width: 360 }}>
				<PathField
					value={value}
					onChange={setValue}
					onBrowse={() => {
						/* mocked */
					}}
					browseSlot={BrowseIcon}
					browseAriaLabel="Browse for project file"
				/>
			</div>
		);
	},
	args: {
		browseSlot: BrowseIcon,
	},
};

// Issue #166: focus state — the path input repaints its border to
// `interactive.focus` on `:focus` while the browse button stays put.
export const Focused: Story = {
	args: {
		browseSlot: BrowseIcon,
	},
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const input = canvasElement.querySelector<HTMLInputElement>(
			"[data-path-field] input",
		);
		if (!input) throw new Error("path input not found");
		const restingBorderColor = getComputedStyle(input).borderTopColor;
		input.focus();
		await expect(document.activeElement).toBe(input);
		await expect(input.matches(":focus")).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(input).borderTopColor).not.toBe(
			restingBorderColor,
		);
		expectCanvasLayout(canvasElement);
	},
};
