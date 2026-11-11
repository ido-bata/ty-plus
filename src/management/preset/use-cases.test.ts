/**
 * Unit tests for the preset use-case API.
 *
 * `duplicatePreset` is the public successor to the legacy private helper
 * `_duplicateLocalPreset`. It is the entry point used by the workspace
 * right-click "Duplicate" menu item (Issue #82).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Preset } from "@/management/preset/contract";

const { mockPresetRepository, mockGetDataServices } = vi.hoisted(() => ({
	mockPresetRepository: {
		list: vi.fn(),
		getById: vi.fn(),
		upsertLocalPreset: vi.fn(),
		removeLocalPreset: vi.fn(),
		listLocalPresets: vi.fn(),
	},
	mockGetDataServices: vi.fn(),
}));

vi.mock("@/management/workspace/services", () => ({
	getDataServices: () => ({
		presetRepository: mockPresetRepository,
		gateway: {
			provider: "supabase" as const,
			resolvePreset: async () => {
				throw new Error("not used in this test");
			},
		},
		cloudSync: {},
		resolveSystemPaths: () => ({
			hostId: "AE",
			operatingSystem: "win",
			userSupportRoot: "",
			hostSupportRoot: "",
			presetRoot: "",
			scriptRoot: "",
		}),
		bootMode: "live" as const,
	}),
}));

import {
	duplicatePreset,
	getPreset,
	upsertLocalPreset,
} from "@/management/preset/use-cases";

const basePreset: Preset = {
	id: "src-1",
	type: "preset",
	title: "My Preset",
	filePath: "/path/to/preset.json",
	description: "desc",
	descriptionImage: "/img.png",
	category: "preset",
	icon: { type: "text", param: { text: "MP" } },
	data: { hello: "world" },
};

describe("duplicatePreset", () => {
	beforeEach(() => {
		mockPresetRepository.upsertLocalPreset.mockReset();
		mockPresetRepository.upsertLocalPreset.mockResolvedValue(undefined);
	});

	it("returns a new preset with the requested id and parentId set to the source id", async () => {
		const newId = "new-1";
		const result = await duplicatePreset(basePreset, newId);

		expect(result.id).toBe(newId);
		expect(result.parentId).toBe(basePreset.id);
	});

	it("preserves every other field of the source preset", async () => {
		const result = await duplicatePreset(basePreset, "new-2");

		expect(result.type).toBe(basePreset.type);
		expect(result.title).toBe(basePreset.title);
		expect(result.filePath).toBe(basePreset.filePath);
		expect(result.description).toBe(basePreset.description);
		expect(result.descriptionImage).toBe(basePreset.descriptionImage);
		expect(result.category).toBe(basePreset.category);
		expect(result.icon).toEqual(basePreset.icon);
		expect(result.data).toEqual(basePreset.data);
	});

	it("does not mutate the source preset", async () => {
		const sourceSnapshot = { ...basePreset };
		await duplicatePreset(basePreset, "new-3");
		expect(basePreset).toEqual(sourceSnapshot);
	});

	it("calls upsertLocalPreset with the duplicate", async () => {
		await duplicatePreset(basePreset, "new-4");

		expect(mockPresetRepository.upsertLocalPreset).toHaveBeenCalledTimes(1);
		const arg = mockPresetRepository.upsertLocalPreset.mock.calls[0]?.[0];
		expect(arg?.id).toBe("new-4");
		expect(arg?.parentId).toBe(basePreset.id);
	});

	it("propagates upsert errors to the caller", async () => {
		mockPresetRepository.upsertLocalPreset.mockRejectedValueOnce(
			new Error("disk full"),
		);
		await expect(duplicatePreset(basePreset, "new-5")).rejects.toThrow(
			"disk full",
		);
	});
});

describe("use-cases module re-exports", () => {
	it("exposes getPreset and upsertLocalPreset as public functions", () => {
		// Smoke check: the public API surface the workspace hook imports.
		expect(typeof getPreset).toBe("function");
		expect(typeof upsertLocalPreset).toBe("function");
	});
});
