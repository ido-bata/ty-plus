/**
 * Workspace placement grid: geometry, shells, and per-cell pre-computation.
 * Catalog tile chrome is injected via `GridCatalogTileBodyProvider` (see `panel`).
 *
 * Per-cell rendering is delegated to `GridTile` so its memo comparator can skip
 * cells whose derived data didn't change when the parent `state` ref churns.
 */

import type { CSSProperties, JSX } from "react";
import { useEffect, useMemo } from "react";
import type { WidgetType } from "@/function/widget";
import { useWidgetRuntime } from "@/function/widget/runtime-context";
import { logCatalogTileDisplay } from "@/management/catalog-tile-display-log";
import { i18n } from "@/management/i18n/index";
import type { Preset } from "@/management/preset/contract";
import { shouldHideGroupedMemberSurfaceTile } from "@/management/preset/group/surface-visibility";
import { registry } from "@/management/widget/registry";
import { toStyle } from "@/management/workspace/background/style";
import {
	computeGridTracks,
	getTileRect,
	tracksToPixels,
} from "@/management/workspace/layout/engine";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { deriveCells as derivePlacementCells } from "@/management/workspace/placement";
import {
	presetRecordForCatalogRef,
	tileIdResolvesAsWidget,
	widgetLayoutFromNumber,
} from "@/management/workspace/placement/resolve";
import {
	ATTR_GRID,
	ATTR_GROUP_TILE,
	ATTR_PLACEMENT_INDEX,
	ATTR_PRESET_TILE,
	ATTR_SCROLL,
	ATTR_WIDGET_INSTANCE_ID,
	ATTR_WIDGET_TILE,
} from "@/management/workspace/placement/types";
import type { SurfaceState } from "@/management/workspace/state";
import {
	usePanelState,
	useSelectedSurfaceIndices,
} from "@/management/workspace/state/PanelContext";
import {
	GridTile,
	type GridTileProps,
} from "@/management/workspace/surface/GridTile";
import { useGridCatalogTileBody } from "@/management/workspace/surface/grid-catalog-tile-context";
import { logWorkspaceGrid } from "@/management/workspace/surface/grid-log";
import {
	classifyFromCatalogs,
	type Role,
} from "@/management/workspace/surface/tiles";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

const scrollRootClass = css({
	position: "relative",
	height: "full",
	width: "full",
	minHeight: "0",
	minWidth: "0",
	touchAction: "none",
	overflow: "auto",
});

const gridRootClass = css({
	position: "relative",
	touchAction: "none",
});

function buildCatalogTileEmitSummary(state: SurfaceState): {
	catalogCellCount: number;
	presetRoleRowMissing: number;
	groupTiles: number;
	presetTiles: number;
	unknownTiles: number;
	sample: Array<{
		index: number;
		role: string;
		catalogRef?: string;
		resolvedPresetId?: string;
		iconType: string;
	}>;
} {
	let catalogCellCount = 0;
	let presetRoleRowMissing = 0;
	let groupTiles = 0;
	let presetTiles = 0;
	let unknownTiles = 0;
	const sample: Array<{
		index: number;
		role: string;
		catalogRef?: string;
		resolvedPresetId?: string;
		iconType: string;
	}> = [];

	for (let idx = 0; idx < state.surfaceTiles.length; idx++) {
		const tile = state.surfaceTiles[idx];
		if (tileIdResolvesAsWidget(state, tile.id)) continue;
		const tileRole = classifyFromCatalogs(state, tile.id);
		catalogCellCount++;
		if (tileRole === "group") groupTiles++;
		else if (tileRole === "preset") presetTiles++;
		else unknownTiles++;

		const catalogRef =
			tileRole === "preset" || tileRole === "group" ? tile.id : undefined;
		const preset = catalogRef
			? presetRecordForCatalogRef(state, catalogRef)
			: undefined;
		const tilePreset = preset;
		if (tileRole === "preset" && !preset) presetRoleRowMissing++;

		if (sample.length < 8) {
			const icon = tilePreset?.icon;
			const iconType =
				icon && typeof icon === "object" && "type" in icon
					? String((icon as { type: string }).type)
					: tilePreset
						? "(no icon field)"
						: "(no preset row)";
			sample.push({
				index: idx,
				role: tileRole,
				catalogRef,
				resolvedPresetId: tilePreset?.id,
				iconType,
			});
		}
	}

	return {
		catalogCellCount,
		presetRoleRowMissing,
		groupTiles,
		presetTiles,
		unknownTiles,
		sample,
	};
}

