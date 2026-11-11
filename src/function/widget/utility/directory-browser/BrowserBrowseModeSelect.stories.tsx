import type { Meta, StoryObj } from "@storybook/react";
import { BrowserBrowseModeSelect } from "./BrowserBrowseModeSelect";
import type { FileBrowserBrowseMode } from "./lib/types";

type Args = {
	value: FileBrowserBrowseMode;
	options: readonly { value: FileBrowserBrowseMode; label: string }[];
	onChange: (next: FileBrowserBrowseMode) => void;
	ariaLabel: string;
};

const OPTIONS: readonly { value: FileBrowserBrowseMode; label: string }[] = [
	{ value: "filesystem", label: "Filesystem" },
	{ value: "anchors", label: "Anchors" },
	{ value: "presetsCatalog", label: "Catalog" },
];

const baseArgs: Args = {
	value: "filesystem",
	options: OPTIONS,
	onChange: () => undefined,
	ariaLabel: "Browse mode",
};

const meta = {
	title: "DirectoryBrowser/BrowserBrowseModeSelect",
	component: BrowserBrowseModeSelect,
	args: baseArgs,
	decorators: [
		(Story) => (
			<div style={{ minWidth: 220 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Anchors: Story = {
	args: { value: "anchors" },
};

export const Catalog: Story = {
	args: { value: "presetsCatalog" },
};
