/**
 * Preset use-case API
 * Exposes explicit preset operations while hiding repository plumbing.
 */

import type { SyncStatus } from "@/management/online/contract";
import type { Preset } from "@/management/preset/contract";
import { getDataServices } from "@/management/workspace/services";

export type { Preset };

/**
 * List all presets (local + cloud/fixture merged).
 */
export const listPresets = async (): Promise<Preset[]> => {
	return getDataServices().presetRepository.list();
};

/**
 * Get a single preset by ID.
 */
export const getPreset = async (
	presetId: string,
): Promise<Preset | undefined> => {
	return getDataServices().presetRepository.getById(presetId);
};

/**
 * Upsert a local preset.
 */
export const upsertLocalPreset = async (preset: Preset): Promise<void> => {
	return getDataServices().presetRepository.upsertLocalPreset(preset);
};

/**
 * Remove a local preset by ID.
 */
export const removeLocalPreset = async (presetId: string): Promise<void> => {
	return getDataServices().presetRepository.removeLocalPreset(presetId);
};

/**
 * Duplicate an existing preset under a new ID.
 *
 * - Spreads `source` and replaces `id` with `newId`.
 * - Stamps `parentId` on the duplicate so downstream consumers can
 *   recognize it as a derivative of `source`.
 * - Persists the duplicate via `upsertLocalPreset` and returns it.
 *
 * Returns the duplicate on success. Callers are expected to surface
 * the new preset id (e.g. for selection / layout placement).
 */
export const duplicatePreset = async (
	source: Preset,
	newId: string,
): Promise<Preset> => {
	const duplicate: Preset = {
		...source,
		id: newId,
		parentId: source.id,
	};
	await upsertLocalPreset(duplicate);
	return duplicate;
};

/**
 * Sync presets with cloud (returns sync status).
 */
const _syncPresets = async (): Promise<SyncStatus> => {
	const { cloudSync } = getDataServices();
	const result = await cloudSync.syncPresets();
	return result.status;
};
