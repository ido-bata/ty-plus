import type { Meta, StoryObj } from "@storybook/react";
import type { PresetSearchItem } from "@/management/online/contract";
import { PresetMarketResults } from "./PresetMarketResults";

type Args = {
	mode: "gallery" | "list" | "cards";
	scale: number;
	filtered: PresetSearchItem[];
	downloadingId: string | null;
	downloadState: {
		stage: "fetch" | "download" | "write" | "icon" | "register";
		bytesLoaded?: number;
		bytesTotal?: number;
	} | null;
	completedId: string | null;
	downloadedPresetIds: Set<string>;
	onDownload: (presetId: string) => void;
	onHover: (presetId: string | null) => void;
};

const makeItem = (i: number): PresetSearchItem => ({
	presetId: `preset-${i}`,
	name: `Preset ${i + 1}`,
	description:
		i % 2 === 0
			? "Short description."
			: "Longer description with more detail about what this preset does.",
	category: ["Color", "Glow", "Transition"][i % 3],
	notionPageUrl: i % 2 === 0 ? "https://example.com/manual" : undefined,
	thumbnailUrl: undefined,
});

const baseArgs: Args = {
	mode: "gallery",
	scale: 1,
	filtered: Array.from({ length: 6 }, (_, i) => makeItem(i)),
	downloadingId: null,
	downloadState: null,
	completedId: null,
	downloadedPresetIds: new Set<string>(),
	onDownload: () => undefined,
	onHover: () => undefined,
};

const meta = {
	title: "Catalog/PresetMarketResults",
	component: PresetMarketResults,
	args: baseArgs,
	argTypes: {
		mode: {
			control: { type: "inline-radio" },
			options: ["gallery", "list", "cards"],
		},
		scale: { control: { type: "range", min: 0.5, max: 2, step: 0.1 } },
		filtered: { control: "object" },
		downloadingId: { control: "text" },
		downloadState: { control: "object" },
		completedId: { control: "text" },
		downloadedPresetIds: { control: "object" },
		onDownload: { table: { disable: true } },
		onHover: { table: { disable: true } },
	},
	decorators: [
		(Story) => (
			<div
				style={{
					width: 720,
					height: 480,
					padding: 12,
					background: "#252525",
					color: "#e0e0e0",
					overflow: "auto",
				}}
			>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const DefaultGallery: Story = {};

export const ListMode: Story = {
	args: { mode: "list" },
};

export const CardsMode: Story = {
	args: { mode: "cards" },
};

export const Empty: Story = {
	args: { filtered: [] },
};

export const Single: Story = {
	args: { filtered: [makeItem(0)] },
};

export const Downloading: Story = {
	args: {
		downloadingId: "preset-1",
		downloadState: { stage: "download", bytesLoaded: 500, bytesTotal: 1000 },
	},
};

export const GalleryZoomed: Story = {
	args: { mode: "gallery", scale: 1.5 },
};
