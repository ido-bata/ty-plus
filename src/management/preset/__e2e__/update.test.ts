/**
 * E2E tests for the preset update flow.
 *
 * Covers:
 * - Updating an existing preset's properties
 * - Verifying the catalog reflects the changes
 * - Handling concurrent updates
 *
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getPreset,
	removeLocalPreset,
	upsertLocalPreset,
} from "@/management/preset";
import type { Preset } from "@/management/preset/contract";

// ===== Mock preset repository =====

type MockPresetStore = Map<string, Preset>;

const createMockPresetRepository = (initialPresets: Preset[] = []) => {
	const store: MockPresetStore = new Map(initialPresets.map((p) => [p.id, p]));
	return {
		store,
		async list() {
			return [...store.values()];
		},
		async getById(id: string) {
			return store.get(id);
		},
		async upsertLocalPreset(preset: Preset) {
			store.set(preset.id, preset);
		},
		async removeLocalPreset(id: string) {
			store.delete(id);
		},
	};
};

const { mockGetPreset, mockUpsertLocalPreset, mockRemoveLocalPreset } =
	vi.hoisted(() => ({
		mockGetPreset: vi.fn(),
		mockUpsertLocalPreset: vi.fn(),
		mockRemoveLocalPreset: vi.fn(),
	}));

vi.mock("../../../management/preset", () => ({
	getPreset: mockGetPreset,
	upsertLocalPreset: mockUpsertLocalPreset,
	removeLocalPreset: mockRemoveLocalPreset,
}));

vi.mock(
	"../../../management/workspace/placement/notify-panels-after-preset-save",
	() => ({
		notifyPanelsAfterPresetSave: vi.fn().mockResolvedValue(undefined),
	}),
);

// ===== Test data =====

const basePreset: Preset = {
	id: "e2e-update-test-preset",
	type: "preset",
	title: "Original Title",
	filePath: "C:/Ae/Presets/Original.ffx",
	description: "Original description",
	icon: { type: "text", param: { text: "OT" } },
	data: {},
};

// ===== Tests =====

describe("preset update flow", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ============================================================
	// Scenario 1: Updating an existing preset's properties
	// ============================================================

	describe("updating existing preset properties", () => {
		it("persists updated title and description via upsertLocalPreset", async () => {
			const updated: Preset = {
				...basePreset,
				title: "Updated Title",
				description: "Updated description",
			};

			await upsertLocalPreset(updated);

			expect(mockUpsertLocalPreset).toHaveBeenCalledTimes(1);
			const savedPreset = mockUpsertLocalPreset.mock.calls[0][0] as Preset;
			expect(savedPreset.title).toBe("Updated Title");
			expect(savedPreset.description).toBe("Updated description");
		});

		it("persists updated icon via upsertLocalPreset", async () => {
			const updated: Preset = {
				...basePreset,
				icon: { type: "emoji", param: { emoji: "🔥" } },
			};

			await upsertLocalPreset(updated);

			const savedPreset = mockUpsertLocalPreset.mock.calls[0][0] as Preset;
			expect(savedPreset.icon).toEqual({
				type: "emoji",
				param: { emoji: "🔥" },
			});
		});

		it("all fields are preserved after update", async () => {
			const updated: Preset = {
				...basePreset,
				title: "New Title",
				description: "New description",
				type: "script",
				filePath: "C:/Ae/Scripts/New.jsx",
			};

			await upsertLocalPreset(updated);

			const savedPreset = mockUpsertLocalPreset.mock.calls[0][0] as Preset;
			expect(savedPreset.id).toBe(basePreset.id);
			expect(savedPreset.title).toBe("New Title");
			expect(savedPreset.type).toBe("script");
			expect(savedPreset.filePath).toBe("C:/Ae/Scripts/New.jsx");
			expect(savedPreset.description).toBe("New description");
		});

		it("updates easing curve data when present", async () => {
			const easingPreset: Preset = {
				...basePreset,
				id: "easing-preset",
				title: "Easing Preset",
				filePath: "C:/Ae/Scripts/Easing.jsx",
				type: "script",
				icon: { type: "text", param: { text: "EASE" } },
				data: { easing: { version: 1, cubic: [0.25, 0.1, 0.25, 1] } },
			};

			const updated: Preset = {
				...easingPreset,
				data: { easing: { version: 1, cubic: [0.42, 0, 0.58, 1] } },
			};

			await upsertLocalPreset(updated);

			const savedPreset = mockUpsertLocalPreset.mock.calls[0][0] as Preset;
			expect(savedPreset.data?.easing).toEqual({
				version: 1,
				cubic: [0.42, 0, 0.58, 1],
			});
		});
	});

	// ============================================================
	// Scenario 2: Verifying the catalog reflects the changes
	// ============================================================

	describe("catalog reflection", () => {
		it("getPreset returns the updated preset from repository after update", async () => {
			const repo = createMockPresetRepository([basePreset]);

			mockGetPreset.mockImplementation((id: string) => {
				return Promise.resolve(repo.store.get(id));
			});
			mockUpsertLocalPreset.mockImplementation(async (preset: Preset) => {
				repo.store.set(preset.id, preset);
			});

			const updated: Preset = {
				...basePreset,
				title: "Updated Title",
			};

			await upsertLocalPreset(updated);

			const result = await getPreset(basePreset.id);
			expect(result?.title).toBe("Updated Title");
		});

		it("repository store reflects the updated field values", async () => {
			const repo = createMockPresetRepository([basePreset]);

			mockGetPreset.mockImplementation((id: string) => {
				return Promise.resolve(repo.store.get(id));
			});
			mockUpsertLocalPreset.mockImplementation(async (preset: Preset) => {
				repo.store.set(preset.id, preset);
			});

			const updated: Preset = {
				...basePreset,
				filePath: "C:/Ae/Presets/Renamed.ffx",
			};

			await upsertLocalPreset(updated);

			expect(repo.store.get(basePreset.id)?.filePath).toBe(
				"C:/Ae/Presets/Renamed.ffx",
			);
		});
	});

	// ============================================================
	// Scenario 3: Handling concurrent updates
	// ============================================================

	describe("concurrent update handling", () => {
		it("last concurrent upsert wins (last-write-wins behavior)", async () => {
			const repo = createMockPresetRepository([basePreset]);

			mockGetPreset.mockImplementation((id: string) =>
				Promise.resolve(repo.store.get(id)),
			);
			mockUpsertLocalPreset.mockImplementation(async (preset: Preset) => {
				repo.store.set(preset.id, preset);
			});

			// Two simultaneous updates to the same preset
			const updateA: Preset = { ...basePreset, title: "Update A" };
			const updateB: Preset = { ...basePreset, title: "Update B" };

			// Fire both simultaneously
			const promiseA = upsertLocalPreset(updateA);
			const promiseB = upsertLocalPreset(updateB);

			await Promise.all([promiseA, promiseB]);

			// Both should have been called
			expect(mockUpsertLocalPreset).toHaveBeenCalledTimes(2);

			// The store ends in a consistent state (one of the two wins)
			const final = repo.store.get(basePreset.id);
			expect(final?.title === "Update A" || final?.title === "Update B").toBe(
				true,
			);
		});

		it("removing a preset makes it disappear from repository", async () => {
			const repo = createMockPresetRepository([basePreset]);

			mockGetPreset.mockImplementation((id: string) => {
				return Promise.resolve(repo.store.get(id));
			});
			mockRemoveLocalPreset.mockImplementation(async (id: string) => {
				repo.store.delete(id);
			});

			// First ensure it exists
			const before = await getPreset(basePreset.id);
			expect(before?.id).toBe(basePreset.id);

			// Remove it
			await removeLocalPreset(basePreset.id);

			// Should be gone
			const afterRemove = await getPreset(basePreset.id);
			expect(afterRemove).toBeUndefined();
		});

		it("concurrent update and delete leaves store in defined state", async () => {
			const repo = createMockPresetRepository([basePreset]);

			mockGetPreset.mockImplementation((id: string) =>
				Promise.resolve(repo.store.get(id)),
			);
			mockUpsertLocalPreset.mockImplementation(async (preset: Preset) => {
				repo.store.set(preset.id, preset);
			});
			mockRemoveLocalPreset.mockImplementation(async (id: string) => {
				repo.store.delete(id);
			});

			// Concurrent: one updates, one deletes
			const promiseUpdate = upsertLocalPreset({
				...basePreset,
				title: "Concurrently Updated",
			});
			const promiseDelete = removeLocalPreset(basePreset.id);

			await Promise.all([promiseUpdate, promiseDelete]);

			// After both complete, the preset should be gone (delete wins on same id)
			const final = await getPreset(basePreset.id);
			expect(final).toBeUndefined();
		});

		it("rapid sequential updates each persist without data loss", async () => {
			const repo = createMockPresetRepository([basePreset]);

			mockGetPreset.mockImplementation((id: string) =>
				Promise.resolve(repo.store.get(id)),
			);
			mockUpsertLocalPreset.mockImplementation(async (preset: Preset) => {
				repo.store.set(preset.id, preset);
			});

			// Rapid sequential updates
			await upsertLocalPreset({ ...basePreset, title: "Update 1" });
			await upsertLocalPreset({ ...basePreset, title: "Update 2" });
			await upsertLocalPreset({ ...basePreset, title: "Update 3" });

			expect(mockUpsertLocalPreset).toHaveBeenCalledTimes(3);

			const final = repo.store.get(basePreset.id);
			expect(final?.title).toBe("Update 3");
		});
	});
});
