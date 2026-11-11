import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { PathDialogNameField } from "./PathDialogNameField";

type Args = {
	name: string;
};

const baseArgs: Args = {
	name: "My preset",
};

const decoratorBoxClass = css({
	width: "18rem",
	padding: "2",
});

const meta = {
	title: "Preset/CatalogAdd/PathDialogNameField",
	args: baseArgs,
	argTypes: {
		name: { control: "text" },
	},
	render: (args: Args) => (
		<div className={decoratorBoxClass}>
			<PathDialogNameField name={args.name} onNameChange={() => undefined} />
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Empty: Story = {
	args: { name: "" },
};
