/**
 * Storage initialization use case.
 * Ensures all required workspace storage files exist with valid empty structures.
 * This file orchestrates storage helpers only  Eit must not know React or onboarding.
 */

import {
	ensureGroupJson,
	ensurePresetJson,
} from "@/management/catalog/json-files";
import { ensureUiSettingsFile } from "@/management/setting/persistence/workspace-ui-settings-file";
import {
	ensureLayoutFiles,
	readBackgroundJson,
	writeBackgroundJson,
} from "@/management/storage/workspace/layout-store";
import {
	ensureWidgetRecordsFile,
	upsertWidgetRecords,
} from "@/management/widget/persistence/records-file";
import type { WidgetRecord } from "@/management/widget/record/types";
import type { PanelLayoutSeed } from "@/management/workspace/layout/grid-document";

export type StorageInitializationInput = {
	initialLayouts?: Partial<Record<1 | 2 | 3 | 4 | 5, PanelLayoutSeed>>;
	initialWidgets?: readonly WidgetRecord[];
};

const writeBackgroundIfMissing = async (
	win: Window,
	index: 1 | 2 | 3 | 4 | 5,
): Promise<void> => {
	const existing = await readBackgroundJson(win, index);
	if (existing !== null) return;
	await writeBackgroundJson(win, index, "null\n");
};

/**
 * Ensure all required workspace storage files exist with valid empty structures.
 * Creates default files only when missing or empty.
 *
 * - Five workspace layout files (workspace-1.json through workspace-5.json)
 * - Five workspace background files (background-N.json under workspaces/background/) as null
 * - widgets/widgets.json
 * - presets/presets.json
 * - groups/groups.json
 * - settings/ui.json
 * - history/workspace-N-snapshots.json (TODO in test  Eskipped until ensure helper exists)
 *
 * If `input.initialLayouts` is provided, writes those panel layouts.
 * If `input.initialWidgets` is provided, upserts those widget records.
 */
export const ensureStorageInitialized = async (
	win: Window,
	input: StorageInitializationInput = {},
): Promise<void> => {
	// Ensure five workspace layout files exist
	await ensureLayoutFiles(win);

	// Ensure five workspace background files exist as null
	await writeBackgroundIfMissing(win, 1);
	await writeBackgroundIfMissing(win, 2);
	await writeBackgroundIfMissing(win, 3);
	await writeBackgroundIfMissing(win, 4);
	await writeBackgroundIfMissing(win, 5);

	// Ensure catalog files exist
	await ensureWidgetRecordsFile(win);
	await ensurePresetJson(win);
	await ensureGroupJson(win);
	await ensureUiSettingsFile(win);

	// history/workspace-N-snapshots.json  Eskipped until snapshot-store has ensure helper

	// Write initial layouts if provided
	if (input.initialLayouts) {
		const { writeLayoutDocument } = await import(
			"../workspace/layout/persistence"
		);
		await Promise.all(
			Object.entries(input.initialLayouts).map(async ([index, seed]) => {
				if (seed !== undefined) {
					await writeLayoutDocument(win, Number(index) as 1 | 2 | 3 | 4 | 5, {
						gridCells: [...seed.gridCells],
					});
				}
			}),
		);
	}

	// Upsert initial widgets if provided
	if (input.initialWidgets && input.initialWidgets.length > 0) {
		await upsertWidgetRecords(win, input.initialWidgets);
	}
};
