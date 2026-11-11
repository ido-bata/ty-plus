import { createLocalPresetStore } from "@/management/online/catalog/local-preset-store";
import {
	createFixtureCloudGateway,
	FALLBACK_RECORDS,
} from "@/management/online/catalog/runtime-cloud-gateway";
import type { CloudGateway } from "@/management/online/contract";
import type { Preset } from "@/management/preset/contract";
import type { SnapshotStorage } from "@/management/workspace/persistence/contract";

/**
 * Preset repository  Elocal-authoritative preset access layer.
 *
 * Design contracts (per MVP Workflow Migration / local-persistence-and-cloud-boundary slice):
 * - **Local persistence is authoritative**: `list()` returns fixture + local store,
 *   where local store records take priority over fixture records (Map insert order).
 * - Cloud (`cloud.resolvePreset`) is only consulted on `getById` **when not found locally**.
 * - `upsertLocalPreset` / `upsertLocalPresets` write only to local store  Ecloud sync is
 *   a non-blocking, deferred overlay for publish/upload, not authoritative storage.
 * - The repository is safe to use offline: fixture presets work without network,
 *   local store works without network, cloud calls fail silently (caught in `getById`).
 */

export type PresetRepository = {
	list(): Promise<Preset[]>;
	getById(presetId: string): Promise<Preset | undefined>;
	listLocalPresets(): Preset[];
	upsertLocalPreset(preset: Preset): Promise<void>;
	upsertLocalPresets?(presets: Preset[]): Promise<void>;
	removeLocalPreset(presetId: string): Promise<void>;
};

export const createPresetRepository = (
	options: {
		cloud?: CloudGateway;
		fixturePresets?: Preset[];
		localStore?: SnapshotStorage;
	} = {},
): PresetRepository => {
	const cloud = options.cloud ?? createFixtureCloudGateway();
	const fixturePresets = options.fixturePresets ?? FALLBACK_RECORDS;
	const localPresetStore = options.localStore
		? createLocalPresetStore(options.localStore)
		: null;

	const list = async (): Promise<Preset[]> => {
		const merged = new Map<string, Preset>();

		for (const preset of fixturePresets) {
			merged.set(preset.id, preset);
		}

		// Archive-compliant: market uses `searchPresets` / `getPreset` / DL. Do not use full `GET /presets`.

		for (const preset of localPresetStore?.list() ?? []) {
			merged.set(preset.id, preset);
		}

		return [...merged.values()];
	};

	return {
		list,
		async getById(presetId) {
			const presets = await list();
			const existing = presets.find((preset) => preset.id === presetId);
			if (existing) {
				return existing;
			}

			try {
				return await cloud.resolvePreset(presetId);
			} catch {
				return undefined;
			}
		},
		listLocalPresets() {
			return localPresetStore?.list() ?? [];
		},
		async upsertLocalPreset(preset) {
			localPresetStore?.upsert(preset);
		},
		async upsertLocalPresets(presets) {
			if (!localPresetStore || presets.length === 0) {
				return;
			}
			if (typeof localPresetStore.upsertMany === "function") {
				localPresetStore.upsertMany(presets);
				return;
			}
			for (const preset of presets) {
				localPresetStore.upsert(preset);
			}
		},
		async removeLocalPreset(presetId) {
			localPresetStore?.remove(presetId);
		},
	};
};
