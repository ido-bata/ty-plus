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

	const readSharedLocals = async (): Promise<Preset[]> => {
		const rows = normalizeLocalPresets(await shared.read());
		if (rows.length > 0) {
			localCache = rows;
			return rows;
		}
		if (localCache.length > 0) {
			await shared.write(localCache);
		}
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
