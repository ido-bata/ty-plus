/**
 * Workspace layout domain persistence: parse/serialize `PersistedLayoutDocument`
 * and orchestrate reads/writes via the unified persistence API.
 */

import { readJson, writeJson } from "@/management/storage/persistence";
import type {
	LayoutItem,
	PersistedLayoutDocument,
} from "@/management/workspace/layout/grid-document";
import {
	parseLayoutDocument,
	serializePersistedLayoutDocument,
} from "@/management/workspace/layout/grid-document";

export const indexFromPanelId = (panelId: string): 1 | 2 | 3 | 4 | 5 => {
	const t = panelId.trim();
	const hyphenated = /^panel-(\d+)$/i.exec(t);
	if (hyphenated) {
		const n = Number.parseInt(hyphenated[1], 10);
		if (n >= 1 && n <= 5) return n as 1 | 2 | 3 | 4 | 5;
	}
	const compact = /^panel(\d+)$/i.exec(t);
	if (compact) {
		const n = Number.parseInt(compact[1], 10);
		if (n >= 1 && n <= 5) return n as 1 | 2 | 3 | 4 | 5;
	}
	return 1;
};

export const readLayoutDocument = async (
	win: Window,
	index: 1 | 2 | 3 | 4 | 5,
): Promise<PersistedLayoutDocument> => {
	const empty = (): PersistedLayoutDocument => ({ gridCells: [] });
	const stored = await readJson(win, "workspace", index);
	if (!stored) {
		return empty();
	}
	if (Array.isArray(stored)) {
		return parseLayoutDocument(stored);
	}
	const o = stored as { gridCells?: unknown; items?: unknown };
	if (Array.isArray(o.gridCells) || Array.isArray(o.items)) {
		return parseLayoutDocument(stored);
	}
	return empty();
};

export const writeLayoutDocument = async (
	win: Window,
	index: 1 | 2 | 3 | 4 | 5,
	doc: PersistedLayoutDocument,
): Promise<void> => {
	const json = serializePersistedLayoutDocument(doc);
	// The serialized shape is already `{ gridCells: [...] }`; pass the parsed
	// object so the persistence API owns stringification.
	await writeJson(win, "workspace", JSON.parse(json), index);
};

export const readWorkspaceGridCells = async (
	win: Window,
	index: 1 | 2 | 3 | 4 | 5,
): Promise<LayoutItem[]> => (await readLayoutDocument(win, index)).gridCells;

export const writeWorkspaceGridCells = async (
	win: Window,
	index: 1 | 2 | 3 | 4 | 5,
	gridCells: readonly LayoutItem[],
): Promise<void> => {
	await writeLayoutDocument(win, index, {
		gridCells: [...gridCells],
	});
};

export const ensureLayoutFiles = async (win: Window): Promise<void> => {
	const indices = [1, 2, 3, 4, 5] as const;
	const existingByIndex = await Promise.all(
		indices.map((i) => readJson(win, "workspace", i)),
	);
	await Promise.all(
		indices.map((i, idx) =>
			existingByIndex[idx] != null
				? Promise.resolve()
				: writeLayoutDocument(win, i, { gridCells: [] }),
		),
	);
};

export const clearLayoutNJson = async (
	win: Window,
	index: 1 | 2 | 3 | 4 | 5,
): Promise<void> => {
	await writeJson(win, "workspace", { gridCells: [] }, index);
	await writeJson(win, "workspaceBg", null, index);
};
