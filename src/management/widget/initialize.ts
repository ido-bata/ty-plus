/**
 * Widget storage initialization.
 * Owns widget records and widget state file creation.
 */

import { WIDGET_TYPES } from "@/function/widget/contract";
import { inferWidgetTypeFromLegacyLayoutId } from "@/function/widget/legacy-parse";
import {
	isOpaquePresetPlacementId,
	LOCAL_PRESET_CATALOG_PREFIX,
} from "@/management/storage/ids";

import {
	ensureWidgetRecordsFile,
	readWidgetRecords,
	upsertWidgetRecords,
} from "@/management/widget/persistence/records-file";
import type { WidgetRecord } from "@/management/widget/record/types";
import type { LayoutItem } from "@/management/workspace/layout/grid-document";
import { logWorkspace } from "@/management/workspace/onboarding/flow-log";

export type WidgetInitializationInput = {
	initialWidgets?: readonly WidgetRecord[];
	initialLayouts?: readonly LayoutItem[];
	/**
	 * Layout row ids that are preset/group catalog refs, not `widgets.json` instance ids
	 * (required when catalog ids are UUIDs and cannot be distinguished by a legacy prefix).
	 */
	nonWidgetLayoutIds?: readonly string[];
};

/**
 * Initialize widget storage.
 * Creates widgets/widgets.json with initial widget records if provided.
 */
export const initializeWidgetStorage = async (
	win: Window,
	input: WidgetInitializationInput,
): Promise<void> => {
	const { initialWidgets, initialLayouts, nonWidgetLayoutIds } = input;
	const nonWidgetIdSet = new Set<string>();
	for (const id of nonWidgetLayoutIds ?? []) {
		const trimmed = id.trim();
		if (trimmed) nonWidgetIdSet.add(trimmed);
	}
	const explicitById = new Map(
		(initialWidgets ?? []).map((w) => [w.id, w] as const),
	);

	// Ensure widgets.json exists
	await ensureWidgetRecordsFile(win);

	// If initial layout items are provided, extract widget records from them
	// and upsert them
	if (initialLayouts && initialLayouts.length > 0) {
		const widgetLayoutItems = initialLayouts.filter((item) => {
			const id = item.id.trim();
			if (isOpaquePresetPlacementId(id)) return false;
			if (id.startsWith(LOCAL_PRESET_CATALOG_PREFIX)) return false;
			if (nonWidgetIdSet.has(id)) return false;
			return true;
		});
		if (widgetLayoutItems.length > 0) {
			logWorkspace("initializeWidgetStorage:layout-derived-records", {
				layoutItemCount: initialLayouts.length,
				widgetTileCount: widgetLayoutItems.length,
			});
			// Read existing widget records to get types
			const existing = await readWidgetRecords(win);
			const existingById = new Map(existing.map((w) => [w.id, w]));

			// Create widget records from layout items
			const widgetRecords: WidgetRecord[] = widgetLayoutItems.map((item) => {
				const fromExplicit = explicitById.get(item.id);
				if (fromExplicit) return fromExplicit;
				const prior = existingById.get(item.id);
				if (prior) return prior;
				const legacyType = inferWidgetTypeFromLegacyLayoutId(
					item.id,
					WIDGET_TYPES,
				);
				return {
					id: item.id,
					type: legacyType ?? "info",
					param: {},
				};
			});

			await upsertWidgetRecords(win, widgetRecords);
			logWorkspace("initializeWidgetStorage:upserted-from-layout", {
				recordCount: widgetRecords.length,
			});
		}
	}

	// If explicit initial widgets are provided, upsert them
	if (initialWidgets && initialWidgets.length > 0) {
		await upsertWidgetRecords(win, initialWidgets);
		logWorkspace("initializeWidgetStorage:upserted-explicit", {
			count: initialWidgets.length,
		});
	}
};
