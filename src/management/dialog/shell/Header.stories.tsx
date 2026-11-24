import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
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
				borderWidth: "hairline",
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
	play: async ({ canvasElement }) => {
		// Issue #450: `justifyContent: "between"` was an invalid CSS value and
		// the browser dropped it, leaving the meta text next to the title.
		// Lock the computed value and the right-edge alignment.
		const header = canvasElement.querySelector("[data-dialog-header]");
		expect(header).not.toBeNull();
		if (!header) return;
		expect(getComputedStyle(header).justifyContent).toBe("space-between");
		const meta = header.querySelector("span");
		expect(meta).not.toBeNull();
		if (!meta) return;
		const headerRect = header.getBoundingClientRect();
		const metaRect = meta.getBoundingClientRect();
		expect(metaRect.right).toBeGreaterThan(
			headerRect.left + headerRect.width / 2,
		);
	},
};

export const LongTitle: Story = {
	args: { longTitle: true, meta: "long-id-abc-def" },
};

export const NoMeta: Story = {
	args: { meta: "" },
};
