import type { Meta, StoryObj } from "@storybook/react";
import { PresetLibrarySearchBar } from "./PresetLibrarySearchBar";

type Args = {
	query: string;
	mode: "gallery" | "list" | "cards";
	onQueryChange: (q: string) => void;
	onClearQuery: () => void;
	onModeChange: (mode: "gallery" | "list" | "cards") => void;
};

const baseArgs: Args = {
	query: "",
	mode: "gallery",
	onQueryChange: () => undefined,
	onClearQuery: () => undefined,
	onModeChange: () => undefined,
};

const meta = {
	title: "Catalog/PresetLibrarySearchBar",
	component: PresetLibrarySearchBar,
	args: baseArgs,
	argTypes: {
		query: { control: "text" },
		mode: {
			control: { type: "inline-radio" },
			options: ["gallery", "list", "cards"],
		},
		onQueryChange: { table: { disable: true } },
		onClearQuery: { table: { disable: true } },
		onModeChange: { table: { disable: true } },
	},
	decorators: [
		(Story) => (
			<div style={{ width: 640 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const WithQuery: Story = {
	args: { query: "glow effect" },
};

export const CardsMode: Story = {
	args: { mode: "cards" },
};

export const ListMode: Story = {
	args: { mode: "list" },
};
