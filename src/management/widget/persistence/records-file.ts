/**
 * Widget records file (`widgets/widgets.json`) — parse/serialize only here;
 * bytes via the unified persistence API (`writeJson` / `readJson`).
 *
 * `readWidgetRecords` returns parsed `WidgetRecord[]` (filtering invalid types).
 * `writeWidgetRecords` accepts an array of records and writes the canonical
 * `{ version: 1, widgets: [...] }` shape. `upsertWidgetRecords` reads, merges
 * by id, and writes back.
 */

import { readJson, writeJson } from "@/management/storage/persistence";
import type { WidgetRecord } from "@/management/widget/record/types";
import { parseRecordsJsonValue } from "@/management/widget/record/types";

export const readWidgetRecords = async (
	win: Window,
): Promise<WidgetRecord[]> => {
	const json = await readJson(win, "widgetRecords");
	if (json === null) return [];
	return parseRecordsJsonValue(json);
};

export const writeWidgetRecords = async (
	win: Window,
	records: readonly WidgetRecord[],
): Promise<void> => {
	await writeJson(win, "widgetRecords", {
		version: 1,
		widgets: [...records],
	});
};

export const ensureWidgetRecordsFile = async (win: Window): Promise<void> => {
	const existing = await readJson(win, "widgetRecords");
	if (existing !== null) return;
	await writeJson(win, "widgetRecords", { version: 1, widgets: [] });
};

export const upsertWidgetRecords = async (
	win: Window,
	records: readonly WidgetRecord[],
): Promise<void> => {
	const existing = await readWidgetRecords(win);
	const upserted = new Map(existing.map((r) => [r.id, r]));
	for (const record of records) {
		upserted.set(record.id, record);
	}
	await writeWidgetRecords(win, Array.from(upserted.values()));
};
