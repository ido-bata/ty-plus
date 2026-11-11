import type { Meta, StoryObj } from "@storybook/react";
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
				actionsRunLabel="Run preset"
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
