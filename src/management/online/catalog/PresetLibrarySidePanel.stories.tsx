import type { Meta, StoryObj } from "@storybook/react";
import { PresetLibrarySidePanel } from "./PresetLibrarySidePanel";

type Args = {
	showSidePanel: boolean;
	query: string;
	categories: string[];
	selectedCategory: string;
	allTags: string[];
	selectedTags: Set<string>;
	onTogglePanel: () => void;
	onQueryChange: (q: string) => void;
	onClearQuery: () => void;
	onCategoryChange: (cat: string) => void;
	onTagToggle: (tag: string) => void;
	onClearAllTags: () => void;
	onClearFilters: () => void;
};

const baseArgs: Args = {
	showSidePanel: true,
	query: "",
	categories: ["Color", "Glow", "Transition"],
	selectedCategory: "",
	allTags: ["cinematic", "loop", "minimal"],
	selectedTags: new Set<string>(),
	onTogglePanel: () => undefined,
	onQueryChange: () => undefined,
	onClearQuery: () => undefined,
	onCategoryChange: () => undefined,
	onTagToggle: () => undefined,
	onClearAllTags: () => undefined,
	onClearFilters: () => undefined,
};

const meta = {
	title: "Catalog/PresetLibrarySidePanel",
	component: PresetLibrarySidePanel,
	args: baseArgs,
	argTypes: {
		showSidePanel: { control: "boolean" },
		query: { control: "text" },
		categories: { control: "object" },
		selectedCategory: { control: "text" },
		allTags: { control: "object" },
		selectedTags: { control: "object" },
		onTogglePanel: { table: { disable: true } },
		onQueryChange: { table: { disable: true } },
		onClearQuery: { table: { disable: true } },
		onCategoryChange: { table: { disable: true } },
		onTagToggle: { table: { disable: true } },
		onClearAllTags: { table: { disable: true } },
		onClearFilters: { table: { disable: true } },
	},
	decorators: [
		(Story) => (
			<div
				style={{
					height: 360,
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

export const Hidden: Story = {
	args: { showSidePanel: false },
};

export const WithQuery: Story = {
	args: { query: "glow" },
};

export const CategorySelected: Story = {
	args: { selectedCategory: "Glow" },
};

export const TagsSelected: Story = {
	args: { selectedTags: new Set(["cinematic"]) },
};

export const FiltersActive: Story = {
	args: {
		query: "glow",
		selectedCategory: "Color",
		selectedTags: new Set(["minimal"]),
	},
};

export const NoTags: Story = {
	args: { allTags: [] },
};
