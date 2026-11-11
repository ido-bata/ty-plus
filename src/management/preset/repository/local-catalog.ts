/**
 * Local preset catalog — the cloud-independent owner of the local preset rows.
 *
 * ## Why this module exists (Issue #145)
 *
 * Local preset access used to be reachable only through
 * `getDataServices().presetRepository`. `getDataServices()` is the cloud boot
 * boundary: in live mode with no runtime gateway registered it calls
 * `markGatewayNotBooted()` and throws `GatewayBootRequiredError`. Every local
 * read therefore inherited a cloud-boot precondition that has nothing to do
 * with it, and the Preset List rendered an empty body while the real rows sat
 * unread in `presets/presets.json`.
 *
 * The rows never needed the gateway in the first place — they are file-backed
 * and the only cloud call in the whole path is a *remote fallback resolve* on a
 * local miss. So the dependency edge is removed here rather than worked around:
 *
 *   - no gateway is constructed, imported, or consulted by this module;
 *   - the rows come from `presets/presets.json` through the STRICT parser;
 *   - a missing file is an EMPTY catalog, a corrupt file is a LOAD FAILURE.
 *
 * The last point is deliberate. The boot-path store in
 * `workspace/services.ts` and `repository/catalog-root-pinned.ts` both use the
 * lenient parser, which returns `[]` for corrupt input — a corrupt catalog
 * rendered as "no presets", which is the same empty-success lie this issue is
 * about. The Preset List reads through this module, so it can tell the two
 * apart. Those two boot-path callers keep their lenient contract; reconciling
 * them is a separate change with its own blast radius.
 *
 * ## Caching / staleness
 *
 * The instance is created lazily on first call for a given window and memoized
 * in a `WeakMap` — never at module-evaluation time, so importing this module
 * has no side effect and no boot ordering. The memoized row cache lives inside
 * `createSharedPresetRepository`, which re-reads the file on **every** `list()`
 * and on every mutation. Cloud boot cannot invalidate a local read: there is no
 * gateway in the data path to go stale, which is the point of the fix.
 *
 * Cloud resolve stays where it belongs — `getPreset` in `preset/use-cases.ts`
 * asks the gateway for a remote fallback only after a local miss.
 */

import {
	parsePresetCatalogJsonTextStrict,
	serializePresetCatalogJsonText,
} from "@/management/preset/catalog-json-text";
import type { Preset } from "@/management/preset/contract";
import { createSharedPresetRepository } from "@/management/preset/repository/shared";
import { writePresetsJson } from "@/management/storage";
import { catalogJsonMayContainLegacyIdPrefixes } from "@/management/storage/ids";
import { readJsonText } from "@/management/storage/persistence";

/**
 * Local preset repository. Structurally the repository shape returned by
 * {@link createSharedPresetRepository} — declared here so this module owns its
 * public contract independently of the boot-path repositories that share the
 * merge/normalize implementation.
 */
export type LocalPresetCatalog = {
	list(): Promise<Preset[]>;
	getById(presetId: string): Promise<Preset | undefined>;
	listLocalPresets(): Preset[];
	upsertLocalPreset(preset: Preset): Promise<void>;
	removeLocalPreset(presetId: string): Promise<void>;
};

/** File-backed row source for the local catalog (`presets/presets.json`). */
export type LocalPresetFileStore = {
	read(): Promise<Preset[]>;
	write(presets: Preset[]): Promise<void>;
};

/**
 * Base repository for the local catalog: no gateway, no fixture records, no
 * in-memory shadow store. Every row the catalog reports comes from the file, so
 * "local catalog" and "what is on disk" cannot drift apart.
 */
const LOCAL_ONLY_BASE = {
	list: async (): Promise<Preset[]> => [],
	getById: async (): Promise<Preset | undefined> => undefined,
	listLocalPresets: (): Preset[] => [],
	upsertLocalPreset: async (): Promise<void> => {},
	removeLocalPreset: async (): Promise<void> => {},
};

/**
 * Build the `presets/presets.json` row source for one window.
 *
 * Failure classification, which is the reason this store exists separately
 * from the boot-path one:
 *
 * - **no file** (`null`) or an empty file → `[]`, an empty catalog. A fresh
 *   install legitimately has nothing saved yet; that is not a failure.
 * - **corrupt / structurally invalid** → throws `PresetCatalogParseError`. The
 *   caller surfaces it instead of rendering an empty list.
 * - **host read failure** → propagates. Also a load failure, never `[]`.
 */
const createLocalPresetFileStore = (win: Window): LocalPresetFileStore => ({
	async read() {
		// Preserve malformed JSON and I/O failures for the strict catalog parser.
		const raw = await readJsonText(win, "presetCatalog");
		if (raw === null || raw.trim() === "") {
			return [];
		}
		const rows = parsePresetCatalogJsonTextStrict(raw);
		if (catalogJsonMayContainLegacyIdPrefixes(raw)) {
			await writePresetsJson(win, serializePresetCatalogJsonText(rows));
		}
		return rows;
	},
	async write(presets) {
		await writePresetsJson(win, serializePresetCatalogJsonText(presets));
	},
});

/**
 * Build a local catalog bound to one window. Exported for tests and for
 * callers that need an isolated instance; production code uses
 * {@link getLocalPresetCatalog}.
 */
export const createLocalPresetCatalog = (win: Window): LocalPresetCatalog =>
	createSharedPresetRepository(
		LOCAL_ONLY_BASE,
		createLocalPresetFileStore(win),
	);

let catalogs = new WeakMap<Window, LocalPresetCatalog>();

/**
 * The local catalog for `win`, created on first use.
 *
 * Returns the same instance for the same window so concurrent callers share
 * one row cache and one writer. Construction happens at call time, never at
 * import time — a module-level singleton read during module evaluation would
 * just relocate the boot-ordering coupling this module exists to remove.
 */
export const getLocalPresetCatalog = (win: Window): LocalPresetCatalog => {
	const existing = catalogs.get(win);
	if (existing) {
		return existing;
	}
	const created = createLocalPresetCatalog(win);
	catalogs.set(win, created);
	return created;
};

/** Test-only: drop every memoized catalog. */
export const __resetLocalPresetCatalogForTests = (): void => {
	catalogs = new WeakMap<Window, LocalPresetCatalog>();
};
