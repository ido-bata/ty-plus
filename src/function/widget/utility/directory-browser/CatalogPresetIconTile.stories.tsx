import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { Preset } from "@/management/preset/contract";
import { css } from "@/styled-system/css";
import { CatalogPresetIconTile } from "./CatalogPresetIconTile";

const makePreset = (overrides: Partial<Preset> = {}): Preset => ({
	id: "preset-glow",
	type: "preset",
	title: "Glow Pulse",
	filePath: "/preset/root/glow.ffx",
	...overrides,
});

const noop = (): void => undefined;

type Args = {
	preset: Preset;
	iconTileAspect: "square" | "wide";
};

const baseArgs: Args = {
	preset: makePreset(),
	iconTileAspect: "square",
};

const meta = {
	title: "DirectoryBrowser/CatalogPresetIconTile",
	args: baseArgs,
	argTypes: {
		iconTileAspect: {
			control: { type: "inline-radio" },
			options: ["square", "wide"],
		},
	},
	render: (args: Args) => (
		<div className={css({ width: "36", padding: "2" })}>
			<CatalogPresetIconTile
				preset={args.preset}
				iconTileAspect={args.iconTileAspect}
				presetGlyphSiblingProps={{}}
				setFileBrowserSelectedPath={noop}
				runPreset={noop}
				actionsRunLabel="Run"
				actionsRunBlockedMissingLabel="Preset asset is missing on disk"
				actionsRunBlockedUnverifiableLabel="Could not verify preset asset"
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Wide: Story = {
	args: { iconTileAspect: "wide" },
};

export const ScriptPreset: Story = {
	args: {
		preset: makePreset({
			id: "script-anim",
			type: "script",
			title: "Bounce Animator",
			filePath: "/preset/root/bounce.jsx",
		}),
	},
};

export const LongTitle: Story = {
	args: {
		preset: makePreset({
			title: "Glow Pulse with Extra Long Display Name",
			filePath: "/preset/root/glow-extended-title.ffx",
		}),
	},
};

// Issue #146: hover-state capture. The tile has no selected state of its
// own (selection lives in the parent browser via
// `setFileBrowserSelectedPath`), so hover is the interaction state this
// story exercises: a real-pointer hover must lift the tile button to
// `interactive.hover`, and the post-play state is what gets captured.
export const Hover: Story = {
	play: async ({ canvasElement }) => {
		const tile = canvasElement.querySelector<HTMLElement>(
			"[data-preset-id] button",
		);
		if (!tile) throw new Error("preset icon tile not found");
		const { userEvent } = await import("vitest/browser");
		const resting = getComputedStyle(tile).backgroundColor;
		await userEvent.hover(tile);
		await expect(tile.matches(":hover")).toBe(true);
		// The button transitions colors — wait for it to settle before
		// comparing computed styles.
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(tile).backgroundColor).not.toBe(resting);
	},
};
