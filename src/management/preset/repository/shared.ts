import type { Preset } from "@/management/preset/contract";

import { normalizePresets } from "@/management/preset/icon-data";
import { stripKnownIdPrefixes } from "@/management/storage/ids";

type PresetRepositoryLike = {
	list(): Promise<Preset[]>;
	getById(presetId: string): Promise<Preset | undefined>;
	listLocalPresets(): Preset[];
	upsertLocalPreset(preset: Preset): Promise<void>;
	upsertLocalPresets?(presets: Preset[]): Promise<void>;
	removeLocalPreset(presetId: string): Promise<void>;
};

type SharedPresetStore = {
	read(): Promise<Preset[]>;
	write(presets: Preset[]): Promise<void>;
};

const normalizeLocalPresets = (value: unknown): Preset[] => {
	if (!Array.isArray(value)) {
		return [];
	}
	const basic = value
		.filter((row): row is Preset => {
			if (!row || typeof row !== "object") {
				return false;
			}
			return (
				typeof row.id === "string" &&
				row.id.trim().length > 0 &&
				typeof row.type === "string" &&
				typeof row.filePath === "string" &&
				row.filePath.trim().length > 0
			);
		})
		.map((row) => row);
	return normalizePresets(basic);
};

const catalogIdKey = (id: string): string => stripKnownIdPrefixes(id.trim());

const mergeWithSharedLocals = (base: Preset[], locals: Preset[]): Preset[] => {
	const merged = new Map<string, Preset>();
	for (const row of base) {
		if (
			!locals.some((local) => catalogIdKey(local.id) === catalogIdKey(row.id))
		) {
			merged.set(row.id, row);
		}
	}
	for (const row of locals) {
		merged.set(catalogIdKey(row.id), row);
	}
	return [...merged.values()];
};

export const createSharedPresetRepository = (
	base: PresetRepositoryLike,
	shared: SharedPresetStore,
): PresetRepositoryLike => {
	let localCache = normalizeLocalPresets(base.listLocalPresets());

	/**
	 * Whether `localCache` still holds the base repository's in-memory seed
	 * rather than rows that came from (or were written to) the shared file.
	 *
	 * The write-back in `readSharedLocals` exists for exactly one case: the
	 * base repository holds local rows in memory that the shared file has
	 * never seen, so the first read has to persist them. Once the cache is
	 * file-derived that reasoning stops applying — the file is the source of
	 * truth, and an empty file means the rows were removed on purpose. Writing
	 * the cache back over it would resurrect presets the user deleted, in a
	 * different window that still holds a warm cache.
	 *
	 * Issue #145: this is the local catalog's stale-read decision. The catalog
	 * is never read "before boot completes" because it does not wait for boot
	 * at all, so the empty-result-cached-forever race the decoupling removes
	 * does not exist here. This flag is what keeps the *next* worst thing from
	 * taking its place.
	 */
	let cacheIsBaseSeed = localCache.length > 0;

	const readSharedLocals = async (): Promise<Preset[]> => {
		const rows = normalizeLocalPresets(await shared.read());
		if (rows.length > 0) {
			localCache = rows;
			cacheIsBaseSeed = false;
			return rows;
		}
		if (cacheIsBaseSeed) {
			await shared.write(localCache);
			cacheIsBaseSeed = false;
			return localCache;
		}
		// A successful read that produced no rows is an empty catalog, not a
		// failed read. Drop the cached rows so a deletion made through another
		// surface is observable here instead of being overwritten.
		localCache = [];
		return localCache;
	};

	return {
		async list() {
			const [baseList, sharedLocals] = await Promise.all([
				base.list(),
				readSharedLocals(),
			]);
			return mergeWithSharedLocals(baseList, sharedLocals);
		},
		async getById(presetId) {
			const list = await this.list();
			const key = catalogIdKey(presetId);
			const existing = list.find(
				(row) => row.id === presetId || catalogIdKey(row.id) === key,
			);
			if (existing) {
				return existing;
			}
			return (
				(await base.getById(presetId)) ?? (await base.getById(key)) ?? undefined
			);
		},
		listLocalPresets() {
			return [...localCache];
		},
		async upsertLocalPreset(preset) {
			const current = await readSharedLocals();
			const [normalized] = normalizePresets([preset]);
			const next = current.filter(
				(row) => catalogIdKey(row.id) !== catalogIdKey(normalized.id),
			);
			next.push(normalized);
			localCache = next;
			await shared.write(next);
			await base.upsertLocalPreset(normalized);
		},
		async upsertLocalPresets(presets) {
			if (presets.length === 0) {
				return;
			}
			const current = await readSharedLocals();
			const normalizedBatch = normalizePresets(presets);
			const merged = new Map<string, Preset>();
			for (const row of current) {
				merged.set(catalogIdKey(row.id), row);
			}
			for (const preset of normalizedBatch) {
				merged.set(catalogIdKey(preset.id), preset);
			}
			const next = [...merged.values()];
			localCache = next;
			await shared.write(next);
			if (typeof base.upsertLocalPresets === "function") {
				await base.upsertLocalPresets(normalizedBatch);
				return;
			}
			await Promise.all(
				normalizedBatch.map((preset) => base.upsertLocalPreset(preset)),
			);
		},
		async removeLocalPreset(presetId) {
			const current = await readSharedLocals();
			const key = catalogIdKey(presetId);
			const next = current.filter((row) => catalogIdKey(row.id) !== key);
			localCache = next;
			await shared.write(next);
			await base.removeLocalPreset(presetId);
			if (presetId.trim() !== key) {
				await base.removeLocalPreset(key);
			}
		},
	};
};
