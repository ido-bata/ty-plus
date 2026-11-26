import type { Meta, StoryObj } from "@storybook/react";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import { GridCatalogTile } from "@/management/preset/workspace/GridCatalogTile";
import {
	createInitialSurfaceState,
	type SurfaceState,
} from "@/management/workspace/core/state";
import type { CatalogTileBodyProps } from "@/management/workspace/surface/grid-catalog-tile-context";
import { css } from "@/styled-system/css";

import { GridTile } from "./GridTile";

/**
 * Workspace placement cell (Issue #610): `GridTile` is the per-cell
 * renderer `Grid` mounts for every surface tile — `WorkspaceTileFrame`
 * chrome plus either a widget body or the injected catalog-tile renderer.
 * These stories cover the preset path and the missing-widget fallback;
 * the live widget path is exercised by the widget stories.
 */

const state: SurfaceState = createInitialSurfaceState({ mode: "live" });

const grid = { cellSize: 64, gap: 4, radius: 4 };

const makePreset = (id: string): Preset => ({
	id,
	type: "preset",
	title: id,
	filePath: `ty-plus://${id}`,
	icon: presetIconText(id.slice(0, 2).toUpperCase() || "PR"),
});

// Same renderer `panel/Main.tsx` injects via `GridCatalogTileBodyProvider`.
const renderCatalogTile = (props: CatalogTileBodyProps) => (
	<GridCatalogTile preset={props.preset} label={props.label} />
);

const placementStyle = {
	position: "absolute" as const,
	left: 8,
	top: 8,
	width: 96,
	height: 64,
};

type Args = {
	isWidget: boolean;
	selected: boolean;
};

const baseArgs: Args = {
	isWidget: false,
	selected: false,
};

const meta = {
	title: "Workspace/Surface/GridTile",
	args: baseArgs,
	argTypes: {
		isWidget: { control: "boolean" },
		selected: { control: "boolean" },
	},
	decorators: [
		(Story) => (
			<div
				className={css({
					position: "relative",
					height: "24",
					width: "48",
					padding: "2",
					backgroundColor: "surface.panel",
				})}
			>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<GridTile
			key="tile-0"
			state={state}
			grid={grid}
			tile={{ id: "preset-story", x: 0, y: 0, width: 1, height: 1 }}
			widgetRow={undefined}
			preset={args.isWidget ? undefined : makePreset("story")}
			label="Story preset"
			placementStyle={placementStyle}
			shellAttrs={{}}
			placementSelected={args.selected}
			isWidget={args.isWidget}
			renderCatalogTile={renderCatalogTile}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

/** Preset tile — frame chrome + catalog glyph. */
export const PresetTile: Story = {};

/** Widget slot whose layout row is missing — the "config could not be
 *  loaded" fallback card inside the same tile frame. */
export const WidgetMissing: Story = {
	args: { isWidget: true },
};

/** Selected placement — accent selection ring. */
export const Selected: Story = {
	args: { selected: true },
};
