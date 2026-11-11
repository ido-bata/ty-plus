/**
 * Remove preset / group tiles from a workspace panel layout after the catalog entry is deleted.
 *
 * When a preset is deleted from the catalog, we must also remove its tile from the
 * workspace layout file so the panel doesn't show a ghost entry referencing a missing preset.
 *
 * The outcome distinguishes three things the previous `Promise<boolean>` folded
 * into one: the tile really was removed, nothing needed doing, and the write
 * could not be completed. A caller that only gets `false` cannot tell "the
 * preset was never on this panel" from "the file could not be written"
 * (Issue #183).
 */

import { createLogger } from "@/management/debug";
import { indexFromPanelId, readNJson, writeNJson } from "@/management/storage";
import type {
	LayoutItem,
	PersistedLayoutDocument,
} from "@/management/workspace/layout/grid-document";
import { parseLayoutDocument } from "@/management/workspace/layout/grid-document";
import { resolveWorkspacePersistenceManagedRoot } from "@/management/workspace/layout/persistence-root";

const removePresetLog = createLogger("workspace");

export type RemovePresetFromDialogDiskInput = {
	targetPanelId: string;
	catalogRefIds: readonly string[];
};

/** Which step was in flight when the removal could not finish. */
export type RemovePresetDiskStage =
	| "resolve-root"
	| "read-layout"
	| "parse-layout"
	| "write-layout";

export type RemovePresetFromDialogDiskResult =
	/** The layout changed; the panel should reload. */
	| { readonly status: "removed" }
	/** Nothing to do, and why. Not a failure. */
	| {
			readonly status: "unchanged";
			readonly reason:
				| "no-persistence-root"
				| "no-catalog-refs"
				| "no-layout-file"
				| "not-present";
	  }
	/** The step that failed. The layout file was left as it was. */
	| {
			readonly status: "failed";
			readonly stage: RemovePresetDiskStage;
			readonly message: string;
	  };

/**
 * @returns whether the layout changed, why it did not, or which step failed.
 */
export async function tryPersistRemovePresetFromDialog(
	win: Window,
	input: RemovePresetFromDialogDiskInput,
): Promise<RemovePresetFromDialogDiskResult> {
	const targetPanelId = input.targetPanelId.trim() || "panel-1";
	const targetIndex = indexFromPanelId(targetPanelId);
	let stage: RemovePresetDiskStage = "resolve-root";
	try {
		const root = (await resolveWorkspacePersistenceManagedRoot(win))?.trim();
		if (!root) {
			return { status: "unchanged", reason: "no-persistence-root" };
		}
		const ids = input.catalogRefIds.flatMap((s) => {
			const trimmed = s.trim();
			return trimmed ? [trimmed] : [];
		});
		if (ids.length === 0) {
			return { status: "unchanged", reason: "no-catalog-refs" };
		}

		stage = "read-layout";
		const rawLayout = await readNJson(win, targetIndex);
		if (!rawLayout?.trim()) {
			return { status: "unchanged", reason: "no-layout-file" };
		}

		// A corrupt body throws here and is reported as `parse-layout`; an
		// object that is not a layout parses to an empty grid, finds nothing to
		// remove, and returns `not-present` — neither path writes.
		stage = "parse-layout";
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
			return { status: "unchanged", reason: "not-present" };
		}

		const updatedLayout: PersistedLayoutDocument = {
			gridCells: nextGridCells,
			...(nextRoster.length > 0 ? { presetLayoutRoster: nextRoster } : {}),
		};

		stage = "write-layout";
		await writeNJson(
			win,
			targetIndex,
			`${JSON.stringify(updatedLayout, null, 2)}\n`,
		);
		return { status: "removed" };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		removePresetLog.error("preset tile removal failed", {
			action: "tryPersistRemovePresetFromDialog:failed",
			context: { targetPanelId, stage, message },
		});
		return { status: "failed", stage, message };
	}
}
