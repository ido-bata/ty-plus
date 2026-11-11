import type { Meta, StoryObj } from "@storybook/react";
import { PresetLibraryViewModeToggle } from "./PresetLibraryViewModeToggle";

type Args = {
	mode: "gallery" | "list" | "cards";
	onModeChange: (mode: "gallery" | "list" | "cards") => void;
};

const baseArgs: Args = {
	mode: "gallery",
	onModeChange: () => undefined,
};

const meta = {
	title: "Catalog/PresetLibraryViewModeToggle",
	component: PresetLibraryViewModeToggle,
	args: baseArgs,
	argTypes: {
		mode: {
			control: { type: "inline-radio" },
			options: ["gallery", "list", "cards"],
		},
		onModeChange: { table: { disable: true } },
	},
	decorators: [
		(Story) => (
			<div
				style={{
					padding: 16,
					background: "#252525",
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

export const Cards: Story = {
	args: { mode: "cards" },
};

export const List: Story = {
	args: { mode: "list" },
};
