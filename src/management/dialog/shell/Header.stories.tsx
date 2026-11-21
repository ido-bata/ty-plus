import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { Header } from "./Header";

type Args = {
	title: string;
	meta: string;
	longTitle: boolean;
};

const baseArgs: Args = {
	title: "Workspace settings",
	meta: "panel-2",
	longTitle: false,
};

const meta = {
	title: "Dialog/Shell/Header",
	component: Header,
	args: baseArgs,
	argTypes: {
		title: { control: "text" },
		meta: { control: "text" },
		longTitle: { control: "boolean" },
	},
	render: (args: Args) => (
		<div
			className={css({
				width: "80",
				borderRadius: "shell-sm",
				borderWidth: "1px",
				borderStyle: "solid",
				borderColor: "border.default",
				bg: "surface.dialog",
			})}
		>
			<Header
				title={
					args.longTitle
						? "Background layer editor — extended title"
						: args.title
				}
				meta={args.meta}
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const WithMeta: Story = {
	args: { meta: "panel-1 · 3 layers" },
};

export const LongTitle: Story = {
	args: { longTitle: true, meta: "long-id-abc-def" },
};

export const NoMeta: Story = {
	args: { meta: "" },
};
