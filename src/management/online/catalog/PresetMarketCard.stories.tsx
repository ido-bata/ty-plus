import type { Meta, StoryObj } from "@storybook/react";
import type { DownloadProgress } from "@/management/online/catalog/use-cases";
import type { PresetSearchItem } from "@/management/online/contract";
import { PresetMarketCard, PresetMarketCardItem } from "./PresetMarketCard";

type Args = {
	item: PresetSearchItem;
	downloadingId: string | null;
	downloadState: DownloadProgress | null;
	completedId: string | null;
	isDownloaded: boolean;
	onDownload: () => void;
};

const baseItem: PresetSearchItem = {
	presetId: "preset-card-001",
	name: "Cinematic Glow Transition",
	description: "Smooth cinematic glow for any cut.",
	category: "Color",
	notionPageUrl: "https://example.com/manual",
	thumbnailUrl: undefined,
};

const baseArgs: Args = {
	item: baseItem,
	downloadingId: null,
	downloadState: null,
	completedId: null,
	isDownloaded: false,
	onDownload: () => undefined,
};

const meta = {
	title: "Catalog/PresetMarketCard",
	component: PresetMarketCard,
	args: baseArgs,
	argTypes: {
		isDownloaded: { control: "boolean" },
		downloadingId: { control: "text" },
		downloadState: { control: "object" },
		completedId: { control: "text" },
		onDownload: { table: { disable: true } },
	},
	decorators: [
		(Story) => (
			<div
				style={{
					width: 220,
					background: "#252525",
					color: "#e0e0e0",
				}}
			>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const WithoutDescription: Story = {
	args: {
		item: { ...baseItem, description: undefined },
	},
};

export const WithoutCategory: Story = {
	args: {
		item: { ...baseItem, category: undefined },
	},
};

export const WithoutNotion: Story = {
	args: {
		item: { ...baseItem, notionPageUrl: undefined },
	},
};

export const Downloading: Story = {
	args: {
		downloadingId: baseItem.presetId,
		downloadState: { stage: "download", bytesLoaded: 500, bytesTotal: 1000 },
	},
};

export const Complete: Story = {
	args: {
		completedId: baseItem.presetId,
	},
};

export const AlreadyDownloaded: Story = {
	args: {
		isDownloaded: true,
	},
};

export const ItemVariant: Story = {
	render: (args) => (
		<div style={{ width: 480 }}>
			<PresetMarketCardItem
				item={args.item}
				downloadingId={args.downloadingId}
				downloadState={args.downloadState}
				completedId={args.completedId}
				isDownloaded={args.isDownloaded}
				onDownload={() => undefined}
			/>
		</div>
	),
};

export const ItemWithoutDescription: Story = {
	render: (args) => (
		<div style={{ width: 480 }}>
			<PresetMarketCardItem
				item={{ ...args.item, description: undefined }}
				downloadingId={args.downloadingId}
				downloadState={args.downloadState}
				completedId={args.completedId}
				isDownloaded={args.isDownloaded}
				onDownload={() => undefined}
			/>
		</div>
	),
};

export const ItemDownloading: Story = {
	render: (args) => (
		<div style={{ width: 480 }}>
			<PresetMarketCardItem
				item={args.item}
				downloadingId={args.downloadingId}
				downloadState={args.downloadState}
				completedId={args.completedId}
				isDownloaded={args.isDownloaded}
				onDownload={() => undefined}
			/>
		</div>
	),
	args: {
		downloadingId: baseItem.presetId,
		downloadState: { stage: "download", bytesLoaded: 500, bytesTotal: 1000 },
	},
};
