import type { Meta, StoryObj } from "@storybook/react";
import { useRef } from "react";

import type { Preset, PresetType } from "@/management/preset/contract";
import { PaletteDropdown } from "./palette-dropdown";
import type { PluginEffectIndexRow, QuickActionRootFileRow } from "./types";

type Args = {
	open: boolean;
	rowCount: number;
};

const noop = (): void => undefined;
const stubT = (key: string): string => key;
const typeLabel = (ty: PresetType): string => {
	if (ty === "preset") return "Preset root";
	if (ty === "script") return "Script root";
	if (ty === "plugin") return "Plugin root";
	return ty;
};

const preset: Preset = {
	id: "preset-1",
	type: "preset",
	title: "Glow preset",
	filePath: "/presets/glow.ffx",
	data: {},
};

const rootFile: QuickActionRootFileRow = {
	id: "root-1",
	type: "preset",
	title: "Studio color preset",
	filePath: "/presets/studio-color.ffx",
	description: "Saved preset",
};

const effect: PluginEffectIndexRow = {
	filePath: "/effects/glow.aex",
	matchName: "ADBE Glow",
	displayName: "Glow",
};

const buildRows = (count: number) =>
	Array.from({ length: count }).map((_, i) => {
		const kind = i % 3;
		const score = count - i;
		const typeOrder = kind;
		if (kind === 0) {
			return {
				kind: "preset" as const,
				preset,
				score,
				typeOrder,
			};
		}
		if (kind === 1) {
			return {
				kind: "rootFile" as const,
				rootFile,
				score,
				typeOrder,
			};
		}
		return {
			kind: "effect" as const,
			effect,
			score,
			typeOrder,
		};
	});

const baseArgs: Args = {
	open: true,
	rowCount: 5,
};

const meta = {
	title: "QuickActions/PaletteDropdown",
	args: baseArgs,
	argTypes: {
		open: { control: "boolean" },
		rowCount: { control: { type: "number", min: 0, max: 20 } },
	},
	render: (args: Args) => {
		const portalRef = useRef<HTMLDivElement | null>(null);
		const listRef = useRef<HTMLDivElement | null>(null);
		return (
			<div style={{ padding: 16 }}>
				<PaletteDropdown
					open={args.open}
					portalRef={portalRef}
					listRef={listRef}
					paletteRows={buildRows(args.rowCount)}
					clampedActiveIdx={0}
					widgetInstanceId="palette-dropdown-storybook-1"
					dropdownBox={{ top: 40, left: 16, width: 280 }}
					t={stubT}
					typeLabel={typeLabel}
					instanceAttr={{}}
					onSelect={noop}
					onPaletteMouseDown={noop}
				/>
			</div>
		);
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Closed: Story = {
	args: { open: false },
};

export const Empty: Story = {
	args: { rowCount: 0 },
};
