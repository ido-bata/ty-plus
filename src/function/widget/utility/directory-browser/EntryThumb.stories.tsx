import type { Meta, StoryObj } from "@storybook/react";
import type { FileBrowserEntry } from "@/management/storage/file-browser-service";
import { EntryThumb } from "./EntryThumb";

type Args = {
	entry: FileBrowserEntry;
	siblingSourceEntries: readonly FileBrowserEntry[];
	glyphSize: number;
	glyphClassName: string;
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
	title: "DirectoryBrowser/EntryThumb",
	component: EntryThumb,
	args: {
		entry: makeFile(),
		siblingSourceEntries: [],
		glyphSize: 48,
		glyphClassName: "max-h-[85%] max-w-[85%] shrink-0 text-text-muted",
	},
	argTypes: {
		glyphSize: { control: { type: "range", min: 8, max: 96, step: 1 } },
	},
	decorators: [
		(Story) => (
			<div
				style={{
					height: 96,
					width: 96,
					border: "1px solid #3a3a3a",
					background: "#1f1f1f",
				}}
			>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

// useThumbnail() and useFolderPreview() resolve to idle under the
// Storybook decorators, so all variants render the EntryGlyph fallback.
export const Default: Story = {};

export const Folder: Story = {
	args: { entry: makeDir("presets", "/preset/presets") },
};

export const ParentUp: Story = {
	args: { entry: makeDir("..", "/preset/root") },
};

export const Video: Story = {
	args: {
		entry: makeFile({
			name: "clip.mp4",
			path: "/preset/root/clip.mp4",
			fileType: "video",
			extension: ".mp4",
		}),
		glyphSize: 14,
		glyphClassName: "shrink-0",
	},
};

export const SmallGlyph: Story = {
	args: {
		glyphSize: 14,
		glyphClassName: "shrink-0",
	},
	decorators: [
		(Story) => (
			<div
				style={{
					height: 32,
					width: 32,
					border: "1px solid #3a3a3a",
					background: "#1f1f1f",
				}}
			>
				<Story />
			</div>
		),
	],
};
