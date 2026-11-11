import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { FolderScanDepthSelector } from "./FolderScanDepthSelector";

type Args = {
	recursive: string;
};

const baseArgs: Args = {
	recursive: "false",
};

const decoratorBoxClass = css({
	width: "18rem",
	padding: "2",
});

const meta = {
	title: "Preset/Group/FolderScanDepthSelector",
	args: baseArgs,
	argTypes: {
		recursive: {
			control: { type: "inline-radio" },
			options: ["false", "true"],
		},
	},
	render: (args: Args) => (
		<div className={decoratorBoxClass}>
			<FolderScanDepthSelector
				recursive={args.recursive}
				onRecursiveChange={() => undefined}
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Direct: Story = { args: { recursive: "false" } };

export const Recursive: Story = { args: { recursive: "true" } };
