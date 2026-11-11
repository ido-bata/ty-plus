import {
	readPresetJson,
	writePresetJson,
} from "@/management/catalog/json-files";
import { createPresetRepository } from "@/management/online/catalog/repository";
import type { CloudGateway } from "@/management/online/contract";
import {
	parsePresetCatalogJsonText,
	serializePresetCatalogJsonText,
} from "@/management/preset/catalog-json-text";
import type { Preset } from "@/management/preset/contract";
import { createSharedPresetRepository } from "@/management/preset/repository/shared";
import { catalogJsonMayContainLegacyIdPrefixes } from "@/management/storage/ids";

export type CatalogRootPinnedPresetRepositoryOptions = {
	cloud: CloudGateway;
};

/**
 * Preset repository whose file-backed local rows are persisted through the
 * unified persistence API. The persistence API resolves the managed root from
 * `ty-plus-init.json`.
 */
export const createCatalogRootPinnedPresetRepository = (
	win: Window,
	options: CatalogRootPinnedPresetRepositoryOptions,
): ReturnType<typeof createPresetRepository> => {
	const base = createPresetRepository({ cloud: options.cloud });
	return createSharedPresetRepository(base, {
		async read() {
			const raw = await readPresetJson(win);
			const rows = parsePresetCatalogJsonText(raw);
			if (
				rows.length > 0 &&
				typeof raw === "string" &&
				catalogJsonMayContainLegacyIdPrefixes(raw)
			) {
				await writePresetJson(win, serializePresetCatalogJsonText(rows));
			}
			return rows;
		},
		async write(presets: Preset[]) {
			await writePresetJson(win, serializePresetCatalogJsonText(presets));
		},
	});
};
