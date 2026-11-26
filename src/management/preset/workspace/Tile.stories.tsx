import type { Meta, StoryObj } from "@storybook/react";
import { cx, tileRingClass } from "@ty-plus/ui";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";
import { Tile } from "./Tile";

const noop = (): void => undefined;

const makePreset = (id: string): Preset => ({
	id,
	type: "preset",
	title: id,
	filePath: `ty-plus://${id}`,
	icon: presetIconText(id.slice(0, 2).toUpperCase() || "PR"),
});

type Args = {
	hasPreset: boolean;
	label: string;
};

const baseArgs: Args = {
	hasPreset: true,
	label: "My preset",
};

// Mirror the product tile chrome: in the workspace grid the glyph is
// wrapped by `WorkspaceTileFrame` (surface.widget fill + gridcell ring),
// so the story frame must provide the same surface or the capture reads
// as a blank tile with a floating "ST".
const decoratorBoxClass = css({
	height: "8rem",
	width: "8rem",
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
});

const meta = {
	title: "Preset/Workspace/Tile",
	args: baseArgs,
	argTypes: {
		hasPreset: { control: "boolean" },
		label: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className={cx(decoratorBoxClass, tileRingClass)}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<Tile
			preset={args.hasPreset ? makePreset("story") : undefined}
			label={args.label}
			onHoverChange={noop}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

// Issue #194: workspace tile contract — the tile must stay inside its
// grid cell and the viewport, in both populated and missing states.
const playTileLayout = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement;
}): Promise<void> => {
	expectCanvasLayout(canvasElement);
};

export const Default: Story = {
	play: playTileLayout,
};

export const Missing: Story = {
	args: { hasPreset: false, label: "missing-row" },
	play: playTileLayout,
};

// Issue #194: long-string coverage — an over-long label must truncate
// inside the tile instead of overflowing the cell or the page.
export const LongLabel: Story = {
	args: {
		hasPreset: true,
		label: "Apply Cinematic Color Grade with Extra Long Preset Display Name",
	},
	play: playTileLayout,
};
