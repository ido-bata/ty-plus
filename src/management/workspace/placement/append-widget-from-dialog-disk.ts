/**
 * Append-widget from the modeless `dialog-widget-selector` surface.
 *
 * APPLICATION-scoped CEP surface messages from a modeless extension often do not reach
 * sibling workspace panels. This path writes the same artifacts as the in-panel
 * `appendWidgetFromBusPayload` flow (`workspace-N.json` + `widgets/widgets.json`) so the
 * panel's layout file watcher reloads and shows the new tile.
 */

import type { WidgetType } from "@/function/widget";
import { readGroupJson } from "@/management/catalog/json-files";
import { parseGroupFromText } from "@/management/preset/group-catalog";
import { upsertWidgetRecords } from "@/management/widget/persistence/records-file";
import { registry } from "@/management/widget/registry";
import { resolveWorkspacePersistenceManagedRoot } from "@/management/workspace/layout/persistence-root";
import { persistTargetLayout } from "@/management/workspace/placement/cross-panel-write";
import { getDataServices } from "@/management/workspace/services";

export type AppendWidgetFromDialogDiskInput = {
	targetPanelId: string;
	widgetType: WidgetType;
};

/**
 * @returns true when layout + widget records were written under the managed persistence root.
 */
export async function tryPersistAppendWidgetFromDialog(
	win: Window,
	input: AppendWidgetFromDialogDiskInput,
): Promise<boolean> {
	const root = (await resolveWorkspacePersistenceManagedRoot(win))?.trim();
	if (!root) {
		return false;
	}
	const cfg = registry.getConfig(input.widgetType);
	if (!cfg?.available) {
		return false;
	}
	const id = registry.createId(input.widgetType);
	const { cols, rows } = cfg.defaultSize;
	const targetPanelId = input.targetPanelId.trim() || "panel-1";

	try {
		const [presets, groupText] = await Promise.all([
			getDataServices().presetRepository.list(),
			readGroupJson(win),
		]);
		const groupCatalogEntries = parseGroupFromText(groupText ?? "");

		await persistTargetLayout(win, {
			persistenceRoot: root,
			targetPanelId,
			catalogIdsToMove: [],
			widgetTiles: [{ id, width: cols, height: rows }],
			widgetTypes: { [id]: input.widgetType },
			presets,
			groupCatalogEntries,
			widgetInstanceTypesOverlay: {},
		});

		await upsertWidgetRecords(win, [{ id, type: input.widgetType, param: {} }]);
		return true;
	} catch {
		return false;
	}
}
