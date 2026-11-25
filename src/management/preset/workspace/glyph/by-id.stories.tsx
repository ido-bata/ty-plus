import type { Meta, StoryObj } from "@storybook/react";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import { css } from "@/styled-system/css";

import { PresetGlyphById } from "./by-id";

/**
 * Catalog-id preset glyph (Issue #610): resolves a `Preset` by id (or an
 * already-loaded `preset` row) and renders it through the same glyph
 * surfaces as the workspace tiles — `catalog` host or the `framed` box.
 * Passing `preset` with a matching id skips the catalog lookup, which is
 * what these stories exercise.
 */

const makePreset = (id: string): Preset => ({
	id,
	type: "preset",
	title: id,
	filePath: `ty-plus://${id}`,
	icon: presetIconText(id.slice(0, 2).toUpperCase() || "PR"),
});

type Args = {
	presetId: string;
	surface: "catalog" | "framed";
};

const baseArgs: Args = {
	presetId: "preset-glow",
	surface: "catalog",
};

const meta = {
	title: "Preset/Workspace/PresetGlyphById",
	args: baseArgs,
	argTypes: {
		presetId: { control: "text" },
		surface: {
			control: { type: "inline-radio" },
			options: ["catalog", "framed"],
		},
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
	render: (args: Args) => (
		<PresetGlyphById
			presetId={args.presetId}
			preset={makePreset(args.presetId)}
			boxClass={css({ height: "32", width: "32" })}
			surface={args.surface}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

/** Catalog-surface glyph — same host as the workspace `PresetTile`. */
export const Catalog: Story = {};

/** Framed variant — bordered box for non-listing surfaces. */
export const Framed: Story = {
	args: { surface: "framed" },
};
