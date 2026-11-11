/**
 * Preset storage initialization.
 * Owns preset catalog creation.
 */

import {
	ensurePresetJson,
	readPresetJson,
	writePresetJson,
} from "@/management/catalog/json-files";
import type { Preset } from "@/management/preset/contract";
import { normalizePresets } from "@/management/preset/icon-data";
import { logWorkspace } from "@/management/workspace/onboarding/flow-log";

export type InitializationInput = {
	importedPresets?: readonly Preset[];
};

/**
 * Initialize preset storage.
 * Creates presets/presets.json with imported presets if provided.
 */
export const initializePresetStorage = async (
	win: Window,
	input: InitializationInput,
): Promise<void> => {
	const { importedPresets } = input;

	// Ensure presets.json exists
	await ensurePresetJson(win);

	// If imported presets are provided, merge with existing and write
	if (importedPresets && importedPresets.length > 0) {
		// Read existing preset catalog
		const existingJson = await readPresetJson(win);
		let existingPresets: Preset[] = [];
		if (existingJson !== null) {
			try {
				const parsed = JSON.parse(existingJson) as {
					presets?: Preset[];
				};
				existingPresets = normalizePresets(parsed.presets ?? []);
			} catch {
				// Ignore parse errors
			}
		}

		const importedNormalized = normalizePresets(importedPresets);

		// Merge: imported presets override existing ones with same catalog id
		const mergedPresets = normalizePresets([
			...existingPresets.filter(
				(existing) =>
					!importedNormalized.some((imported) => imported.id === existing.id),
			),
			...importedNormalized,
		]);

		const catalogPayload = {
			version: 1,
			presets: mergedPresets,
		};
		await writePresetJson(win, `${JSON.stringify(catalogPayload, null, 2)}\n`);
		logWorkspace("initializePresetStorage:catalog-written", {
			mergedPresetCount: mergedPresets.length,
			importedCount: importedPresets.length,
		});
	}
};
