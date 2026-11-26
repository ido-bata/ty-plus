import type { Meta, StoryObj } from "@storybook/react";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import type { GroupEntry } from "@/management/preset/group/catalog";
import {
	createInitialSurfaceState,
	type SurfaceState,
} from "@/management/workspace/core/state";
import { PanelStateProvider } from "@/management/workspace/state/PanelContext";
import { css } from "@/styled-system/css";

import { WorkspaceCatalogTileBody } from "./WorkspaceCatalogTileBody";

/**
 * Catalog tile body injected into workspace grid cells (Issue #610).
 * `Grid` renders this through `GridCatalogTileBodyProvider`; it resolves
 * the tile id against widget instances, group catalog entries and the
 * preset list, then delegates to `GridCatalogTile` /
 * `GroupContainerCatalogTile`. Stories pin the preset, group and
 * unresolved-tile branches against a real `SurfaceState`.
 */

const PRESET: Preset = {
	id: "preset-glow",
	type: "preset",
	title: "Glow preset",
	filePath: "ty-plus://preset-glow",
	icon: presetIconText("GL"),
};

const GROUP: GroupEntry = {
	id: "group-bugs",
	title: "Bug fixes",
	presetIds: ["preset-glow", "preset-chroma"],
};

const buildState = (): SurfaceState => ({
	...createInitialSurfaceState({ mode: "live" }),
	presets: [PRESET],
	groupCatalogEntries: [GROUP],
	widgetInstanceTypes: {},
});

const tileBox = css({
	height: "32",
	width: "32",
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
	display: "flex",
});

type Args = {
	tileId: string;
	label: string;
};

const baseArgs: Args = {
	tileId: "preset-glow",
	label: "Glow preset",
};

const meta = {
	title: "Preset/Group/WorkspaceCatalogTileBody",
	args: baseArgs,
	argTypes: {
		tileId: { control: "text" },
		label: { control: "text" },
	},
	render: (args: Args) => (
		<PanelStateProvider state={buildState()}>
			<div className={tileBox}>
				<WorkspaceCatalogTileBody
					preset={undefined}
					label={args.label}
					tileId={args.tileId}
				/>
			</div>
		</PanelStateProvider>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

/** Preset tile — resolved through `state.presets` by tile id. */
export const PresetTile: Story = {};

/** Group tile — resolved through `state.groupCatalogEntries`. */
export const GroupTile: Story = {
	args: { tileId: "group-bugs", label: "Bug fixes" },
};

/** Unresolvable tile id — falls back to the "?" glyph tile. */
export const UnknownTile: Story = {
	args: { tileId: "missing-ref", label: "missing-ref" },
};
