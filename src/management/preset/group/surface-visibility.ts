import { collectGroupedMemberPresetIds } from "@/management/preset/group/catalog-helpers";
import { tileIdResolvesAsWidget } from "@/management/workspace/placement/resolve";
import type { SurfaceState } from "@/management/workspace/state";
import { classifyFromCatalogs } from "@/management/workspace/surface/tiles";

const catalogCtxFromState = (state: SurfaceState) => ({
	widgetInstanceTypes: state.widgetInstanceTypes,
	groupCatalogEntries: state.groupCatalogEntries,
	presets: state.presets,
});

/** Group members are shown in the group panel, not as separate workspace tiles. */
export function shouldHideGroupedMemberSurfaceTile(
	state: SurfaceState,
	tileId: string,
): boolean {
	if (tileIdResolvesAsWidget(state, tileId)) return false;
	if (classifyFromCatalogs(catalogCtxFromState(state), tileId) === "group") {
		return false;
	}
	return collectGroupedMemberPresetIds(state.groupCatalogEntries).has(
		tileId.trim(),
	);
}
