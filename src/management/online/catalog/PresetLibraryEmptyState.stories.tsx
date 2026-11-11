import type { Meta, StoryObj } from "@storybook/react";
import { PresetLibraryEmptyState } from "./PresetLibraryEmptyState";

type Args = {
	loading: boolean;
	catalogLength: number;
	filteredLength: number;
	onRefresh: () => void;
	onClearFilters: () => void;
};

const baseArgs: Args = {
	loading: false,
	catalogLength: 0,
	filteredLength: 0,
	onRefresh: () => undefined,
	onClearFilters: () => undefined,
};

const meta = {
	title: "Catalog/PresetLibraryEmptyState",
	component: PresetLibraryEmptyState,
	args: baseArgs,
	argTypes: {
		loading: { control: "boolean" },
		catalogLength: { control: { type: "number", min: 0, max: 50 } },
		filteredLength: { control: { type: "number", min: 0, max: 50 } },
		onRefresh: { table: { disable: true } },
		onClearFilters: { table: { disable: true } },
	},
	decorators: [
		(Story) => (
			<div
				style={{
					width: 480,
					height: 240,
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

export const Default: Story = {
	args: { catalogLength: 0, filteredLength: 0 },
};

export const Loading: Story = {
	args: { loading: true, catalogLength: 0, filteredLength: 0 },
};

export const NoMatches: Story = {
	args: { catalogLength: 25, filteredLength: 0 },
};

export const WithResults: Story = {
	args: { catalogLength: 25, filteredLength: 12 },
};
