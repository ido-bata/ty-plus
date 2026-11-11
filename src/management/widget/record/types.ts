/**
 * Widget record domain types
 */

import { isWidgetType, type WidgetType } from "@/function/widget/contract";
import { stringifyJson } from "@/management/storage/read/json-file";

export type WidgetRecord = {
	id: string;
	type: WidgetType;
	param: Record<string, unknown>;
};

const isWidgetRecordType = (value: unknown): value is WidgetType =>
	typeof value === "string" && isWidgetType(value);

export const parseRecordsJsonValue = (value: unknown): WidgetRecord[] => {
	if (value === null || value === undefined) return [];

	if (typeof value !== "object") return [];

	// Accept { version, widgets } structure
	const obj = value as Record<string, unknown>;

	let widgets: unknown;

	// If it has a version property, look for widgets
	if ("version" in obj) {
		widgets = obj.widgets;
	} else {
		// Otherwise treat the object itself as a widget record (for backwards compat)
		widgets = [obj];
	}

	if (!Array.isArray(widgets)) return [];

	const records: WidgetRecord[] = [];

	for (const item of widgets) {
		if (typeof item !== "object" || item === null) continue;

		const record = item as Record<string, unknown>;

		// Drop records with missing/empty id
		const id = record.id;
		if (typeof id !== "string" || id.trim() === "") continue;

		// Drop records with unsupported widget type (legacy "search" → quick-actions)
		const rawType = record.type;
		const type =
			rawType === "search"
				? "quick-actions"
				: typeof rawType === "string"
					? rawType
					: null;
		if (!type || !isWidgetRecordType(type)) continue;

		// Default missing param to {}, drop array/non-object param
		let param: Record<string, unknown> = {};
		if ("param" in record) {
			const p = record.param;
			if (typeof p === "object" && p !== null && !Array.isArray(p)) {
				param = p as Record<string, unknown>;
			} else {
				// Drop array/non-object param - leave as {}
				continue;
			}
		}

		records.push({ id, type, param });
	}

	return records;
};

export const serializeRecords = (records: readonly WidgetRecord[]): string => {
	const payload = {
		version: 1,
		widgets: records,
	};
	return stringifyJson(payload);
};
