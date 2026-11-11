import type { Meta, StoryObj } from "@storybook/react";
import type { PresetSearchItem } from "@/management/online/contract";
import { PresetMarketTable } from "./PresetMarketTable";

type Args = {
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
	onMouseEnter: (id: string) => void;
	onMouseLeave: () => void;
};

const makeItem = (i: number): PresetSearchItem => ({
	presetId: `preset-${i}`,
	name: `Preset ${i + 1}`,
	description: "Description text.",
	category: ["Color", "Glow", "Transition", "Effect"][i % 4],
	notionPageUrl: i % 2 === 0 ? "https://example.com/manual" : undefined,
	thumbnailUrl: undefined,
});

const baseArgs: Args = {
	filtered: Array.from({ length: 4 }, (_, i) => makeItem(i)),
	downloadingId: null,
	downloadState: null,
	completedId: null,
	downloadedPresetIds: new Set<string>(),
	onDownload: () => undefined,
	onMouseEnter: () => undefined,
	onMouseLeave: () => undefined,
};

const meta = {
	title: "Catalog/PresetMarketTable",
	component: PresetMarketTable,
	args: baseArgs,
	argTypes: {
		filtered: { control: "object" },
		downloadingId: { control: "text" },
		downloadState: { control: "object" },
		completedId: { control: "text" },
		downloadedPresetIds: { control: "object" },
		onDownload: { table: { disable: true } },
		onMouseEnter: { table: { disable: true } },
		onMouseLeave: { table: { disable: true } },
	},
	decorators: [
		(Story) => (
			<div
				style={{
					width: 720,
					height: 360,
					padding: 12,
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

export const Empty: Story = {
	args: { filtered: [] },
};

export const SingleRow: Story = {
	args: { filtered: [makeItem(0)] },
};

export const ManyRows: Story = {
	args: { filtered: Array.from({ length: 10 }, (_, i) => makeItem(i)) },
};

export const DownloadingRow: Story = {
	args: {
		downloadingId: "preset-1",
		downloadState: { stage: "download", bytesLoaded: 500, bytesTotal: 1000 },
	},
};

export const CompletedRow: Story = {
	args: {
		completedId: "preset-1",
	},
};

export const DownloadedRow: Story = {
	args: {
		downloadedPresetIds: new Set(["preset-2"]),
	},
};
