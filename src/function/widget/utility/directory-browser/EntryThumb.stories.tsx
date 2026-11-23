import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { FileBrowserEntry } from "@/management/storage/file-browser-service";
import { expectFirstImageLoaded } from "@/storybook/await-image";
import { EntryThumb } from "./EntryThumb";

type Args = {
	entry: FileBrowserEntry;
	siblingSourceEntries: readonly FileBrowserEntry[];
	glyphSize: number;
	glyphClassName: string;
	frameWidth: number;
	frameHeight: number;
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
		frameWidth: 96,
		frameHeight: 96,
	},
	argTypes: {
		glyphSize: { control: { type: "range", min: 8, max: 96, step: 1 } },
		frameWidth: { control: { type: "number" } },
		frameHeight: { control: { type: "number" } },
	},
	decorators: [
		(Story, context) => (
			<div
				data-tile-frame=""
				style={{
					height: context.args.frameHeight,
					width: context.args.frameWidth,
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

// FilesGatewayProviderDecorator injects the deterministic fixture
// gateway (#458), so image entries with a preview resolve a real
// loadable thumbnail instead of the file-type glyph fallback.
export const Default: Story = {
	args: {
		entry: makeFile({
			previewUrl:
				"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'><rect width='8' height='8' fill='%2380a0ff'/></svg>",
		}),
	},
	play: async ({ canvasElement }) => {
		await expectFirstImageLoaded(canvasElement);
	},
};

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
		frameWidth: 32,
		frameHeight: 32,
	},
	play: async ({ canvasElement }) => {
		// Issue #471: story-level decorators stack on top of the meta
		// decorator, so a second frame used to cut across the tile. There
		// must be exactly one frame and it must be the 32x32 variant.
		const frames = canvasElement.querySelectorAll("[data-tile-frame]");
		expect(frames).toHaveLength(1);
		const rect = frames[0]?.getBoundingClientRect();
		if (!rect) throw new Error("tile frame not found");
		expect(rect.width).toBe(32);
		expect(rect.height).toBe(32);
	},
};
