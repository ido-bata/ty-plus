import type { Meta, StoryObj } from "@storybook/react";
import type { Preset } from "@/management/preset/contract";
import { CatalogPresetListRow } from "./CatalogPresetListRow";

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
};

const baseArgs: Args = {
	preset: makePreset(),
};

const meta = {
	title: "DirectoryBrowser/CatalogPresetListRow",
	args: baseArgs,
	render: (args: Args) => (
		<ul
			style={{
				listStyle: "none",
				padding: 0,
				margin: 0,
				minWidth: 360,
			}}
		>
			<CatalogPresetListRow
				preset={args.preset}
				presetGlyphSiblingProps={{}}
				activateCatalogPresetRow={noop}
				runPreset={noop}
				actionsRunLabel="Run preset"
			/>
		</ul>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

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

export const PluginPreset: Story = {
	args: {
		preset: makePreset({
			id: "plugin-fx",
			type: "plugin",
			title: "Color Suite",
			filePath: "/preset/root/color.aex",
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
