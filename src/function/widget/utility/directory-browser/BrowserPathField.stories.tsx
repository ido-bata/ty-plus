import type { Meta, StoryObj } from "@storybook/react";
import { BrowserPathField } from "./BrowserPathField";

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

export const Default: Story = {};

export const Empty: Story = {
	args: { value: "" },
};

export const LongPath: Story = {
	args: {
		value:
			"/Users/animator/Documents/After Effects/Presets/Effects/Glow/Subgroup/Hidden/Treasure/glow.ffx",
	},
};

export const WithBrowse: Story = {
	args: { onBrowse: () => undefined },
};

export const WindowsPath: Story = {
	args: { value: "C:/AE/Presets/glow.ffx" },
};
