// Stub for missing local preset store

import type { Preset } from "@/management/preset/contract";
import type { SnapshotStorage } from "@/management/workspace/persistence/contract";

export const createLocalPresetStore = (
	_options?: SnapshotStorage,
): {
	list(): Preset[];
	get(id: string): Preset | null;
	set(preset: Preset): void;
	upsert(preset: Preset): void;
	upsertMany(presets: Preset[]): void;
	delete(id: string): void;
	remove(id: string): void;
} => {
	return {
		list: () => [],
		get: () => null,
		set: () => {},
		upsert: () => {},
		upsertMany: () => {},
		delete: () => {},
		remove: () => {},
	};
};
