import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { PathDialogFooterActions } from "./PathDialogFooterActions";

type Args = {
	busy: boolean;
	canAdd: boolean;
};

const baseArgs: Args = {
	busy: false,
	canAdd: true,
};

const decoratorBoxClass = css({
	width: "28rem",
	padding: "2",
});

const meta = {
	title: "Preset/CatalogAdd/PathDialogFooterActions",
	args: baseArgs,
	argTypes: {
		busy: { control: "boolean" },
		canAdd: { control: "boolean" },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<PathDialogFooterActions
			close={() => undefined}
			busy={args.busy}
			canAdd={args.canAdd}
			handleAdd={async () => undefined}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Disabled: Story = {
	args: { canAdd: false },
};

export const Busy: Story = {
	args: { busy: true },
};
