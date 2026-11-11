import type { Meta, StoryObj } from "@storybook/react";
import { PresetLibraryHeader } from "./PresetLibraryHeader";

type Args = {
	showSidePanel: boolean;
	isReloading: boolean;
	onShowSidePanel: () => void;
	onReload: () => void;
};

const baseArgs: Args = {
	showSidePanel: true,
	isReloading: false,
	onShowSidePanel: () => undefined,
	onReload: () => undefined,
};

const meta = {
	title: "Catalog/PresetLibraryHeader",
	component: PresetLibraryHeader,
	args: baseArgs,
	argTypes: {
		showSidePanel: { control: "boolean" },
		isReloading: { control: "boolean" },
		onShowSidePanel: { table: { disable: true } },
		onReload: { table: { disable: true } },
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

export const SidePanelHidden: Story = {
	args: { showSidePanel: false },
};

export const Reloading: Story = {
	args: { isReloading: true },
};

export const HiddenWhileReloading: Story = {
	args: { showSidePanel: false, isReloading: true },
};
