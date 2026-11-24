import type { Meta, StoryObj } from "@storybook/react";
import { storyT } from "@/storybook/i18n-story-t";
import { css } from "@/styled-system/css";

import { ToolDialogFooter } from "./Footer";

type Args = {
	busy: boolean;
};

const baseArgs: Args = {
	busy: false,
};

const decoratorBoxClass = css({
	width: "28rem",
	padding: "2",
});

const meta = {
	title: "Preset/ToolShell/Dialog/Footer",
	args: baseArgs,
	argTypes: {
		busy: { control: "boolean" },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<ToolDialogFooter
			close={() => undefined}
			busy={args.busy}
			t={storyT("presets")}
			onSave={async () => undefined}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Saving: Story = {
	args: { busy: true },
};
