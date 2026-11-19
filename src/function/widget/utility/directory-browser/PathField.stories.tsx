import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { BrowserPathField } from "./PathField";

type Args = {
	value: string;
	onChange: (next: string) => void;
	onCommit: () => void;
	onBrowse: (() => void) | undefined;
	browseAriaLabel: string;
	placeholder: string;
	inputTitle: string;
};

const baseArgs: Args = {
	value: "/preset/root/presets",
	onChange: () => undefined,
	onCommit: () => undefined,
	onBrowse: undefined,
	browseAriaLabel: "Browse folders",
	placeholder: "Enter path",
	inputTitle: "Current directory",
};

const meta = {
	title: "DirectoryBrowser/BrowserPathField",
	component: BrowserPathField,
	args: baseArgs,
	decorators: [
		(Story) => (
			<div style={{ minWidth: 320 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

// Issue #166: the path input + browse button must satisfy the layout
// contract in every value state (empty, long, OS-specific).
const playPathFieldLayout = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement;
}): Promise<void> => {
	expectCanvasLayout(canvasElement, {
		requireRenderedSelector: "input, button",
	});
};

const pathInput = (canvasElement: HTMLElement): HTMLInputElement => {
	const input = canvasElement.querySelector<HTMLInputElement>("input");
	if (!input) throw new Error("path input not found");
	return input;
};

const browseButton = (canvasElement: HTMLElement): HTMLButtonElement => {
	const button = canvasElement.querySelector<HTMLButtonElement>(
		"button[aria-label='Browse folders']",
	);
	if (!button) throw new Error("browse button not found");
	return button;
};

export const Default: Story = {
	play: async ({ canvasElement }) => {
		await playPathFieldLayout({ canvasElement });
		expect(pathInput(canvasElement).value).toBe("/preset/root/presets");
		// No `onBrowse` handler → the browse affordance is disabled.
		expect(browseButton(canvasElement).disabled).toBe(true);
	},
};

/**
 * Empty path state: the field shows its placeholder and the browse
 * button stays disabled until a browse handler is wired.
 */
export const Empty: Story = {
	args: { value: "" },
	play: async ({ canvasElement }) => {
		await playPathFieldLayout({ canvasElement });
		const input = pathInput(canvasElement);
		expect(input.value).toBe("");
		expect(input.placeholder).toBe("Enter path");
		expect(browseButton(canvasElement).disabled).toBe(true);
	},
};

export const LongPath: Story = {
	args: {
		value:
			"/Users/animator/Documents/After Effects/Presets/Effects/Glow/Subgroup/Hidden/Treasure/glow.ffx",
	},
	play: playPathFieldLayout,
};

export const WithBrowse: Story = {
	args: { onBrowse: () => undefined },
	play: async ({ canvasElement }) => {
		await playPathFieldLayout({ canvasElement });
		expect(browseButton(canvasElement).disabled).toBe(false);
	},
};

export const WindowsPath: Story = {
	args: { value: "C:/AE/Presets/glow.ffx" },
	play: playPathFieldLayout,
};
