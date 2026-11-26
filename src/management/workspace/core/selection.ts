import type { SurfaceState } from "@/management/workspace/core/state";
import { catalogRef, isWidget } from "@/management/workspace/placement/resolve";

const syncListPresetSelection = (
	state: SurfaceState,
	surfaceIndexStrings: readonly string[],
): SurfaceState => {
	const presetOnly = surfaceIndexStrings.filter((pid) => !isWidget(state, pid));
	const refs = presetOnly
		.map((pid) => catalogRef(state, pid))
		.filter((r): r is string => Boolean(r?.trim()));
	return {
		...state,
		presetSelectedIds: refs,
		presetFocusId: refs.length > 0 ? (refs.at(-1) ?? null) : null,
	};
};

export const togglePlacement = (
	state: SurfaceState,
	surfaceIndexStr: string,
): SurfaceState => {
	const id = surfaceIndexStr.trim();
	if (!id) return state;
	const cur = state.selectedSurfaceIndices.map(String);
	const i = cur.indexOf(id);
	const nextStrs = i >= 0 ? cur.filter((_, j) => j !== i) : [...cur, id];
	return syncListPresetSelection(
		{
			...state,
			selectedSurfaceIndices: nextStrs.map((s) => Number.parseInt(s, 10)),
		},
		nextStrs,
	);
};

export const addPlacement = (
	state: SurfaceState,
	surfaceIndexStr: string,
): SurfaceState => {
	const id = surfaceIndexStr.trim();
	if (!id) return state;
	const cur = state.selectedSurfaceIndices.map(String);
	if (cur.includes(id)) return state;
	const nextStrs = [...cur, id];
	return syncListPresetSelection(
		{
			...state,
			selectedSurfaceIndices: nextStrs.map((s) => Number.parseInt(s, 10)),
		},
		nextStrs,
	);
};

const clearPlacement = (state: SurfaceState): SurfaceState => ({
	...state,
	selectedSurfaceIndices: [],
	presetSelectedIds: [],
	presetFocusId: null,
});

export const clearAll = (state: SurfaceState): SurfaceState =>
	clearPlacement(state);

/**
 * Issue #701: drop preset refs (`presetHoverId` / `presetSelectedIds` /
 * `presetFocusId`) that no longer resolve against the catalog
 * (`presets` ∪ `groupCatalogEntries`).
 *
 * Apply only at catalog-authoritative commits (preset/group snapshot
 * refresh, initial load, layout restore) — never inside the generic
 * `commit`, because flows like Duplicate legitimately select an id before
 * `state.presets` catches up. Returns the same reference when nothing is
 * stale so callers can wrap unconditionally.
 */
export const pruneStalePresetRefs = (state: SurfaceState): SurfaceState => {
	const known = new Set<string>();
	for (const preset of state.presets) {
		const id = preset.id.trim();
		if (id) known.add(id);
	}
	for (const group of state.groupCatalogEntries) {
		const id = group.id.trim();
		if (id) known.add(id);
	}
	const keepNullable = (id: string | null): string | null =>
		id !== null && known.has(id.trim()) ? id : null;
	const nextHoverId = keepNullable(state.presetHoverId);
	const nextFocusId = keepNullable(state.presetFocusId);
	const nextSelectedIds = state.presetSelectedIds.filter((id) =>
		known.has(id.trim()),
	);
	if (
		nextHoverId === state.presetHoverId &&
		nextFocusId === state.presetFocusId &&
		nextSelectedIds.length === state.presetSelectedIds.length
	) {
		return state;
	}
	return {
		...state,
		presetHoverId: nextHoverId,
		presetFocusId: nextFocusId,
		presetSelectedIds: nextSelectedIds,
	};
};
