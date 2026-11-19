/**
 * Append preset / folder-group catalog tiles from a modeless preset dialog.
 *
 * Same rationale as `append-widget-from-dialog-disk.ts`: CEP modeless surfaces
 * often do not deliver `surfaceMessage` to sibling workspace panels, so we write
 * `workspace-N.json` under the managed persistence root and let the panel reload.
 *
 * The preset catalog is local-only: rows come from `presets/presets.json`
 * through `getLocalPresetCatalog`, the single owner of the local catalog.
 * A corrupt file rejects with `PresetCatalogParseError`; a missing file is
 * an empty catalog. There is no remote preset source in this product.
 *
 * ADR-0006: the catalog read, dedup check and the layout write are ONE
 * transaction inside the managed-root persistence lock. All shared catalog
 * reads happen INSIDE the hold — never before it — because another CEP
 * context may have rewritten those files while we waited for the lock.
 * `persistTargetLayout` joins the same hold via AsyncLocalStorage.
 */

import { readGroupJson } from "@/management/catalog/json-files";
import { parseGroupFromText } from "@/management/preset/group-catalog";
import { getLocalPresetCatalog } from "@/management/preset/repository/local-catalog";
import { indexFromPanelId, readNJson } from "@/management/storage";
import {
	resolvePersistenceLockRoot,
	withPersistenceLock,
} from "@/management/storage/lock/persistence-lock";
import { parseLayoutDocument } from "@/management/workspace/layout/grid-document";
import { resolveWorkspacePersistenceManagedRoot } from "@/management/workspace/layout/persistence-root";
import { persistTargetLayout } from "@/management/workspace/placement/cross-panel-write";

export type AppendPresetFromDialogDiskInput = {
	targetPanelId: string;
	catalogRefIds: readonly string[];
	/**
	 * Optional explicit grid placement (in cell units) for the first preset id.
	 * Threaded through to `persistTargetLayout` so the on-disk layout honors
	 * the drop position rather than auto-packing from the top.
	 */
	dropPlacement?: { x: number; y: number; width?: number; height?: number };
};

/**
 * @returns true when layout was written under the managed persistence root.
 * @throws when `presets/presets.json` cannot be read or is corrupt — the
 *         caller MUST surface the error rather than treating it as a
 *         successful no-op.
 */
export async function tryPersistAppendPresetFromDialog(
	win: Window,
	input: AppendPresetFromDialogDiskInput,
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

	const lockRoot = await resolvePersistenceLockRoot(win);
	if (!lockRoot) {
		return false;
	}
	return withPersistenceLock(win, lockRoot, async () => {
		// The local preset catalog is the only preset source. A corrupt
		// `presets/presets.json` rejects with `PresetCatalogParseError`; a
		// missing file is an empty catalog. The read happens inside the hold
		// so the dedup decision uses the freshest shared state.
		const targetIndex = indexFromPanelId(targetPanelId);
		const [presets, groupText, rawLayout] = await Promise.all([
			getLocalPresetCatalog(win).list(),
			readGroupJson(win),
			readNJson(win, targetIndex),
		]);
		const groupCatalogEntries = parseGroupFromText(groupText ?? "");
		const existingLayout = rawLayout
			? parseLayoutDocument(JSON.parse(rawLayout))
			: { gridCells: [], presetLayoutRoster: [] };

		// Build set of catalog refs already on this panel's layout
		const existingCatalogIds = new Set<string>();
		for (const cell of existingLayout.gridCells) {
			const trimmed = cell.id?.trim();
			if (trimmed) existingCatalogIds.add(trimmed);
		}
		if (existingLayout.presetLayoutRoster) {
			for (const entry of existingLayout.presetLayoutRoster) {
				const trimmed = entry.presetRefId?.trim();
				if (trimmed) existingCatalogIds.add(trimmed);
			}
		}

		// Split into new IDs (to add) and existing IDs (edit case — skip layout)
		const newCatalogIds = ids.filter((id) => !existingCatalogIds.has(id));
		if (newCatalogIds.length === 0) {
			// All IDs are already on the layout — this is an edit, not an add.
			// No layout modification needed.
			return false;
		}

		// Layout-write path: any failure here still propagates so the caller can
		// surface the error.
		await persistTargetLayout(win, {
			persistenceRoot: root,
			targetPanelId,
			catalogIdsToMove: newCatalogIds,
			widgetTiles: [],
			widgetTypes: {},
			presets,
			groupCatalogEntries,
			widgetInstanceTypesOverlay: {},
			dropPlacement: input.dropPlacement,
		});
		return true;
	});
}
