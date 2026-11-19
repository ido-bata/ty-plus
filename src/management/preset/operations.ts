/**
 * Preset use-case API
 * Exposes explicit preset operations while hiding repository plumbing.
 */

import type { Preset } from "@/management/preset/contract";
import { getLocalPresetCatalog } from "@/management/preset/repository/local-catalog";

export type { Preset };

/**
 * The panel window that owns `presets/presets.json`.
 *
 * Local CRUD is storage-backed, so there is no meaningful "no window" mode —
 * failing loudly here is better than letting a `window` reference throw a
 * `ReferenceError` from inside the catalog.
 */
const hostWindow = (): Window => {
	if (typeof window === "undefined") {
		throw new Error(
			"preset use-cases: no window available — the local preset catalog is CEP-storage backed",
		);
	}
	return window;
};

/**
 * List the local preset catalog.
 *
 * The rows are file-backed, so they are read through the local catalog —
 * the single owner of `presets/presets.json`.
 *
 * Rejects (rather than resolving to `[]`) when `presets/presets.json` cannot be
 * read or is corrupt, so the caller can tell a load failure from a genuinely
 * empty catalog.
 */
export const listPresets = async (): Promise<Preset[]> => {
	return getLocalPresetCatalog(hostWindow()).list();
};

/**
 * Get a single preset by ID from the local catalog. There is no remote
 * preset source in this product — a miss is a miss.
 */
export const getPreset = async (
	presetId: string,
): Promise<Preset | undefined> => {
	return getLocalPresetCatalog(hostWindow()).getById(presetId);
};

/**
 * Upsert a local preset. Cloud-independent: writing a local row must not
 * require any online service to be reachable.
 */
export const upsertLocalPreset = async (preset: Preset): Promise<void> => {
	return getLocalPresetCatalog(hostWindow()).upsertLocalPreset(preset);
};

/**
 * Remove a local preset by ID. Cloud-independent for the same reason as
 * {@link upsertLocalPreset}.
 */
export const removeLocalPreset = async (presetId: string): Promise<void> => {
	return getLocalPresetCatalog(hostWindow()).removeLocalPreset(presetId);
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
