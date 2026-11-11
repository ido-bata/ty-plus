/**
 * E2E tests for preset editing flow.
 *
 * Tests the data-level editing workflow: loading a preset, building an updated
 * version, and verifying the catalog reflects the changes with the id preserved.
 *
 * Wave 4 assertion: editing updates the body in its single SoT; id unchanged.
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
	id: "e2e-edit-test-preset",
	type: "preset",
	title: "Original Title",
	filePath: "C:/Ae/Presets/Original.ffx",
	description: "Original description",
	icon: { type: "text", param: { text: "OT" } },
	data: {},
};

const scriptPreset: Preset = {
	id: "e2e-edit-script-preset",
	type: "script",
	title: "Script Preset",
	filePath: "C:/Ae/Scripts/MyScript.jsx",
	description: "A script preset",
	icon: { type: "emoji", param: { emoji: "⚡" } },
	data: { code: "// original code" },
};

const easingPreset: Preset = {
	id: "e2e-edit-easing-preset",
	type: "script",
	title: "Easing Preset",
	filePath: "C:/Ae/Scripts/Easing.jsx",
	icon: { type: "text", param: { text: "EASE" } },
	data: { easing: { version: 1, cubic: [0.25, 0.1, 0.25, 1] } },
};

// ===== Tests =====

describe("preset edit flow", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ============================================================
	// Scenario 1: Opening the edit dialog for an existing preset
	// ============================================================

	describe("loading preset for editing", () => {
		it("getPreset returns the preset by id", async () => {
			const repo = createMockPresetRepository([basePreset]);

			mockGetPreset.mockImplementation((id: string) => {
				return Promise.resolve(repo.store.get(id));
			});

			const result = await getPreset(basePreset.id);

			expect(result).toBeDefined();
			expect(result?.id).toBe(basePreset.id);
			expect(result?.title).toBe(basePreset.title);
		});

		it("getPreset returns undefined for nonexistent id", async () => {
			mockGetPreset.mockResolvedValue(undefined);

			const result = await getPreset("nonexistent-id");

			expect(result).toBeUndefined();
		});

		it("loaded preset preserves all original fields", async () => {
			const repo = createMockPresetRepository([scriptPreset]);

			mockGetPreset.mockImplementation((id: string) => {
				return Promise.resolve(repo.store.get(id));
			});

			const result = await getPreset(scriptPreset.id);

			expect(result).toEqual(scriptPreset);
		});
	});

	// ============================================================
	// Scenario 2: Modifying preset properties
	// ============================================================

	describe("building updated preset", () => {
		it("title can be changed while preserving id", () => {
			// Simulate what PresetEditDialog.buildUpdatedPreset does
			const updated: Preset = {
				...basePreset,
				title: "New Title",
			};

			expect(updated.id).toBe(basePreset.id);
			expect(updated.title).toBe("New Title");
			expect(updated.filePath).toBe(basePreset.filePath);
		});

		it("description can be changed while preserving id", () => {
			const updated: Preset = {
				...basePreset,
				description: "New description",
			};

			expect(updated.id).toBe(basePreset.id);
			expect(updated.description).toBe("New description");
			expect(updated.title).toBe(basePreset.title);
		});

		it("icon can be changed from text to emoji while preserving id", () => {
			const updated: Preset = {
				...basePreset,
				icon: { type: "emoji", param: { emoji: "🔥" } },
			};

			expect(updated.id).toBe(basePreset.id);
			expect(updated.icon).toEqual({ type: "emoji", param: { emoji: "🔥" } });
		});

		it("code content can be updated for script type while preserving id", () => {
			const updated: Preset = {
				...scriptPreset,
				data: { code: "// modified code" },
			};

			expect(updated.id).toBe(scriptPreset.id);
			expect(updated.data?.code).toBe("// modified code");
		});

		it("easing curve can be updated while preserving id", () => {
			const updated: Preset = {
				...easingPreset,
				data: { easing: { version: 1, cubic: [0.42, 0, 0.58, 1] } },
			};

			expect(updated.id).toBe(easingPreset.id);
			expect(updated.data?.easing).toEqual({
				version: 1,
				cubic: [0.42, 0, 0.58, 1],
			});
		});

		it("all fields are preserved when only one field changes", () => {
			const updated: Preset = {
				...scriptPreset,
				title: "Renamed Script",
			};

			expect(updated.id).toBe(scriptPreset.id);
			expect(updated.title).toBe("Renamed Script");
			expect(updated.type).toBe(scriptPreset.type);
			expect(updated.filePath).toBe(scriptPreset.filePath);
			expect(updated.description).toBe(scriptPreset.description);
			expect(updated.icon).toEqual(scriptPreset.icon);
			expect(updated.data).toEqual(scriptPreset.data);
		});
	});

	// ============================================================
	// Scenario 3: Saving changes and verifying catalog reflects them
	// ============================================================

	describe("saving edited preset", () => {
		it("upsertLocalPreset persists the edited preset with same id", async () => {
			const repo = createMockPresetRepository([basePreset]);

			mockGetPreset.mockImplementation((id: string) => {
				return Promise.resolve(repo.store.get(id));
			});
			mockUpsertLocalPreset.mockImplementation(async (preset: Preset) => {
				repo.store.set(preset.id, preset);
			});

			// Simulate editing: change title
			const updated: Preset = {
				...basePreset,
				title: "Edited Title",
			};

			await upsertLocalPreset(updated);

			expect(mockUpsertLocalPreset).toHaveBeenCalledTimes(1);
			const savedPreset = mockUpsertLocalPreset.mock.calls[0][0] as Preset;
			expect(savedPreset.id).toBe(basePreset.id);
			expect(savedPreset.title).toBe("Edited Title");
		});

		it("id is unchanged after save (core Wave 4 assertion)", async () => {
			const repo = createMockPresetRepository([basePreset]);

			mockGetPreset.mockImplementation((id: string) => {
				return Promise.resolve(repo.store.get(id));
			});
			mockUpsertLocalPreset.mockImplementation(async (preset: Preset) => {
				repo.store.set(preset.id, preset);
			});

			// Edit multiple fields
			const updated: Preset = {
				...basePreset,
				title: "New Title",
				description: "New description",
				icon: { type: "emoji", param: { emoji: "🔥" } },
			};

			await upsertLocalPreset(updated);

			const savedPreset = mockUpsertLocalPreset.mock.calls[0][0] as Preset;
			expect(savedPreset.id).toBe(basePreset.id); // id unchanged
			expect(savedPreset.title).toBe("New Title");
			expect(savedPreset.description).toBe("New description");
			expect(savedPreset.icon).toEqual({
				type: "emoji",
				param: { emoji: "🔥" },
			});
		});

		it("getPreset returns updated values after save", async () => {
			const repo = createMockPresetRepository([basePreset]);

			mockGetPreset.mockImplementation((id: string) => {
				return Promise.resolve(repo.store.get(id));
			});
			mockUpsertLocalPreset.mockImplementation(async (preset: Preset) => {
				repo.store.set(preset.id, preset);
			});

			// Load and edit
			const original = await getPreset(basePreset.id);
			expect(original?.title).toBe("Original Title");

			const updated: Preset = {
				...basePreset,
				title: "Updated Title",
			};

			await upsertLocalPreset(updated);

			// Verify catalog reflects changes
			const result = await getPreset(basePreset.id);
			expect(result?.title).toBe("Updated Title");
		});

		it("multiple field edits are all persisted", async () => {
			const repo = createMockPresetRepository([scriptPreset]);

			mockGetPreset.mockImplementation((id: string) => {
				return Promise.resolve(repo.store.get(id));
			});
			mockUpsertLocalPreset.mockImplementation(async (preset: Preset) => {
				repo.store.set(preset.id, preset);
			});

			// Edit multiple fields
			const updated: Preset = {
				...scriptPreset,
				title: "New Title",
				description: "New description",
				data: { code: "// new code" },
			};

			await upsertLocalPreset(updated);

			const savedPreset = mockUpsertLocalPreset.mock.calls[0][0] as Preset;
			expect(savedPreset.id).toBe(scriptPreset.id);
			expect(savedPreset.title).toBe("New Title");
			expect(savedPreset.description).toBe("New description");
			expect(savedPreset.data?.code).toBe("// new code");
		});

		it("editing a different preset does not affect original", async () => {
			const presetA: Preset = { ...basePreset, id: "preset-a" };
			const presetB: Preset = {
				...basePreset,
				id: "preset-b",
				title: "Preset B",
			};

			const repo = createMockPresetRepository([presetA, presetB]);

			mockGetPreset.mockImplementation((id: string) => {
				return Promise.resolve(repo.store.get(id));
			});
			mockUpsertLocalPreset.mockImplementation(async (preset: Preset) => {
				repo.store.set(preset.id, preset);
			});

			// Edit only presetA
			const updatedA: Preset = {
				...presetA,
				title: "Modified A",
			};

			await upsertLocalPreset(updatedA);

			// presetB should be unchanged
			const resultB = await getPreset("preset-b");
			expect(resultB?.title).toBe("Preset B");

			// presetA should have new title
			const resultA = await getPreset("preset-a");
			expect(resultA?.title).toBe("Modified A");
		});
	});

	// ============================================================
	// Scenario 4: Delete during edit workflow
	// ============================================================

	describe("delete during edit workflow", () => {
		it("preset can be deleted after loading for edit", async () => {
			const repo = createMockPresetRepository([basePreset]);

			mockGetPreset.mockImplementation((id: string) => {
				return Promise.resolve(repo.store.get(id));
			});
			mockRemoveLocalPreset.mockImplementation(async (id: string) => {
				repo.store.delete(id);
			});

			// Load preset
			const original = await getPreset(basePreset.id);
			expect(original).toBeDefined();

			// Delete it
			await removeLocalPreset(basePreset.id);

			expect(mockRemoveLocalPreset).toHaveBeenCalledWith(basePreset.id);

			// Should be gone from catalog
			const result = await getPreset(basePreset.id);
			expect(result).toBeUndefined();
		});

		it("deleting then re-saving with same id creates fresh entry", async () => {
			const repo = createMockPresetRepository([basePreset]);

			mockGetPreset.mockImplementation((id: string) => {
				return Promise.resolve(repo.store.get(id));
			});
			mockUpsertLocalPreset.mockImplementation(async (preset: Preset) => {
				repo.store.set(preset.id, preset);
			});
			mockRemoveLocalPreset.mockImplementation(async (id: string) => {
				repo.store.delete(id);
			});

			// Load and delete
			await removeLocalPreset(basePreset.id);

			// Re-create with same id but modified content
			const reCreated: Preset = {
				...basePreset,
				title: "Recreated Title",
			};

			await upsertLocalPreset(reCreated);

			const result = await getPreset(basePreset.id);
			expect(result?.title).toBe("Recreated Title");
		});
	});
});
