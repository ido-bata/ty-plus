import type { Meta, StoryObj } from "@storybook/react";
import { FilterToggleButton } from "./FilterToggleButton";

type Args = {
	pressed: boolean;
	label: string;
	onClick: () => void;
};

const meta = {
	title: "DirectoryBrowser/FilterToggleButton",
	component: FilterToggleButton,
	args: {
		pressed: false,
		label: ".ffx",
		onClick: () => undefined,
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Pressed: Story = {
	args: { pressed: true },
};

export const LongLabel: Story = {
	args: { label: ".aepreset" },
};

export const WithCallback: Story = {
	args: { pressed: false, label: "Click me" },
};
