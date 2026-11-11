/**
 * Pure helper for releasing a workspace group (dissolve the group row and
 * re-surface its members as individual preset tiles on the grid).
 *
 * The handler that invokes this helper lives inside `useWorkspaceRuntime`'s
 * `handleUnifiedCtxSelect` switch (`case CTX_MENU_IDS.releaseGroupPreset:`),
 * and also inside the workspace drag-handler wiring for Direction C
 * (group tile → workspace background). Both call sites use this module so
 * the dissolve semantics stay in one place.
 *
 * Sequence:
 * 1. Resolve the group's member preset ids from `state.groupCatalogEntries`.
 * 2. Remove the group entry from `groups.json` (`removeGroupEntry`).
 * 3. `notifyPanelsAfterPresetSave` with the member ids so the receiving
 *    panel places the **first** member at `dropPlacement` (the group's
 *    own tile rect) and auto-packs the rest in source-panel order.
 *
 * Issue #86.
 */

import { findGroupEntry } from "@/management/preset/group/catalog-helpers";
import { removeGroupEntry } from "@/management/preset/group-catalog";
import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";
import type { SurfaceState } from "@/management/workspace/state";

export type ReleaseGroupDropPlacement = {
	x: number;
	y: number;
	width?: number;
	height?: number;
};

export type ReleaseGroupPresetDeps = {
	window: Window;
	panelId: string;
	removeGroupEntryFn?: (win: Window, groupId: string) => Promise<void>;
	notifyPanelsAfterPresetSaveFn?: (
		win: Window,
		input: {
			sourceSurfaceId: string;
			catalogRefIds: readonly string[];
			dropPlacement?: ReleaseGroupDropPlacement;
		},
	) => Promise<void>;
};

export type ReleaseGroupPresetInput = {
	state: Pick<SurfaceState, "groupCatalogEntries">;
	groupId: string;
	dropPlacement?: ReleaseGroupDropPlacement;
};

/**
 * Dissolve a workspace group.
 *
 * Returns the list of member preset ids that were broadcasted to the
 * workspace (the value passed as `catalogRefIds` to
 * `notifyPanelsAfterPresetSave`). An empty array means the group was
 * empty or already gone; in that case only the disk write happened.
 */
export const releaseGroupPreset = async (
	deps: ReleaseGroupPresetDeps,
	input: ReleaseGroupPresetInput,
): Promise<readonly string[]> => {
	const groupId = input.groupId.trim();
	if (!groupId) return [];

	const group = findGroupEntry(input.state.groupCatalogEntries, groupId);
	const memberIds: string[] = [];
	const seen = new Set<string>();
	if (group) {
		for (const raw of group.presetIds) {
			const id = raw.trim();
			if (!id || seen.has(id)) continue;
			seen.add(id);
			memberIds.push(id);
		}
	}

	const removeEntryFn = deps.removeGroupEntryFn ?? removeGroupEntry;
	await removeEntryFn(deps.window, groupId);

	if (memberIds.length === 0) return [];

	const notifyFn =
		deps.notifyPanelsAfterPresetSaveFn ?? notifyPanelsAfterPresetSave;
	await notifyFn(deps.window, {
		sourceSurfaceId: deps.panelId,
		catalogRefIds: memberIds,
		dropPlacement: input.dropPlacement,
	});

	return memberIds;
};

/**
 * Resolve the group's tile rect from `state.surfaceTiles` so callers can
 * pass it as `dropPlacement` to {@link releaseGroupPreset}.
 *
 * Returns `undefined` when the group has no surface tile (e.g. the tile
 * was never placed, or the state was constructed without one). Returning
 * `undefined` is safe: the receiving panel auto-packs the members.
 */
export const releaseDropPlacementFromState = (
	state: Pick<SurfaceState, "surfaceTiles" | "groupCatalogEntries">,
	groupId: string,
): ReleaseGroupDropPlacement | undefined => {
	const trimmed = groupId.trim();
	if (!trimmed) return undefined;
	if (!findGroupEntry(state.groupCatalogEntries, trimmed)) return undefined;
	const tile = state.surfaceTiles.find((t) => t && t.id?.trim() === trimmed);
	if (!tile) return undefined;
	return {
		x: tile.x,
		y: tile.y,
		width: tile.width,
		height: tile.height,
	};
};
