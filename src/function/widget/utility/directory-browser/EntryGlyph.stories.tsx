import type { Meta, StoryObj } from "@storybook/react";
import type { FileBrowserEntry } from "@/management/storage/file-browser-service";
import { EntryGlyph } from "./EntryGlyph";

type Args = {
	entry: FileBrowserEntry;
	size: number;
	className: string;
};

const makeFile = (
	overrides: Partial<FileBrowserEntry> = {},
): FileBrowserEntry => ({
	name: "alpha.png",
	path: "/preset/root/alpha.png",
	isDirectory: false,
	size: 102400,
	modifiedAt: "2025-01-01T00:00:00Z",
	extension: ".png",
	fileType: "image",
	...overrides,
});

const makeDir = (name: string, path: string): FileBrowserEntry => ({
	name,
	path,
	isDirectory: true,
	size: 0,
	modifiedAt: "2025-01-01T00:00:00Z",
	extension: "",
	fileType: "unknown",
});

const meta = {
	title: "DirectoryBrowser/EntryGlyph",
	component: EntryGlyph,
	argTypes: {
		size: { control: { type: "range", min: 8, max: 96, step: 1 } },
	},
	args: {
		entry: makeFile(),
		size: 32,
		className: "text-text-muted",
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Folder: Story = {
	args: { entry: makeDir("presets", "/preset/presets") },
};

export const ParentUp: Story = {
	args: { entry: makeDir("..", "/preset/root") },
};

export const Video: Story = {
	args: {
		entry: makeFile({ name: "clip.mp4", fileType: "video", extension: ".mp4" }),
	},
};

export const Script: Story = {
	args: {
		entry: makeFile({
			name: "anim.jsx",
			fileType: "script",
			extension: ".jsx",
		}),
	},
};

export const Unknown: Story = {
	args: {
		entry: makeFile({
			name: "blob.xyz",
			fileType: "unknown",
			extension: ".xyz",
		}),
	},
};

export const Large: Story = {
	args: { size: 72 },
};
