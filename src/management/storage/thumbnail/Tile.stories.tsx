import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { FileBrowserEntry } from "@/management/storage/file-browser-service";
import { ThumbnailTile } from "./Tile";

type Args = {
	entry: FileBrowserEntry;
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

const meta = {
	title: "FileEntryList/ThumbnailTile",
	component: ThumbnailTile,
	args: {
		entry: makeFile(),
		frameWidth: 96,
		frameHeight: 96,
	},
	argTypes: {
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
				}}
			>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

// useThumbnail() resolves to idle under the Storybook decorators
// (FilesGatewayProviderDecorator passes `value={null}`), so all
// variants render the muted placeholder square. The wrapper `<div>`
// is always mounted with a stable ref so the IntersectionObserver
// stays bound to a single DOM node — even when the inner content
// swaps from placeholder to `<img>`.
export const Default: Story = {};

export const Loading: Story = {
	args: {
		entry: makeFile({ name: "loading.png", path: "/preset/root/loading.png" }),
	},
};

export const WideAspect: Story = {
	args: {
		entry: makeFile({ name: "wide.png", path: "/preset/root/wide.png" }),
		frameWidth: 160,
		frameHeight: 72,
	},
	play: async ({ canvasElement }) => {
		// Issue #471: story-level decorators stack on top of the meta
		// decorator, so a second frame used to cut across the tile. There
		// must be exactly one frame and the tile must stay inside it.
		const frames = canvasElement.querySelectorAll("[data-tile-frame]");
		expect(frames).toHaveLength(1);
		const frame = frames[0];
		const tile = canvasElement.querySelector<HTMLElement>(
			"[aria-label='wide.png']",
		);
		if (!frame || !tile) throw new Error("frame or tile not found");
		const frameRect = frame.getBoundingClientRect();
		const tileRect = tile.getBoundingClientRect();
		expect(tileRect.left).toBeGreaterThanOrEqual(frameRect.left);
		expect(tileRect.top).toBeGreaterThanOrEqual(frameRect.top);
		expect(tileRect.right).toBeLessThanOrEqual(frameRect.right);
		expect(tileRect.bottom).toBeLessThanOrEqual(frameRect.bottom);
	},
};

// The IO-gated mount variant forces the IntersectionObserver to start
// with `isIntersecting=false` by wrapping the tile in a 0×0 outer
// container with `overflow: hidden`. This is the steady-state the lazy
// load pipeline sees for off-screen tiles in a long directory listing:
// the wrapper is mounted, the placeholder fills it, and `useThumbnail`
// stays in `idle` until the user scrolls the tile into view. Useful
// for visually confirming that the lazy pipeline does not paint a
// broken layout while waiting for the IPC.
export const OffscreenIntersection: Story = {
	args: {
		entry: makeFile({
			name: "offscreen.png",
			path: "/preset/root/offscreen.png",
		}),
	},
	decorators: [
		(Story) => (
			<div style={{ height: 96, width: 96, overflow: "hidden" }}>
				<div style={{ marginTop: 200 }}>
					<Story />
				</div>
			</div>
		),
	],
};
