import { catalogRef, isWidget } from "@/management/workspace/placement/resolve";
import type { SurfaceState } from "@/management/workspace/state";

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
