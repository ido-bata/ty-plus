import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { type JSX, useEffect } from "react";
import { expect } from "storybook/test";

import { type Preset, presetIconText } from "@/management/preset/contract";
import { GridCatalogTile } from "@/management/preset/workspace/GridCatalogTile";
import {
	__resetPersistenceGatewayForTests,
	initPersistenceGateway,
} from "@/management/storage/persistence/io";
import type { PersistenceGateway } from "@/management/storage/runtime-gateway-port";
import {
	createInitialSurfaceState,
	type SurfaceState,
} from "@/management/workspace/core/state";
import {
	PanelStateProvider,
	SelectionProvider,
} from "@/management/workspace/state/PanelContext";
import { css } from "@/styled-system/css";
import { Grid } from "./Grid";
import type { CatalogTileBodyProps } from "./grid-catalog-tile-context";
import { GridCatalogTileBodyProvider } from "./grid-catalog-tile-context";

/**
 * Workspace placement grid (Issue #610): `Grid` is the scroll surface
 * `panel/Main` mounts — it derives one cell per `surfaceTiles` row and
 * delegates each cell to `GridTile` (widget body via the widget registry,
 * catalog body via `GridCatalogTileBodyProvider`).
 *
 * The fixture mixes all four tile roles the classifier can produce:
 * a bound widget instance, a preset catalog row, a group catalog row,
 * and an unresolvable orphan id. Widget tiles mount the real widget
 * through `WidgetTutorialLayer`, so the decorator pre-seeds
 * `tutorial-state.json` as "seen" via an in-memory persistence gateway —
 * otherwise the first-run coach-mark tour would auto-open over the grid
 * on every mount (that behaviour is covered by
 * `Management/Tutorial/WidgetTutorialLayer`).
 */

const TUTORIAL_STATE_SEEN = {
	version: 1,
	entries: {
		menu: {
			contentVersion: "1",
			seenAt: "2026-01-01T00:00:00.000Z",
		},
	},
};

const tutorialSeenGateway: PersistenceGateway = {
	readJson: async (request) =>
		request.key === "tutorialState"
			? { value: TUTORIAL_STATE_SEEN }
			: { value: null },
	readText: async () => ({ text: null }),
	writeJson: async () => undefined,
	removeJson: async () => undefined,
};

const WithSeenTutorials: Decorator = (Story) => {
	// Render-phase install: `WidgetTutorialLayer` reads tutorial state in a
	// mount effect, so the gateway must be in place before children render.
	// The cleanup resets the module-level gateway so sibling stories keep
	// the empty-state default.
	initPersistenceGateway(tutorialSeenGateway);
	useEffect(() => () => __resetPersistenceGatewayForTests(), []);
	return <Story />;
};

const bouncePreset: Preset = {
	id: "preset-bounce",
	type: "preset",
	title: "Bounce Ease",
	filePath: "ty-plus://bounce",
	icon: presetIconText("BE"),
};

// Membership points at a preset that is NOT placed on the surface:
// `shouldHideGroupedMemberSurfaceTile` hides member presets as separate
// tiles (they render inside the group panel), so listing `preset-bounce`
// here would collapse the preset tile out of the grid.
const fxGroup = {
	id: "group-fx-pack",
	title: "FX Pack",
	presetIds: ["preset-other"],
};

const buildState = (overrides?: Partial<SurfaceState>): SurfaceState => {
	const base = createInitialSurfaceState({ mode: "live", panelId: "panel-1" });
	return {
		...base,
		surfaceTiles: [
			{ id: "w-menu-1", x: 0, y: 0, width: 1, height: 1 },
			{ id: "preset-bounce", x: 1, y: 0, width: 1, height: 1 },
			{ id: "group-fx-pack", x: 2, y: 0, width: 1, height: 1 },
			{ id: "orphan-tile", x: 0, y: 1, width: 1, height: 1 },
		],
		widgetInstanceTypes: { "w-menu-1": "menu" },
		presets: [bouncePreset],
		groupCatalogEntries: [fxGroup],
		selectedSurfaceIndices: [],
		...overrides,
	};
};

// Same renderer `panel/Main.tsx` injects via `GridCatalogTileBodyProvider`.
const renderCatalogTile = (props: CatalogTileBodyProps): JSX.Element => (
	<GridCatalogTile preset={props.preset} label={props.label} />
);

const frameStyle = css({
	height: "15rem",
	width: "22rem",
	display: "flex",
	flexDirection: "column",
	backgroundColor: "surface.panel",
});

const renderGrid =
	(state: SurfaceState): (() => JSX.Element) =>
	() => (
		<div className={frameStyle}>
			<PanelStateProvider state={state}>
				<SelectionProvider
					selectedSurfaceIndices={state.selectedSurfaceIndices}
				>
					<GridCatalogTileBodyProvider render={renderCatalogTile}>
						<Grid />
					</GridCatalogTileBodyProvider>
				</SelectionProvider>
			</PanelStateProvider>
		</div>
	);

const meta = {
	title: "Workspace/Surface/Grid",
	parameters: { layout: "fullscreen" },
	decorators: [WithSeenTutorials],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Mixed placement: one bound widget tile (`data-workspace-widget-tile`),
 * one preset tile, one group tile, and one orphan id that no catalog
 * resolves (renders through the catalog-tile body fallback path).
 */
export const MixedTiles: Story = {
	render: renderGrid(buildState()),
	play: async ({ canvasElement }) => {
		const grid = canvasElement.querySelector("[data-workspace-grid]");
		expect(grid).not.toBeNull();
		expect(
			canvasElement.querySelectorAll("[data-workspace-surface-index]"),
		).toHaveLength(4);
		expect(
			canvasElement.querySelectorAll("[data-workspace-widget-tile]"),
		).toHaveLength(1);
		// `Grid` marks every non-widget, non-group cell with the preset-tile
		// attribute — that includes the orphan row, which no catalog resolves.
		expect(
			canvasElement.querySelectorAll("[data-workspace-preset-tile]"),
		).toHaveLength(2);
		expect(
			canvasElement.querySelectorAll("[data-workspace-group-tile]"),
		).toHaveLength(1);
		// Issue #751: the orphan row renders the missing-preset "?" — its
		// font must stay at the raised legibility floor (12px) inside the
		// 48px cell instead of collapsing to an 8px speck.
		const orphan = canvasElement.querySelector<HTMLElement>(
			"[data-workspace-surface-index='3']",
		);
		const mark = orphan?.querySelector<HTMLElement>(
			".ws-preset-icon--text > span",
		);
		if (!mark) throw new Error("missing-preset glyph mark not found");
		expect(
			Number.parseFloat(getComputedStyle(mark).fontSize),
		).toBeGreaterThanOrEqual(10);
	},
};

/** Grid multi-selection — accent ring on the chosen placement cells. */
export const SelectedTiles: Story = {
	render: renderGrid(buildState({ selectedSurfaceIndices: [1, 3] })),
	play: async ({ canvasElement }) => {
		const selected = canvasElement.querySelectorAll(
			"[data-workspace-surface-index='1'], [data-workspace-surface-index='3']",
		);
		expect(selected).toHaveLength(2);
	},
};

/** Empty workspace — scroll surface renders with no placement cells. */
export const EmptyGrid: Story = {
	render: renderGrid(buildState({ surfaceTiles: [], widgetInstanceTypes: {} })),
	play: async ({ canvasElement }) => {
		expect(canvasElement.querySelector("[data-workspace-grid]")).not.toBeNull();
		expect(
			canvasElement.querySelectorAll("[data-workspace-surface-index]"),
		).toHaveLength(0);
	},
};
