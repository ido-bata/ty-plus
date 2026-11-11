/**
 * Per-cell renderer for the workspace placement grid.
 *
 * Receives pre-computed per-cell data so its memo comparator can detect
 * "this tile's data is unchanged" even when the parent `state` ref churns.
 * All heavy derivations (role, preset lookup, rect, attrs) happen in the
 * parent `Grid` inside a single `useMemo`; this module only renders.
 */

import type { CSSProperties, JSX } from "react";
import { memo } from "react";
import type { Preset } from "@/management/preset/contract";
import { Widget } from "@/management/widget/workspace/TileContent";
import type {
	GridSettings,
	Layout,
} from "@/management/workspace/layout/grid-document";
import type { SurfaceState, Tile } from "@/management/workspace/state";
import type { CatalogTileBodyRenderer } from "@/management/workspace/surface/grid-catalog-tile-context";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type GridTileProps = {
	/** Stable for the lifetime of a placement slot; used as React key. */
	readonly key: string | number;
	state: SurfaceState;
	grid: GridSettings;
	tile: Tile | undefined;
	widgetRow: Layout | undefined;
	preset: Preset | undefined;
	label: string;
	placementStyle: CSSProperties;
	shellAttrs: Record<string, string>;
	placementSelected: boolean;
	isWidget: boolean;
	renderCatalogTile: CatalogTileBodyRenderer;
};

type WorkspacePlacementTileProps = {
	/** Absolute box for this placement cell (`left` / `top` / `width` / `height`). */
	placementStyle: CSSProperties;
	/** `ATTR_*` shell attributes for hit-testing / host integration. */
	shellAttrs: Record<string, string>;
	/**
	 * Whether this **surface placement** is selected (`selectedSurfaceIndices`).
	 * Intra-widget focus (tabs, inputs) does not flip this flag.
	 */
	selected: boolean;
	children: import("react").ReactNode;
};

const tileShell = css({
	position: "absolute",
	boxSizing: "border-box",
	minHeight: "0",
	minWidth: "0",
	userSelect: "none",
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
	color: "text.primary",
});

const tileInner = css({
	position: "absolute",
	inset: "0",
	zIndex: "0",
	minHeight: "0",
	minWidth: "0",
	overflow: "hidden",
	borderRadius: "shell-sm",
});

const tileFrameSelected = css({
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "var(--color-ty-ws-gridcell-ring-border-selected)",
});

const tileFrameDefault = css({
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "var(--color-ty-ws-gridcell-ring-border)",
});

const tileFrameOverlay = css({
	pointerEvents: "none",
	position: "absolute",
	inset: "0",
	zIndex: "1",
	boxSizing: "border-box",
	borderRadius: "shell-sm",
	borderStyle: "solid",
	transitionProperty: "border-color",
	transitionDuration: "100ms",
	transitionTimingFunction: "ease-out",
});

const widgetMissingCard = css({
	display: "flex",
	height: "full",
	minHeight: "0",
	width: "full",
	minWidth: "0",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	gap: "0.5",
	paddingInline: "1",
	textAlign: "center",
	fontSize: "text-2xs",
	color: "text.muted",
});

const widgetMissingTitle = css({
	fontWeight: "medium",
	color: "text.primary",
});

const widgetMissingBody = css({
	lineClamp: 2,
	overflow: "hidden",
	wordBreak: "break-all",
	opacity: "0.8",
});

function WorkspacePlacementTileImpl(
	props: WorkspacePlacementTileProps,
): JSX.Element {
	const { placementStyle, shellAttrs, selected, children } = props;
	const frameBorder = selected ? tileFrameSelected : tileFrameDefault;

	return (
		<div
			{...shellAttrs}
			className={tileShell}
			draggable={false}
			style={placementStyle}
		>
			<div className={tileInner}>{children}</div>
			<div aria-hidden className={cx(tileFrameOverlay, frameBorder)} />
		</div>
	);
}

