/**
 * Snapshot store — named workspace snapshots shared across all panels.
 * Reads from history/snapshots.json; falls back to settings.json for migration.
 * Writes only to the new shared history file via the unified persistence API.
 */

import { readJsonText, writeJson } from "@/management/storage/persistence";
import { parseJsonObject } from "@/management/storage/read/json-file";
import {
	normalizeWorkspacePanelSettingsKey,
	readSettings,
} from "@/management/storage/workspace/store";
import type { WorkspaceSnapshot } from "@/management/workspace/persistence/store";

export type { WorkspaceSnapshot };

const readFromSettingsJson = (
	raw: string | null | undefined,
	panelId: string,
): WorkspaceSnapshot[] => {
	if (!raw?.trim()) return [];
	const parsed = parseJsonObject(raw);
	if (!parsed) return [];
	const normalizedKey = normalizeWorkspacePanelSettingsKey(panelId);
	const ws = parsed.workspace as
		| { snapshots?: Record<string, WorkspaceSnapshot[]> }
		| undefined;
	const snapArray = ws?.snapshots?.[normalizedKey];
	if (!Array.isArray(snapArray)) return [];
	return snapArray as WorkspaceSnapshot[];
};

const readSnapshotsArray = (
	raw: string | null | undefined,
): WorkspaceSnapshot[] | null => {
	if (!raw?.trim()) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	return Array.isArray(parsed) ? (parsed as WorkspaceSnapshot[]) : null;
};

export const readSnapshots = async (
	win: Window,
	_panelId: string,
): Promise<WorkspaceSnapshot[]> => {
	// New file takes priority. `readJson` discards arrays via `parseJsonObject`,
	// so we read the raw text and parse the array ourselves.
	const raw = await readJsonText(win, "snapshots");
	const fromNew = readSnapshotsArray(raw);
	if (fromNew) return fromNew;

	// Fallback to legacy settings.json location
	const settingsRaw = await readSettings(win);
	return readFromSettingsJson(settingsRaw, _panelId);
};

export const writeSnapshots = async (
	win: Window,
	_panelId: string,
	snapshots: WorkspaceSnapshot[],
): Promise<void> => {
	await writeJson(win, "snapshots", snapshots);
};
