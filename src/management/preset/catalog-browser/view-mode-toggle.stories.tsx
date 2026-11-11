import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import {
	type CatalogBrowserViewMode,
	CatalogBrowserViewModeToggle,
} from "./view-mode-toggle";

type Args = {
	viewMode: CatalogBrowserViewMode;
};

const baseArgs: Args = {
	viewMode: "icons",
};

const decoratorBoxClass = css({ padding: "2" });

const meta = {
	title: "Preset/CatalogBrowser/ViewModeToggle",
	args: baseArgs,
	argTypes: {
		viewMode: {
			control: { type: "inline-radio" },
			options: ["list", "icons"],
		},
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<CatalogBrowserViewModeToggle
			viewMode={args.viewMode}
			onViewModeChange={() => undefined}
			onEnterIconView={() => undefined}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const IconView: Story = {
	args: { viewMode: "icons" },
};

export const ListView: Story = {
	args: { viewMode: "list" },
};
