/**
 * Host-side read/write of per-panel workspace JSON files (raw string out).
 * Every path goes through the unified persistence API; no ExtendScript.
 */

import {
	readJsonText,
	removeJson,
	writeJson,
} from "@/management/storage/persistence";

export const readNJson = async (
	win: Window,
	index: 1 | 2 | 3 | 4 | 5,
): Promise<string | null> => readJsonText(win, "workspace", index);

export const writeNJson = async (
	win: Window,
	index: 1 | 2 | 3 | 4 | 5,
	jsonText: string,
): Promise<void> => {
	await writeJson(win, "workspace", JSON.parse(jsonText) as object, index);
};

/**
 * Delete the per-panel workspace JSON file from disk. Idempotent — a
 * missing file is treated as success. Use this for "restore-to-not-exists"
 * rollback paths where the original state was "no file" — see Issue #146 /
 * Blocker 6. `writeNJson(..., "")` is **not** a substitute: `JSON.parse("")`
 * throws `SyntaxError`, and even when the parse is mocked, an empty file
 * is observable on disk that the next reader will choke on.
 */
export const removeNJson = async (
	win: Window,
	index: 1 | 2 | 3 | 4 | 5,
): Promise<void> => {
	await removeJson(win, "workspace", index);
};

export const readBackgroundJson = async (
	win: Window,
	index: 1 | 2 | 3 | 4 | 5,
): Promise<string | null> => readJsonText(win, "workspaceBg", index);

export const writeBackgroundJson = async (
	win: Window,
	index: 1 | 2 | 3 | 4 | 5,
	jsonText: string,
): Promise<void> => {
	const trimmed = jsonText.trim();
	const payload: unknown = trimmed.length === 0 ? null : JSON.parse(trimmed);
	await writeJson(win, "workspaceBg", payload, index);
};
