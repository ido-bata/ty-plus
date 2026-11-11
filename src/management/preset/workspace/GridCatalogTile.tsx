import { type JSX, useEffect } from "react";
import { logCatalogTileDisplay } from "@/management/catalog-tile-display-log";
import type { Preset } from "@/management/preset/contract";
import { Tile } from "@/management/preset/workspace/Tile";

export const PRESET_HOVER_EVENT = "typlus:workspace-preset-hover";

export type WorkspacePresetHoverDetail = {
	presetId: string | null;
};

/** Preset-layer catalog chrome for workspace grid cells (icons, etc.). */
export function GridCatalogTile(props: {
	preset: Preset | undefined;
	label: string;
}): JSX.Element {
	useEffect(() => {
		logCatalogTileDisplay("receive", "preset-grid-catalog-tile", {
			label: props.label,
			presetId: props.preset?.id,
			presetType: props.preset?.type,
			hasIconField: props.preset?.icon !== undefined,
		});
	}, [props.label, props.preset?.icon, props.preset?.id, props.preset?.type]);

	return (
		<Tile
			preset={props.preset}
			label={props.label}
			onHoverChange={(presetId) => {
				window.dispatchEvent(
					new CustomEvent<WorkspacePresetHoverDetail>(PRESET_HOVER_EVENT, {
						detail: { presetId },
					}),
				);
			}}
		/>
	);
}
