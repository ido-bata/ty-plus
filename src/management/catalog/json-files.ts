/**
 * On-disk preset / group / widget catalog JSON under the managed ty-plus tree.
 * All bytes go through the unified persistence API (`writeJson` / `readJson`).
 *
 * The text-in / text-out public signatures are preserved so existing callers
 * (which pass raw JSON text) don't need to change. Internally we parse to
 * an object and serialize back, which is the new persistence API contract.
 */

import { readJson, writeJson } from "@/management/storage/persistence";

export const readPresetJson = async (win: Window): Promise<string | null> => {
	const json = await readJson(win, "presetCatalog");
	return json ? JSON.stringify(json) : null;
};

export const writePresetJson = (win: Window, text: string): Promise<void> =>
	writeJson(win, "presetCatalog", JSON.parse(text));

export const ensurePresetJson = async (win: Window): Promise<void> => {
	const existing = await readPresetJson(win);
	if (existing !== null) return;
	await writeJson(win, "presetCatalog", { version: 1, presets: [] });
};

export const readGroupJson = async (win: Window): Promise<string | null> => {
	const json = await readJson(win, "groupCatalog");
	return json ? JSON.stringify(json) : null;
};

export const writeGroupJson = (win: Window, text: string): Promise<void> =>
	writeJson(win, "groupCatalog", JSON.parse(text));

export const ensureGroupJson = async (win: Window): Promise<void> => {
	const existing = await readGroupJson(win);
	if (existing !== null) return;
	await writeJson(win, "groupCatalog", { version: 1, groups: [] });
};

export const readWidgetJson = async (win: Window): Promise<string | null> => {
	const json = await readJson(win, "widgetRecords");
	return json ? JSON.stringify(json) : null;
};

export const writeWidgetJson = (win: Window, text: string): Promise<void> =>
	writeJson(win, "widgetRecords", JSON.parse(text));

export const ensureWidgetJson = async (win: Window): Promise<void> => {
	const existing = await readWidgetJson(win);
	if (existing !== null) return;
	await writeJson(win, "widgetRecords", { version: 1, widgets: [] });
};
