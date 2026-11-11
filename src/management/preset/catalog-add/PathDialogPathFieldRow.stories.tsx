import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { PathDialogPathFieldRow } from "./PathDialogPathFieldRow";

type Args = {
	value: string;
	placeholder: string;
};

const baseArgs: Args = {
	value: "",
	placeholder: "C:\\path\\file.ffx",
};

const decoratorBoxClass = css({
	width: "24rem",
	padding: "2",
});

const meta = {
	title: "Preset/CatalogAdd/PathDialogPathFieldRow",
	args: baseArgs,
	argTypes: {
		value: { control: "text" },
		placeholder: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<PathDialogPathFieldRow
			value={args.value}
			onChange={() => undefined}
			browseHint="/preset/root"
			placeholder={args.placeholder}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const WithValue: Story = {
	args: { value: "C:\\preset\\root\\mypreset.ffx" },
};