export function Grid(): JSX.Element {
	const state = usePanelState();
	const selectedSurfaceIndices = useSelectedSurfaceIndices();
	const { setActiveWidgetInstanceId } = useWidgetRuntime();
	const renderCatalogTile = useGridCatalogTileBody();
	const cells = useMemo(() => derivePlacementCells(state), [state]);
	const { cols, rows } = useMemo(
		() =>
			computeGridTracks(
				cells.map((i) => ({
					x: i.x,
					y: i.y,
					width: i.width,
					height: i.height,
				})),
			),
		[cells],
	);
	const g = state.grid;
	const width = tracksToPixels(cols, g);
	const height = tracksToPixels(rows, g);

	useEffect(() => {
		if (process.env.NODE_ENV === "production") return;
		logWorkspaceGrid("grid:metrics", {
			panelId: state.panelId,
			cellCount: cells.length,
			surfaceTileCount: state.surfaceTiles.length,
			scrollContentPx: { width, height },
		});
	}, [cells.length, height, state.panelId, state.surfaceTiles.length, width]);

	const catalogTileEmitSummary = useMemo(
		() => buildCatalogTileEmitSummary(state),
		[state],
	);

	useEffect(() => {
		if (process.env.NODE_ENV === "production") return;
		logCatalogTileDisplay(
			"emit",
			"workspace.catalog-tile-inputs",
			catalogTileEmitSummary,
		);
	}, [catalogTileEmitSummary]);

	const scrollStyle: CSSProperties = {
		width,
		height,
		minWidth: width,
		minHeight: height,
		position: "relative",
	};
	const backgroundStyle = useMemo(() => toStyle(state.bg), [state.bg]);
	const scrollBackgroundStyle: CSSProperties = {
		...backgroundStyle,
	};

	useEffect(() => {
		if (process.env.NODE_ENV === "production") return;
		console.info("[WorkspaceBackground] render:style", {
			panelId: state.panelId,
			background: state.bg,
			style: backgroundStyle,
		});
	}, [backgroundStyle, state.bg, state.panelId]);

	const tileEntries = useMemo(() => {
		const out: Array<GridTileProps | null> = [];
		const selectedIdxSet = new Set(selectedSurfaceIndices);
		for (const cell of cells) {
			const surfaceIndexStr = cell.id;
			const idx = Number.parseInt(surfaceIndexStr, 10);
			const tile = Number.isFinite(idx) ? state.surfaceTiles[idx] : undefined;
			if (tile && shouldHideGroupedMemberSurfaceTile(state, tile.id)) {
				out.push(null);
				continue;
			}

			const tileRole: Role = !tile
				? "unknown"
				: tileIdResolvesAsWidget(state, tile.id)
					? "widget"
					: classifyFromCatalogs(state, tile.id);
			const isWidget = tileRole === "widget";
			const widgetRow = isWidget
				? widgetLayoutFromNumber(state, idx)
				: undefined;
			const catalogRef =
				tileRole === "preset" || tileRole === "group" ? tile?.id : undefined;
			const preset = catalogRef
				? presetRecordForCatalogRef(state, catalogRef)
				: undefined;
			const widgetType = widgetRow?.widgetType;
			const typeCfg = widgetType
				? registry.getConfig(widgetType as WidgetType)
				: undefined;
			const label: string = isWidget
				? typeCfg?.name
					? i18n.t(typeCfg.name.replace(/^widgets\./, ""), {
							defaultValue: typeCfg.name,
						})
					: (widgetType ?? "widget")
				: preset?.title?.trim()
					? preset.title.trim()
					: tile?.id
						? tile.id.length > 28
							? `${tile.id.slice(0, 14)}…`
							: tile.id
						: "Preset";
			const isGroup = tileRole === "group";
			const placementSelected = Number.isFinite(idx) && selectedIdxSet.has(idx);

			const gridBox = {
				x: cell.x,
				y: cell.y,
				width: cell.width,
				height: cell.height,
			} satisfies Pick<Layout, "x" | "y" | "width" | "height">;
			const rect = getTileRect(gridBox as unknown as Layout, g);
			const placementStyle: CSSProperties = {
				position: "absolute",
				left: rect.left,
				top: rect.top,
				width: rect.width,
				height: rect.height,
			};

			const shellAttrs: Record<string, string> = {
				[ATTR_PLACEMENT_INDEX]: surfaceIndexStr,
			};
			if (isWidget) {
				shellAttrs[ATTR_WIDGET_TILE] = "";
				if (widgetRow?.id) {
					shellAttrs[ATTR_WIDGET_INSTANCE_ID] = widgetRow.id;
				}
			} else {
				shellAttrs[isGroup ? ATTR_GROUP_TILE : ATTR_PRESET_TILE] = "";
			}

			out.push({
				key: Number.isFinite(idx) ? idx : surfaceIndexStr,
				state,
				grid: g,
				tile,
				widgetRow,
				preset: preset as Preset | undefined,
				label,
				placementStyle,
				shellAttrs,
				placementSelected,
				isWidget,
				renderCatalogTile,
			});
		}
		return out;
	}, [cells, state, g, renderCatalogTile, selectedSurfaceIndices]);

	return (
		<div
			{...{ [ATTR_SCROLL]: "" }}
			onFocusCapture={(event) => {
				const target = event.target as Element | null;
				const widget = target?.closest(`[${ATTR_WIDGET_INSTANCE_ID}]`);
				setActiveWidgetInstanceId(
					widget?.getAttribute(ATTR_WIDGET_INSTANCE_ID)?.trim() || null,
				);
			}}
			onPointerDownCapture={(event) => {
				const target = event.target as Element | null;
				const widget = target?.closest(`[${ATTR_WIDGET_INSTANCE_ID}]`);
				setActiveWidgetInstanceId(
					widget?.getAttribute(ATTR_WIDGET_INSTANCE_ID)?.trim() || null,
				);
			}}
			className={cx("ws-scroll-exclude", scrollRootClass)}
			style={scrollBackgroundStyle}
		>
			<div
				{...{ [ATTR_GRID]: "" }}
				className={gridRootClass}
				style={scrollStyle}
			>
				{tileEntries.map((entry) => {
					if (!entry) return null;
					const { key, ...rest } = entry;
					return <GridTile key={key} {...rest} />;
				})}
			</div>
		</div>
	);
}