function placementTilePropsEqual(
	prev: WorkspacePlacementTileProps,
	next: WorkspacePlacementTileProps,
): boolean {
	if (prev.selected !== next.selected) return false;
	const ps = prev.placementStyle;
	const ns = next.placementStyle;
	if (
		ps.left !== ns.left ||
		ps.top !== ns.top ||
		ps.width !== ns.width ||
		ps.height !== ns.height
	) {
		return false;
	}
	const pa = prev.shellAttrs;
	const na = next.shellAttrs;
	const paKeys = Object.keys(pa);
	const naKeys = Object.keys(na);
	if (paKeys.length !== naKeys.length) return false;
	for (const k of paKeys) {
		if (pa[k] !== na[k]) return false;
	}
	return prev.children === next.children;
}

const WorkspacePlacementTile = memo(
	WorkspacePlacementTileImpl,
	placementTilePropsEqual,
);

type TileBodyProps = {
	state: SurfaceState;
	grid: GridSettings;
	layout: Layout | undefined;
	isWidget: boolean;
	preset: Preset | undefined;
	label: string;
	tileId: string;
	renderCatalogTile: CatalogTileBodyRenderer;
};

function TileBodyImpl(props: TileBodyProps): JSX.Element {
	const {
		state,
		grid,
		layout,
		isWidget,
		preset,
		label,
		tileId,
		renderCatalogTile,
	} = props;
	if (isWidget) {
		if (layout) {
			return <Widget layout={layout} state={state} grid={grid} />;
		}
		return (
			<div className={widgetMissingCard} title={tileId}>
				<span className={widgetMissingTitle}>Widget</span>
				<span className={widgetMissingBody}>
					Configuration could not be loaded
				</span>
			</div>
		);
	}
	return <>{renderCatalogTile({ preset, label, tileId })}</>;
}

function tileBodyPropsEqual(prev: TileBodyProps, next: TileBodyProps): boolean {
	if (prev.isWidget !== next.isWidget) return false;
	if (prev.tileId !== next.tileId) return false;
	if (prev.label !== next.label) return false;
	if (prev.preset !== next.preset) return false;
	if (prev.renderCatalogTile !== next.renderCatalogTile) return false;
	if (prev.isWidget) {
		if (prev.layout !== next.layout) return false;
		if (prev.state !== next.state) return false;
		if (prev.grid !== next.grid) return false;
	}
	return true;
}

const TileBody = memo(TileBodyImpl, tileBodyPropsEqual);

function GridTileImpl(props: GridTileProps): JSX.Element {
	const {
		state,
		grid,
		tile,
		widgetRow,
		preset,
		label,
		placementStyle,
		shellAttrs,
		placementSelected,
		isWidget,
		renderCatalogTile,
	} = props;

	return (
		<WorkspacePlacementTile
			placementStyle={placementStyle}
			shellAttrs={shellAttrs}
			selected={placementSelected}
		>
			<TileBody
				state={state}
				grid={grid}
				layout={widgetRow}
				isWidget={isWidget}
				preset={preset}
				label={label}
				tileId={tile?.id ?? ""}
				renderCatalogTile={renderCatalogTile}
			/>
		</WorkspacePlacementTile>
	);
}

function gridTilePropsEqual(prev: GridTileProps, next: GridTileProps): boolean {
	if (prev.isWidget !== next.isWidget) return false;
	if (prev.tile !== next.tile) return false;
	if (prev.widgetRow !== next.widgetRow) return false;
	if (prev.preset !== next.preset) return false;
	if (prev.label !== next.label) return false;
	if (prev.placementSelected !== next.placementSelected) return false;
	if (prev.renderCatalogTile !== next.renderCatalogTile) return false;
	const ps = prev.placementStyle;
	const ns = next.placementStyle;
	if (
		ps.left !== ns.left ||
		ps.top !== ns.top ||
		ps.width !== ns.width ||
		ps.height !== ns.height
	) {
		return false;
	}
	const pa = prev.shellAttrs;
	const na = next.shellAttrs;
	const paKeys = Object.keys(pa);
	const naKeys = Object.keys(na);
	if (paKeys.length !== naKeys.length) return false;
	for (const k of paKeys) {
		if (pa[k] !== na[k]) return false;
	}
	if (prev.isWidget) {
		if (prev.state !== next.state) return false;
		if (prev.grid !== next.grid) return false;
	}
	return true;
}

export const GridTile = memo(GridTileImpl, gridTilePropsEqual);
