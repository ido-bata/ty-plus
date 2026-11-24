import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { AfterEffectsFilesGatewayProvider } from "@/management/ae/files/gateway-context";
import type { FileBrowserEntry } from "@/management/storage/file-browser-service";
import { expectFirstImageLoaded } from "@/storybook/await-image";
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

// FilesGatewayProviderDecorator injects the deterministic fixture
// gateway (#458), so on-screen tiles resolve a real loadable image.
// The wrapper `<div>` is always mounted with a stable ref so the
// IntersectionObserver stays bound to a single DOM node — even when
// the inner content swaps from placeholder to `<img>`.
export const Default: Story = {
	play: async ({ canvasElement }) => {
		await expectFirstImageLoaded(canvasElement);
	},
};

// Issue #525: the fixture gateway always resolves, so renaming the file
// never produced the loading state. A `null` gateway keeps
// `useThumbnail` in `"idle"` — `staticUrl` stays null and the muted
// placeholder renders, which is the same pixels the loading branch
// paints. (A never-resolving gateway would also pin "loading", but its
// batch flush never settles and starves every later `batchThumbnails`
// caller through the module-level single-flight guard.)
export const Loading: Story = {
	args: {
		entry: makeFile({ name: "loading.png", path: "/preset/root/loading.png" }),
	},
	decorators: [
		(Story) => (
			<AfterEffectsFilesGatewayProvider value={null}>
				<Story />
			</AfterEffectsFilesGatewayProvider>
		),
	],
	play: async ({ canvasElement }) => {
		// The tile must stay in the placeholder branch: no <img> mounted
		// and the wrapper keeps the entry name as its aria-label.
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(canvasElement.querySelector("img")).toBeNull();
		const wrapper = canvasElement.querySelector<HTMLElement>(
			"[aria-label='loading.png']",
		);
		expect(wrapper).not.toBeNull();
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
		// The tile is measured through its loaded `<img>` (#458): once the
		// fixture gateway resolves, the wrapper's `aria-label` moves off
		// the container and onto the image `alt`.
		await expectFirstImageLoaded(canvasElement);
		const frames = canvasElement.querySelectorAll("[data-tile-frame]");
		expect(frames).toHaveLength(1);
		const frame = frames[0];
		const img = canvasElement.querySelector("img");
		if (!frame || !img) throw new Error("frame or tile not found");
		const frameRect = frame.getBoundingClientRect();
		const tileRect = img.getBoundingClientRect();
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
