import type { Meta, StoryObj } from "@storybook/react";
import { cx, tileRingClass } from "@ty-plus/ui";
import { expect } from "storybook/test";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";
import { Tile } from "./Tile";

const noop = (): void => undefined;

const makePreset = (id: string, iconText?: string): Preset => ({
	id,
	type: "preset",
	title: id,
	filePath: `ty-plus://${id}`,
	icon: iconText
		? // Structured text icons are not length-clamped on this path
			// (only string icons are) — long legacy/manual presets do
			// render multi-line fitted glyphs, which is the real
			// "long content in a tile" case (issue #794).
			{ type: "text", param: { text: iconText } }
		: presetIconText(id.slice(0, 2).toUpperCase() || "PR"),
});

type Args = {
	hasPreset: boolean;
	label: string;
	/** When set, the preset glyph renders this (unclamped) icon text. */
	iconText?: string;
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
		iconText: { control: "text" },
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
			preset={args.hasPreset ? makePreset("story", args.iconText) : undefined}
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

// Issue #194: long-string coverage — the tile label is the tooltip /
// accessible name (never painted inside the glyph-only tile), while long
// *icon text* is the real in-tile content that must fit. This story feeds
// an unclamped multi-word icon string so the capture shows the fitted
// multi-line glyph instead of duplicating `Default` (issue #794), and
// pins both contracts: the full label survives on `title`, and every
// glyph line stays inside the frame.
export const LongLabel: Story = {
	args: {
		hasPreset: true,
		label: "Apply Cinematic Color Grade with Extra Long Preset Display Name",
		iconText: "CINEMATIC GRADE",
	},
	play: async ({ canvasElement }) => {
		await playTileLayout({ canvasElement });
		const host = canvasElement.querySelector<HTMLElement>(
			"[data-preset-id='story']",
		);
		expect(host?.getAttribute("title")).toBe(
			"Apply Cinematic Color Grade with Extra Long Preset Display Name",
		);
		const glyph = canvasElement.querySelector<HTMLElement>(
			".ws-preset-icon--text",
		);
		if (!glyph) throw new Error("text glyph not found");
		const lines = glyph.querySelectorAll<HTMLElement>("span > span");
		expect(lines.length).toBeGreaterThanOrEqual(2);
		const frameRect = glyph.getBoundingClientRect();
		for (const line of lines) {
			const rect = line.getBoundingClientRect();
			expect(rect.top).toBeGreaterThanOrEqual(frameRect.top - 0.5);
			expect(rect.bottom).toBeLessThanOrEqual(frameRect.bottom + 0.5);
		}
	},
};
