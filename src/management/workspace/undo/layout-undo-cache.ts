/**
 * Session-scoped undo/redo cache for the workspace layout.
 *
 * Spec (see docs/plans/2026-06-19-7-critical-bug-fixes.md, Bug 6):
 * - Cache lives under `<managed-root>/cache/layout-undo/`
 * - Session-scoped: `init()` clears the cache directory (called at AE
 *   startup so prior session's state is dropped)
 * - Pure stack math lives in `cache-stack.ts`; this module is the disk
 *   adapter
 *
 * The companion `history.ts` undo/redo ring remains in-memory for
 * immediate use; this cache layer adds cross-reload persistence within
 * a single AE session. The two layers are independent.
 */

import { readJsonFileText } from "@/management/storage/read/json-file";
import { writeJsonFileText } from "@/management/storage/write/json-file";
import { resolveWorkspacePersistenceManagedRoot } from "@/management/workspace/layout/persistence-root";

import { LayoutUndoStack, type SerializedStack } from "./cache-stack";

const CACHE_SUBDIR = "cache/layout-undo";
const STACK_FILE = (panelId: string): string => `${panelId}/stack.json`;

const STACK_SCHEMA = 1;

/**
 * Reset the cache for one panel. Called at AE startup so prior session's
 * state is dropped. Errors are swallowed (best-effort cleanup).
 */
export const initLayoutUndoCache = async (
	win: Window,
	panelId: string,
): Promise<void> => {
	const root = await resolveWorkspacePersistenceManagedRoot(win);
	if (!root) return;
	const stackPath = `${root}/${CACHE_SUBDIR}/${STACK_FILE(panelId)}`;
	await writeJsonFileText(
		win,
		stackPath,
		JSON.stringify({ schema: STACK_SCHEMA, stack: [], idx: -1 }, null, 2),
	);
};

/**
 * Load the cached stack for a panel. Returns an empty stack when the
 * cache file is missing, unreadable, or has an unsupported schema.
 */
export const loadLayoutUndoStack = async (
	win: Window,
	panelId: string,
): Promise<LayoutUndoStack> => {
	const root = await resolveWorkspacePersistenceManagedRoot(win);
	if (!root) return new LayoutUndoStack();
	const stackPath = `${root}/${CACHE_SUBDIR}/${STACK_FILE(panelId)}`;
	const raw = await readJsonFileText(win, stackPath);
	if (!raw) return new LayoutUndoStack();
	try {
		const parsed = JSON.parse(raw) as SerializedStack | null;
		if (!parsed || parsed.schema !== STACK_SCHEMA) {
			return new LayoutUndoStack();
		}
		return LayoutUndoStack.restore(parsed);
	} catch {
		return new LayoutUndoStack();
	}
};

/**
 * Persist the current stack state to the cache. Errors are swallowed
 * (in-memory stack remains the source of truth during the session).
 */
export const saveLayoutUndoStack = async (
	win: Window,
	panelId: string,
	stack: LayoutUndoStack,
): Promise<void> => {
	const root = await resolveWorkspacePersistenceManagedRoot(win);
	if (!root) return;
	const stackPath = `${root}/${CACHE_SUBDIR}/${STACK_FILE(panelId)}`;
	try {
		await writeJsonFileText(
			win,
			stackPath,
			JSON.stringify(stack.serialize(), null, 2),
		);
	} catch {
		// Best-effort: the in-memory stack remains usable for the session.
	}
};
