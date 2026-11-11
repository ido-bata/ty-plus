/**
 * Remove preset / group tiles from a workspace panel layout after the catalog entry is deleted.
 *
 * When a preset is deleted from the catalog, we must also remove its tile from the
 * workspace layout file so the panel doesn't show a ghost entry referencing a missing preset.
 */

import { indexFromPanelId, readNJson, writeNJson } from "@/management/storage";
import type {
	LayoutItem,
	PersistedLayoutDocument,
} from "@/management/workspace/layout/grid-document";
import { parseLayoutDocument } from "@/management/workspace/layout/grid-document";
import { resolveWorkspacePersistenceManagedRoot } from "@/management/workspace/layout/persistence-root";

export type RemovePresetFromDialogDiskInput = {
	targetPanelId: string;
	catalogRefIds: readonly string[];
};

/**
 * @returns true when the layout was modified and the panel should reload.
 */
export async function tryPersistRemovePresetFromDialog(
	win: Window,
	input: RemovePresetFromDialogDiskInput,
): Promise<boolean> {
	const root = (await resolveWorkspacePersistenceManagedRoot(win))?.trim();
	if (!root) {
		return false;
	}
	const ids = input.catalogRefIds.flatMap((s) => {
		const trimmed = s.trim();
		return trimmed ? [trimmed] : [];
	});
	if (ids.length === 0) {
		return false;
	}
	const targetPanelId = input.targetPanelId.trim() || "panel-1";
	const targetIndex = indexFromPanelId(targetPanelId);

	try {
		const rawLayout = await readNJson(win, targetIndex);
		if (!rawLayout?.trim()) {
			return false;
		}

		const layout = parseLayoutDocument(
			JSON.parse(rawLayout),
		) as PersistedLayoutDocument;
		const idSet = new Set(ids);

		// Filter out tiles whose id matches a deleted preset/group
		const nextGridCells: LayoutItem[] = layout.gridCells.filter(
			(cell) => !idSet.has(cell.id.trim()),
		);

		// Also filter presetLayoutRoster entries
		const nextRoster =
			layout.presetLayoutRoster?.filter(
				(entry) => !idSet.has(entry.presetRefId.trim()),
			) ?? [];

		// Check if anything actually changed
		const didChange =
			nextGridCells.length !== layout.gridCells.length ||
			nextRoster.length !== (layout.presetLayoutRoster?.length ?? 0);

		if (!didChange) {
			return false;
		}

		const updatedLayout: PersistedLayoutDocument = {
			gridCells: nextGridCells,
			...(nextRoster.length > 0 ? { presetLayoutRoster: nextRoster } : {}),
		};

		await writeNJson(
			win,
			targetIndex,
			`${JSON.stringify(updatedLayout, null, 2)}\n`,
		);
		return true;
	} catch {
		return false;
	}
}
