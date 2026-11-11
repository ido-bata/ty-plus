import type { Meta, StoryObj } from "@storybook/react";
import type { PresetSearchItem } from "@/management/online/contract";
import { PresetCategoryBadge, PresetMarketThumb } from "./PresetMarketThumb";

type Args = {
	item: PresetSearchItem;
	size: "gallery" | "list" | "card";
};

const baseItem: PresetSearchItem = {
	presetId: "preset-001",
	name: "Cinematic Glow",
	thumbnailUrl: undefined,
};

const baseArgs: Args = {
	item: baseItem,
	size: "gallery",
};

const meta = {
	title: "Catalog/PresetMarketThumb",
	component: PresetMarketThumb,
	args: baseArgs,
	argTypes: {
		size: {
			control: { type: "inline-radio" },
			options: ["gallery", "list", "card"],
		},
	},
	decorators: [
		(Story) => (
			<div
				style={{
					padding: 16,
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

export const Gallery: Story = {};

export const List: Story = {
	args: { size: "list" },
};

export const Card: Story = {
	args: { size: "card" },
};

export const WithThumb: Story = {
	args: {
		size: "gallery",
		item: {
			presetId: "preset-with-thumb",
			name: "Demo",
			thumbnailUrl: "https://example.com/demo.png",
		},
	},
};

export const LongName: Story = {
	args: {
		size: "gallery",
		item: {
			presetId: "preset-long",
			name: "Very Long Preset Name With Many Words",
		},
	},
};

export const SingleWord: Story = {
	args: {
		size: "gallery",
		item: {
			presetId: "preset-single",
			name: "FX",
		},
	},
};

export const EmptyName: Story = {
	args: {
		size: "list",
		item: {
			presetId: "preset-empty",
			name: "",
		},
	},
};

export const CategoryBadge: StoryObj = {
	render: () => (
		<div style={{ padding: 16, background: "#252525" }}>
			<PresetCategoryBadge category="Color Correction" />
		</div>
	),
};
