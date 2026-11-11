import type { Meta, StoryObj } from "@storybook/react";
import type { SiblingListingEntry } from "@/management/preset/sibling-thumbnail";
import { css } from "@/styled-system/css";

import { SiblingThumbnail } from "./SiblingThumbnail";

const siblings: readonly SiblingListingEntry[] = [
	{ name: "alpha.png", path: "/preset/root/alpha.png", isDirectory: false },
];

type Args = {
	size: number;
};

const baseArgs: Args = {
	size: 96,
};

const renderSibling = (args: Args) => (
	<SiblingThumbnail
		entry={{ path: "/preset/root/alpha.ffx", isDirectory: false }}
		allEntries={siblings}
		size={args.size}
	/>
);

const meta = {
	title: "DirectoryBrowser/SiblingThumbnail",
	args: baseArgs,
	argTypes: {
		size: { control: { type: "range", min: 24, max: 160, step: 4 } },
	},
	// useThumbnail() resolves to idle under the Storybook decorators
	// (FilesGatewayProviderDecorator passes value={null}); the rendered
	// tree returns null in that case. The wrapper below makes the empty
	// surface visible without changing the component.
	decorators: [
		(Story) => (
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					borderWidth: "1px",
					borderStyle: "solid",
					borderColor: "border.default",
					bg: "surface.widget",
				})}
				style={{ width: 120, height: 120 }}
			>
				<Story />
			</div>
		),
	],
	render: renderSibling,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Large: Story = {
	args: { size: 144 },
};

export const Small: Story = {
	args: { size: 48 },
};
