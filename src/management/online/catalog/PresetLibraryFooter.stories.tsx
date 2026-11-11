import type { Meta, StoryObj } from "@storybook/react";
import { PresetLibraryFooter } from "./PresetLibraryFooter";

type Args = {
	filtered: number;
	catalog: number;
	mode: "gallery" | "list" | "cards";
	scale: number;
};

const baseArgs: Args = {
	filtered: 12,
	catalog: 50,
	mode: "gallery",
	scale: 1,
};

const meta = {
	title: "Catalog/PresetLibraryFooter",
	component: PresetLibraryFooter,
	args: baseArgs,
	argTypes: {
		mode: {
			control: { type: "inline-radio" },
			options: ["gallery", "list", "cards"],
		},
		filtered: { control: { type: "number", min: 0, max: 100 } },
		catalog: { control: { type: "number", min: 0, max: 100 } },
		scale: { control: { type: "range", min: 0.5, max: 2, step: 0.1 } },
	},
	decorators: [
		(Story) => (
			<div style={{ width: 480 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const ListMode: Story = {
	args: { mode: "list" },
};

export const CardsMode: Story = {
	args: { mode: "cards" },
};

export const EmptyFiltered: Story = {
	args: { filtered: 0, catalog: 50 },
};

export const GalleryZoomed: Story = {
	args: { mode: "gallery", scale: 1.5 },
};

export const GalleryZoomedOut: Story = {
	args: { mode: "gallery", scale: 0.5 },
};
