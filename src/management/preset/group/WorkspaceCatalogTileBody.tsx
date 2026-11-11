import { type JSX, memo } from "react";
import { GroupContainerCatalogTile } from "@/management/preset/group/ContainerCatalogTile";
import { findGroupEntry } from "@/management/preset/group/catalog-helpers";
import { synthesizeGroupPresetForTile } from "@/management/preset/group/synthesize";
import { GridCatalogTile } from "@/management/preset/workspace/GridCatalogTile";
import { presetRecordForCatalogRef } from "@/management/workspace/placement/resolve";
import { usePanelState } from "@/management/workspace/state/PanelContext";
import type { CatalogTileBodyProps } from "@/management/workspace/surface/grid-catalog-tile-context";
import { classifyFromCatalogs } from "@/management/workspace/surface/tiles";

/**
 * Preset/group-owned catalog chrome for workspace grid cells.
 * Workspace `Grid` only injects this renderer; it does not branch on groups.
 */
export const WorkspaceCatalogTileBody = memo(
	function WorkspaceCatalogTileBodyImpl(
		props: CatalogTileBodyProps,
	): JSX.Element {
		const state = usePanelState();
		const tileId = props.tileId.trim();
		const ctx = {
			widgetInstanceTypes: state.widgetInstanceTypes,
			groupCatalogEntries: state.groupCatalogEntries,
			presets: state.presets,
		};
		const role = classifyFromCatalogs(ctx, tileId);
		const groupEntry =
			role === "group"
				? findGroupEntry(state.groupCatalogEntries, tileId)
				: undefined;

		if (groupEntry) {
			const preset = synthesizeGroupPresetForTile(groupEntry);
			const label = groupEntry.title?.trim() || props.label || tileId;
			return <GroupContainerCatalogTile preset={preset} label={label} />;
		}

		const preset =
			props.preset ?? presetRecordForCatalogRef(state, tileId) ?? undefined;
		const label =
			props.label.trim() ||
			preset?.title?.trim() ||
			(tileId.length > 28 ? `${tileId.slice(0, 14)}…` : tileId) ||
			"Preset";

		return <GridCatalogTile preset={preset} label={label} />;
	},
);
