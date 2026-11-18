import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { Preset } from "@/management/preset/contract";
import { expectCanvasLayout } from "@/storybook/quality/layout";
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

// Issue #166: the row must expose its entry contract (`data-entry-kind`,
// preset id, run affordance) inside the layout contract for every preset
// type — script/plugin rows share the same chrome as preset rows.
const playRowLayout = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement;
}): Promise<void> => {
	expectCanvasLayout(canvasElement, {
		requireRenderedSelector: "[data-directory-browser-entry] button",
	});
	const row = canvasElement.querySelector<HTMLElement>(
		"[data-directory-browser-entry]",
	);
	expect(row?.dataset.entryKind).toBe("preset");
	expect(row?.dataset.presetId).toBeTruthy();
	expect(
		canvasElement.querySelector("button[aria-label='Run preset']"),
	).not.toBeNull();
};

export const Default: Story = {
	play: playRowLayout,
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
	play: playRowLayout,
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
	play: playRowLayout,
};

export const LongTitle: Story = {
	args: {
		preset: makePreset({
			title: "Glow Pulse with Extra Long Display Name",
			filePath: "/preset/root/glow-extended-title.ffx",
		}),
	},
	play: playRowLayout,
};
