import type { Meta, StoryObj } from "@storybook/react";
import type { SiblingListingEntry } from "@/management/preset/sibling-thumbnail";

import type { DirectoryBrowserEntry } from "./DirectoryBrowser";
import { DirectoryBrowserIconCard } from "./DirectoryBrowserIconCard";

const siblings: readonly SiblingListingEntry[] = [
	{ name: "alpha.png", path: "/preset/root/alpha.png", isDirectory: false },
];

type Args = {
	isSelected: boolean;
	showCheckbox: boolean;
	kind: "file" | "folder" | "image";
};

const buildEntry = (kind: Args["kind"]): DirectoryBrowserEntry => {
	switch (kind) {
		case "file":
			return {
				path: "/preset/root/preset.ffx",
				name: "preset.ffx",
				isDirectory: false,
				fileType: "ae-preset",
			};
		case "folder":
			return {
				path: "/preset/root/nested",
				name: "nested",
				isDirectory: true,
			};
		case "image":
			return {
				path: "/preset/root/alpha.png",
				name: "alpha.png",
				isDirectory: false,
				fileType: "image",
				previewUrl:
					"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'><rect width='8' height='8' fill='%2380a0ff'/></svg>",
			};
	}
};

const baseArgs: Args = {
	isSelected: false,
	showCheckbox: true,
	kind: "file",
};

const renderCard = (args: Args) => (
	<DirectoryBrowserIconCard
		entry={buildEntry(args.kind)}
		isSelected={args.isSelected}
		showCheckbox={args.showCheckbox}
		allEntries={siblings}
		aspect="square"
		onClick={() => undefined}
		onDoubleClick={() => undefined}
		onToggle={() => undefined}
	/>
);

const meta = {
	title: "DirectoryBrowser/DirectoryBrowserIconCard",
	args: baseArgs,
	argTypes: {
		isSelected: { control: "boolean" },
		showCheckbox: { control: "boolean" },
		kind: {
			control: { type: "select" },
			options: ["file", "folder", "image"],
		},
	},
	decorators: [
		(Story) => (
			<div style={{ width: 112 }}>
				<Story />
			</div>
		),
	],
	render: renderCard,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Selected: Story = {
	args: { isSelected: true },
};

export const Folder: Story = {
	args: { kind: "folder" },
};

export const ImageWithPreview: Story = {
	args: { kind: "image" },
};

export const NoCheckbox: Story = {
	args: { showCheckbox: false },
};
