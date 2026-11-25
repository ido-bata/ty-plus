import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";

import { WorkspaceTileFrame } from "./TileFrame";

/**
 * Workspace tile chrome (Issue #610): the `surface.widget` fill plus the
 * gridcell ring that every placement cell shares. `GridTile` and preset
 * surfaces wrap their bodies in this frame; these stories pin the two
 * ring states (default / selected).
 */

type Args = {
	selected: boolean;
};

const meta = {
	title: "Workspace/Surface/TileFrame",
	args: {
		selected: false,
	},
	argTypes: {
		selected: { control: "boolean" },
	},
	decorators: [
		(Story) => (
			<div
				className={css({
					display: "flex",
					padding: "4",
					backgroundColor: "surface.panel",
				})}
			>
				<Story />
			</div>
		),
	],
	render: (args) => (
		<WorkspaceTileFrame
			selected={args.selected}
			style={{ width: 144, height: 96 }}
			attrs={{ "data-story-tile": "" }}
		>
			<div
				className={css({
					display: "flex",
					height: "full",
					width: "full",
					alignItems: "center",
					justifyContent: "center",
					color: "text.muted",
					fontSize: "shell-text-sm",
				})}
			>
				tile body
			</div>
		</WorkspaceTileFrame>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default ring — the `ws.gridcell-ring-border` hairline. */
export const Default: Story = {
	play: async ({ canvasElement }) => {
		// The ring is the aria-hidden overlay sibling of the content well.
		const ring = canvasElement.querySelector("[data-story-tile] [aria-hidden]");
		if (!ring) throw new Error("tile frame ring not found");
		expect(getComputedStyle(ring).borderTopWidth).not.toBe("0px");
	},
};

/** Selected placement — accent ring via `gridcell-ring-border-selected`. */
export const Selected: Story = {
	args: { selected: true },
};
