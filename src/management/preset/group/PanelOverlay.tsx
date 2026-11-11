import { type JSX, useMemo } from "react";
import { findGroupEntry } from "@/management/preset/group/catalog-helpers";
import { GroupPanel } from "@/management/preset/group/Panel";
import { computeGroupPanelFrame } from "@/management/preset/group/panel-layout";
import { computeGridTracks } from "@/management/workspace/layout/engine";
import { deriveCells } from "@/management/workspace/placement";
import { usePanelState } from "@/management/workspace/state/PanelContext";

export function GroupPanelOverlay({
	panelRoot,
	onRunPreset,
}: {
	panelRoot: HTMLElement | null;
	onRunPreset?: (preset: import("../contract").Preset) => void;
}): JSX.Element | null {
	const state = usePanelState();
	const openedId = state.openedGroupPresetId?.trim() ?? "";

	const group = useMemo(
		() =>
			openedId ? findGroupEntry(state.groupCatalogEntries, openedId) : null,
		[state.groupCatalogEntries, openedId],
	);
	const groupTile = useMemo(
		() =>
			openedId
				? state.surfaceTiles.find((t) => t.id.trim() === openedId)
				: undefined,
		[state.surfaceTiles, openedId],
	);

	const cells = useMemo(() => deriveCells(state), [state]);
	const { cols, rows } = useMemo(
		() =>
			computeGridTracks(
				cells.map((c) => ({
					x: c.x,
					y: c.y,
					width: c.width,
					height: c.height,
				})),
			),
		[cells],
	);

	const frame = useMemo(() => {
		if (!group || !groupTile) return null;
		return computeGroupPanelFrame(groupTile, state.grid, cols, rows);
	}, [cols, group, groupTile, rows, state.grid]);

	const memberPresets = useMemo(() => {
		if (!group) return [];
		return group.presetIds.map((id) => {
			const preset = state.presets.find((p) => p.id === id);
			return { id, label: preset?.title?.trim() || id };
		});
	}, [group, state.presets]);

	const presetsById = useMemo(
		() => new Map(state.presets.map((p) => [p.id, p] as const)),
		[state.presets],
	);

	if (!openedId || !group || !groupTile || !frame) return null;

	return (
		<GroupPanel
			groupId={group.id}
			groupName={group.title?.trim() ?? group.id}
			memberPresets={memberPresets}
			presetsById={presetsById}
			frame={frame}
			layoutLocked={state.layoutLocked}
			panelRoot={panelRoot}
			grid={state.grid}
			onRunPreset={onRunPreset}
			panelId={state.panelId}
		/>
	);
}
