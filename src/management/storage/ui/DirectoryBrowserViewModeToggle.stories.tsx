import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import {
	type DirectoryBrowserViewMode,
	DirectoryBrowserViewModeToggle,
} from "./DirectoryBrowserViewModeToggle";

type Args = {
	viewMode: DirectoryBrowserViewMode;
};

const baseArgs: Args = {
	viewMode: "list",
};

const renderToggle = (args: Args) => (
	<DirectoryBrowserViewModeToggle
		viewMode={args.viewMode}
		onChange={() => undefined}
	/>
);

const meta = {
	title: "DirectoryBrowser/DirectoryBrowserViewModeToggle",
	args: baseArgs,
	argTypes: {
		viewMode: {
			control: { type: "inline-radio" },
			options: ["list", "icons"],
		},
	},
	decorators: [
		(Story) => (
			<div
				className={css({ bg: "surface.widget", p: "2" })}
				style={{ width: 120 }}
			>
				<Story />
			</div>
		),
	],
	render: renderToggle,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

// Issue #194: selected-state contract — the two view-mode buttons must be
// rendered, distinguishable (active vs inactive computed color), and
// satisfy the layout contract. The toggle has no ARIA pressed state, so
// the machine check is the painted difference plus bounds.
const playSelectedState = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement;
}): Promise<void> => {
	expectCanvasLayout(canvasElement);
	const buttons = Array.from(canvasElement.querySelectorAll("button"));
	expect(buttons).toHaveLength(2);
	const [first, second] = buttons;
	const firstColor = getComputedStyle(first).color;
	const secondColor = getComputedStyle(second).color;
	expect(firstColor).not.toBe(secondColor);
};

export const ListSelected: Story = {
	play: playSelectedState,
};

export const IconsSelected: Story = {
	args: { viewMode: "icons" },
	play: playSelectedState,
};
