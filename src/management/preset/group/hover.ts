import {
	PRESET_HOVER_EVENT,
	type WorkspacePresetHoverDetail,
} from "@/management/preset/workspace/GridCatalogTile";

/** Same bus as workspace grid tiles; info widget listens via `hook` → `presetHoverId`. */
export function dispatchWorkspacePresetHover(presetId: string | null): void {
	window.dispatchEvent(
		new CustomEvent<WorkspacePresetHoverDetail>(PRESET_HOVER_EVENT, {
			detail: { presetId },
		}),
	);
}
