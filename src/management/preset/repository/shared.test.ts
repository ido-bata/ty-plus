/**
 * Integration test for the shared preset repository: it must persist
 * description / descriptionImage through the wrapped file I/O, not just the
 * in-memory cache.
 */
import { beforeEach, describe, expect, it } from "vitest";

import type { Preset } from "@/management/preset/contract";
import { createSharedPresetRepository } from "@/management/preset/repository/shared";

type MockPresetRepositoryLike = {
	list(): Promise<Preset[]>;
	getById(presetId: string): Promise<Preset | undefined>;
	listLocalPresets(): Preset[];
	upsertLocalPreset(preset: Preset): Promise<void>;
	removeLocalPreset(presetId: string): Promise<void>;
};

const basePreset: Preset = {
	id: "shared-1",
	type: "preset",
	title: "Shared",
	filePath: "/x",
	icon: { type: "text", param: { text: "X" } },
};

describe("createSharedPresetRepository", () => {
	let disk: Preset[] = [];
	let baseCalls: { upsert: Preset[] };
	let base: MockPresetRepositoryLike;

	beforeEach(() => {
		disk = [];
		baseCalls = { upsert: [] };
		base = {
			async list() {
				return [];
			},
			async getById() {
				return undefined;
			},
			listLocalPresets() {
				return [];
			},
			async upsertLocalPreset(preset) {
				baseCalls.upsert.push(preset);
			},
			async removeLocalPreset() {
				// no-op
			},
		};
	});

	it("persists description and descriptionImage to shared disk and to base", async () => {
		const repo = createSharedPresetRepository(base, {
			async read() {
				return disk;
			},
			async write(next) {
				disk = next;
			},
		});

		const updated: Preset = {
			...basePreset,
			description: "My description",
			descriptionImage: "/img.png",
		};

		await repo.upsertLocalPreset(updated);

		// Disk state contains the description fields
		expect(disk).toHaveLength(1);
		expect(disk[0]?.description).toBe("My description");
		expect(disk[0]?.descriptionImage).toBe("/img.png");

		// base.upsertLocalPreset also receives the description fields
		expect(baseCalls.upsert).toHaveLength(1);
		expect(baseCalls.upsert[0]?.description).toBe("My description");
		expect(baseCalls.upsert[0]?.descriptionImage).toBe("/img.png");
	});

	it("returns presets with description from list/getById", async () => {
		const repo = createSharedPresetRepository(base, {
			async read() {
				return [
					{
						...basePreset,
						description: "Stored description",
						descriptionImage: "/stored.png",
					},
				];
			},
			async write(next) {
				disk = next;
			},
		});

		const list = await repo.list();
		expect(list[0]?.description).toBe("Stored description");
		expect(list[0]?.descriptionImage).toBe("/stored.png");

		const one = await repo.getById(basePreset.id);
		expect(one?.description).toBe("Stored description");
		expect(one?.descriptionImage).toBe("/stored.png");
	});
});
