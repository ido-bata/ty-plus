/**
 * Workspace layout domain persistence: parse/serialize `PersistedLayoutDocument`
 * and orchestrate reads/writes via the unified persistence API.
 */

import { readJson, writeJson } from "@/management/storage/persistence";
import type { PersistedLayoutDocument } from "@/management/workspace/layout/grid-document";
import { serializePersistedLayoutDocument } from "@/management/workspace/layout/grid-document";

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
