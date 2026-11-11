/**
 * Preset use-case API
 * Exposes explicit preset operations while hiding repository plumbing.
 */

import type { SyncStatus } from "@/management/online/contract";
import type { Preset } from "@/management/preset/contract";
import { getLocalPresetCatalog } from "@/management/preset/repository/local-catalog";
import {
	getDataServices,
	tryGetDataServices,
} from "@/management/workspace/services";

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
 * Issue #145: this used to be `getDataServices().presetRepository.list()`,
 * which made a purely local read fail with `GatewayBootRequiredError` whenever
 * the cloud gateway had not booted. The rows are file-backed, so they are read
 * through the local catalog and the gateway is not consulted at all.
 *
 * Rejects (rather than resolving to `[]`) when `presets/presets.json` cannot be
 * read or is corrupt, so the caller can tell a load failure from a genuinely
 * empty catalog.
 */
export const listPresets = async (): Promise<Preset[]> => {
	return getLocalPresetCatalog(hostWindow()).list();
};

/**
 * Get a single preset by ID, local first.
 *
 * A local hit never touches the cloud. Only a local miss asks the gateway for a
 * remote resolve, and that ask is best-effort: an un-booted or offline gateway
 * resolves to `undefined` (a miss) rather than throwing, so a cloud problem
 * cannot turn a local read into a failure.
 */
export const getPreset = async (
	presetId: string,
): Promise<Preset | undefined> => {
	const local = await getLocalPresetCatalog(hostWindow()).getById(presetId);
	if (local) {
		return local;
	}
	return resolvePresetFromCloud(presetId);
};

/**
 * Remote resolve, attempted only after a local miss. Returns `undefined` when
 * the gateway is unavailable or the resolve fails — both are "not found
 * remotely", not "the local read failed".
 */
const resolvePresetFromCloud = async (
	presetId: string,
): Promise<Preset | undefined> => {
	const services = tryGetDataServices();
	if (!services) {
		return undefined;
	}
	try {
		return await services.gateway.resolvePreset(presetId);
	} catch {
		return undefined;
	}
};

/**
 * Upsert a local preset. Cloud-independent: writing a local row must not
 * require the cloud gateway to be booted.
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

/**
 * Sync presets with cloud (returns sync status).
 */
const _syncPresets = async (): Promise<SyncStatus> => {
	const { cloudSync } = getDataServices();
	const result = await cloudSync.syncPresets();
	return result.status;
};
