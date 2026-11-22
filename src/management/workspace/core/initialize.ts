/**
 * Workspace layout storage initialization.
 * Owns workspace layout files and background files.
 */

import {
	ensureLayoutFiles,
	readBackgroundJson,
	writeBackgroundJson,
	writeLayoutDocument,
} from "@/management/storage/workspace/layout-store";
import type {
	LayoutItem,
	PanelLayoutSeed,
} from "@/management/workspace/layout/grid-document";
import { logWorkspace } from "@/management/workspace/onboarding/flow-log";

export type WorkspaceInitializationInput = {
	supportRoot: string;
	initialLayouts?: Partial<Record<1 | 2 | 3 | 4 | 5, PanelLayoutSeed>>;
};

/**
 * Initialize workspace storage.
 * Creates workspace-N.json and workspaces/background/background-N.json files.
 */
export const initializeWorkspaceStorage = async (
	win: Window,
	input: WorkspaceInitializationInput,
): Promise<void> => {
	const { supportRoot, initialLayouts } = input;

	// Ensure all workspace layout files exist (as empty arrays)
	await ensureLayoutFiles(win);

	// Ensure all background files exist (as null)
	const bgIndices = [1, 2, 3, 4, 5] as const;
	const existingBgs = await Promise.all(
		bgIndices.map((i) => readBackgroundJson(win, i)),
	);
	await Promise.all(
		bgIndices.map((i, idx) =>
			existingBgs[idx] === null
				? writeBackgroundJson(win, i, "null\n")
				: Promise.resolve(),
		),
	);

	// Write initial layouts if provided
	if (initialLayouts) {
		await Promise.all(
			Object.entries(initialLayouts).map(async ([index, seed]) => {
				if (seed === undefined) return;
				const gridCells: readonly LayoutItem[] = seed.gridCells;
				logWorkspace("initializeWorkspaceStorage:write-layout", {
					index: Number(index),
					itemCount: gridCells.length,
					supportRoot,
				});
				await writeLayoutDocument(win, Number(index) as 1 | 2 | 3 | 4 | 5, {
					gridCells: [...gridCells],
				});
			}),
		);
	}
};
