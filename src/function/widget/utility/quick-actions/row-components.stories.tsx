import type { Meta, StoryObj } from "@storybook/react";

import type { PresetType } from "@/management/preset/contract";
import { EffectRow, PresetRow, RootFileRow } from "./row-components";
import type { PluginEffectIndexRow, QuickActionRootFileRow } from "./types";

type Args = {
	rowKind: "effect" | "rootFile" | "preset";
	selected: boolean;
};

const noop = (): void => undefined;
const stubT = (key: string): string => key;
const typeLabel = (ty: PresetType): string => {
	if (ty === "preset") return "Preset root";
	if (ty === "script") return "Script root";
	if (ty === "plugin") return "Plugin root";
	return ty;
};

const effect: PluginEffectIndexRow = {
	filePath: "/effects/glow.aex",
	matchName: "ADBE Glow",
	displayName: "Glow",
};

const rootFile: QuickActionRootFileRow = {
	id: "root-1",
	type: "preset",
	title: "Studio color preset",
	filePath: "/presets/studio-color.ffx",
	description: "Saved preset",
};

const samplePreset = {
	id: "preset-1",
	type: "preset" as const,
	title: "Glow preset",
	filePath: "/presets/glow.ffx",
	data: {},
};

const baseArgs: Args = {
	rowKind: "effect",
	selected: false,
};

const meta = {
	title: "QuickActions/RowComponents",
	args: baseArgs,
	argTypes: {
		rowKind: {
			control: { type: "inline-radio" },
			options: ["effect", "rootFile", "preset"],
		},
		selected: { control: "boolean" },
	},
	decorators: [
		(Story) => (
			<div
				style={{
					width: 320,
					padding: 12,
					display: "flex",
					flexDirection: "column",
					gap: 0,
				}}
			>
				<Story />
			</div>
		),
	],
	render: (args: Args) => {
		if (args.rowKind === "effect") {
			return (
				<EffectRow
					effect={effect}
					idx={0}
					selected={args.selected}
					widgetInstanceId="row-storybook-1"
					t={stubT}
					onSelect={noop}
				/>
			);
		}
		if (args.rowKind === "rootFile") {
			return (
				<RootFileRow
					rootFile={rootFile}
					idx={0}
					selected={args.selected}
					widgetInstanceId="row-storybook-1"
					t={stubT}
					typeLabel={typeLabel}
					onSelect={noop}
				/>
			);
		}
		return (
			<PresetRow
				preset={samplePreset}
				idx={0}
				selected={args.selected}
				widgetInstanceId="row-storybook-1"
				tl={typeLabel(samplePreset.type)}
				onSelect={noop}
			/>
		);
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Effect: Story = {};

export const RootFile: Story = {
	args: { rowKind: "rootFile" },
};

export const Preset: Story = {
	args: { rowKind: "preset" },
};

export const Selected: Story = {
	args: { selected: true },
};
