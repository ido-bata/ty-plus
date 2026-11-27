import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import { GridCatalogTile } from "@/management/preset/workspace/GridCatalogTile";
import type { WidgetType } from "@/management/widget/contract";
import {
	createInitialSurfaceState,
	type SurfaceState,
} from "@/management/workspace/core/state";
import type { Layout } from "@/management/workspace/layout/grid-document";
import type { CatalogTileBodyProps } from "@/management/workspace/surface/grid-catalog-tile-context";
import { css } from "@/styled-system/css";

import { GridTile } from "./GridTile";

/**
 * Workspace placement cell (Issue #610): `GridTile` is the per-cell
 * renderer `Grid` mounts for every surface tile — `WorkspaceTileFrame`
 * chrome plus either a widget body or the injected catalog-tile renderer.
 * These stories cover the preset path, the missing-widget fallback, and the
 * live widget path: `widgetRow` feeds `Widget → renderDescriptor`, which
 * resolves the real descriptor through the widget registry — the same seam
 * production `Grid` uses, so no PanelContext/descriptor mock is required.
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

const makeLayout = (id: string, widgetType: WidgetType): Layout => ({
	id,
	widgetId: id,
	widgetType,
	x: 0,
	y: 0,
	width: 1,
	height: 1,
});

type Args = {
	isWidget: boolean;
	selected: boolean;
	widgetType: WidgetType;
	/** When true the widget slot has no layout row — the config-load-error card. */
	missingRow: boolean;
};

const baseArgs: Args = {
	isWidget: false,
	selected: false,
	widgetType: "menu",
	missingRow: false,
};

const meta = {
	title: "Workspace/Surface/GridTile",
	args: baseArgs,
	argTypes: {
		isWidget: { control: "boolean" },
		selected: { control: "boolean" },
		widgetType: {
			control: { type: "select" },
			options: ["menu", "align", "easing", "quick-actions"],
		},
		missingRow: { control: "boolean" },
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
			tile={{
				id: args.isWidget ? "widget-story" : "preset-story",
				x: 0,
				y: 0,
				width: 1,
				height: 1,
			}}
			widgetRow={
				args.isWidget && !args.missingRow
					? makeLayout(`w-${args.widgetType}-1`, args.widgetType)
					: undefined
			}
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
	args: { isWidget: true, missingRow: true },
};

/** Menu widget tile — real descriptor resolved through the registry and
 *  rendered inside the tile frame + tutorial layer. */
export const MenuWidgetTile: Story = {
	args: { isWidget: true, widgetType: "menu" },
	play: async ({ canvasElement }) => {
		expect(
			canvasElement.querySelector(
				"[data-ws-action='open-widget-menu-context']",
			),
		).not.toBeNull();
	},
};

/** Align widget tile — 1x1 cell hosting the larger widget body. */
export const AlignWidgetTile: Story = {
	args: { isWidget: true, widgetType: "align" },
	play: async ({ canvasElement }) => {
		expect(
			canvasElement.querySelector("[data-ws-action='align-target-selection']"),
		).not.toBeNull();
	},
};

/** Widget tile with the placement selected — accent selection ring over
 *  the live widget body. */
export const WidgetTileSelected: Story = {
	args: { isWidget: true, widgetType: "menu", selected: true },
};

/**
 * Issue #719 — interaction state: clicking the menu widget's trigger opens
 * the context menu. The panel is portaled to `document.body`, so the
 * assertion queries the owner document rather than `canvasElement`.
 */
export const MenuWidgetTileMenuOpen: Story = {
	args: { isWidget: true, widgetType: "menu" },
	play: async ({ canvasElement }) => {
		const trigger = canvasElement.querySelector<HTMLButtonElement>(
			"[data-ws-action='open-widget-menu-context']",
		);
		if (!trigger) throw new Error("menu widget trigger not found");
		const { userEvent } = await import("vitest/browser");
		await userEvent.click(trigger);
		await expect(trigger.getAttribute("aria-expanded")).toBe("true");
		await expect(
			canvasElement.ownerDocument.querySelector('[role="menu"]'),
		).not.toBeNull();
	},
};

/**
 * Issue #719 — hover state on the widget tile trigger button.
 */
export const MenuWidgetTileHovered: Story = {
	args: { isWidget: true, widgetType: "menu" },
	play: async ({ canvasElement }) => {
		const trigger = canvasElement.querySelector<HTMLButtonElement>(
			"[data-ws-action='open-widget-menu-context']",
		);
		if (!trigger) throw new Error("menu widget trigger not found");
		const { userEvent } = await import("vitest/browser");
		await userEvent.hover(trigger);
		await expect(trigger.matches(":hover")).toBe(true);
	},
};

/** Selected placement — accent selection ring. */
export const Selected: Story = {
	args: { selected: true },
};
