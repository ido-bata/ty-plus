/**
 * Unit tests for onboarding-service.
 *
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PresetRecord } from "../../management/preset/contract";
import { presetIconImage } from "./contract";
import { importOnboardingPresets } from "./onboarding-service";

const looksLikeRandomUuid = (id: string): boolean =>
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		id,
	);

const makeRepository = (initialPresets: PresetRecord[] = []) => {
	const store = new Map<string, PresetRecord>(
		initialPresets.map((p) => [p.id, p]),
	);
	return {
		store,
		async list() {
			return [...store.values()];
		},
		async upsertLocalPreset(preset: PresetRecord) {
			store.set(preset.id, preset);
		},
		async upsertLocalPresets(presets: PresetRecord[]) {
			for (const p of presets) {
				store.set(p.id, p);
			}
		},
	};
};

const filePreset = (
	id: string,
	type: PresetRecord["type"],
	filePath: string,
	title = "Existing",
): PresetRecord => ({
	id,
	type,
	title,
	filePath,
});

const listDirectory =
	vi.fn<
		(
			path: string,
		) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>
	>();

describe("importOnboardingPresets", () => {
	beforeEach(() => {
		listDirectory.mockReset();
		listDirectory.mockResolvedValue([]);
	});

	it("returns empty result when no candidates", async () => {
		const repo = makeRepository();
		const result = await importOnboardingPresets(
			{
				selectedFiles: {
					presets: new Set(),
					scripts: new Set(),
					plugins: new Set(),
				},
				selectedFolders: {
					presets: new Set(),
					scripts: new Set(),
					plugins: new Set(),
				},
				canScanFolders: false,
			},
			repo,
			listDirectory,
		);

		expect(result.addedPresetIds).toHaveLength(0);
		expect(result.addedPresets).toHaveLength(0);
		expect(result.addedGroupCatalogEntries).toHaveLength(0);
		expect(result.projectedPresetIds).toHaveLength(0);
		expect(result.workspacePanelRefIds).toHaveLength(0);
	});

	it("imports a preset file and returns new preset id", async () => {
		const repo = makeRepository();
		const result = await importOnboardingPresets(
			{
				selectedFiles: {
					presets: new Set(["C:/Ae/Presets/MyPreset.ffx"]),
					scripts: new Set(),
					plugins: new Set(),
				},
				selectedFolders: {
					presets: new Set(),
					scripts: new Set(),
					plugins: new Set(),
				},
				canScanFolders: false,
			},
			repo,
			listDirectory,
		);

		expect(result.addedPresetIds).toHaveLength(1);
		expect(result.addedPresets).toHaveLength(1);
		expect(result.addedPresets[0]?.id).toBe(result.addedPresetIds[0]);
		expect(result.projectedPresetIds).toContain(result.addedPresetIds[0]);
		expect(result.workspacePanelRefIds).toEqual(result.addedPresetIds);
	});

	it("uses sibling image as catalog icon when basename matches", async () => {
		const repo = makeRepository();
		listDirectory.mockImplementation(async (dir: string) => {
			if (dir === "C:/Ae/Presets") {
				return [
					{
						name: "MyPreset.png",
						path: "C:/Ae/Presets/MyPreset.png",
						isDirectory: false,
					},
				];
			}
			return [];
		});

		const result = await importOnboardingPresets(
			{
				selectedFiles: {
					presets: new Set(["C:/Ae/Presets/MyPreset.ffx"]),
					scripts: new Set(),
					plugins: new Set(),
				},
				selectedFolders: {
					presets: new Set(),
					scripts: new Set(),
					plugins: new Set(),
				},
				canScanFolders: false,
			},
			repo,
			listDirectory,
		);

		expect(result.addedPresets[0]?.icon).toEqual(
			presetIconImage("C:/Ae/Presets/MyPreset.png"),
		);
		expect(listDirectory).toHaveBeenCalledWith("C:/Ae/Presets");
	});

	it("suppresses duplicate file paths", async () => {
		const existing = filePreset(
			"existing.1",
			"preset",
			"C:/Ae/Presets/MyPreset.ffx",
			"MyPreset",
		);
		const repo = makeRepository([existing]);

		const result = await importOnboardingPresets(
			{
				selectedFiles: {
					presets: new Set(["C:/Ae/Presets/MyPreset.ffx"]),
					scripts: new Set(),
					plugins: new Set(),
				},
				selectedFolders: {
					presets: new Set(),
					scripts: new Set(),
					plugins: new Set(),
				},
				canScanFolders: false,
			},
			repo,
			listDirectory,
		);

		expect(result.addedPresetIds).toHaveLength(0);
	});

	it("suppresses duplicate file paths across scripts and presets", async () => {
		const existing = filePreset(
			"existing.1",
			"script",
			"C:/Ae/Scripts/MyaScript.jsx",
			"MyaScript",
		);
		const repo = makeRepository([existing]);

		const result = await importOnboardingPresets(
			{
				selectedFiles: {
					presets: new Set(),
					scripts: new Set(["C:/Ae/Scripts/MyaScript.jsx"]),
					plugins: new Set(),
				},
				selectedFolders: {
					presets: new Set(),
					scripts: new Set(),
					plugins: new Set(),
				},
				canScanFolders: false,
			},
			repo,
			listDirectory,
		);

		expect(result.addedPresetIds).toHaveLength(0);
	});

	it("assigns stable ids by deduping against existing ids", async () => {
		const existing = filePreset(
			"local.custom.mypreset",
			"preset",
			"C:/Ae/Presets/Existing.ffx",
		);
		const repo = makeRepository([existing]);

		const result = await importOnboardingPresets(
			{
				selectedFiles: {
					presets: new Set(["C:/Ae/Presets/MyPreset.ffx"]),
					scripts: new Set(),
					plugins: new Set(),
				},
				selectedFolders: {
					presets: new Set(),
					scripts: new Set(),
					plugins: new Set(),
				},
				canScanFolders: false,
			},
			repo,
			listDirectory,
		);

		// New imports use opaque random UUID catalog ids (never basename-derived).
		expect(result.addedPresetIds).toHaveLength(1);
		expect(looksLikeRandomUuid(result.addedPresetIds[0]!)).toBe(true);
		expect(result.addedPresetIds[0]).not.toContain(":");
	});

	it("creates workspace group catalog entry for folder (not a preset row)", async () => {
		const repo = makeRepository();

		const result = await importOnboardingPresets(
			{
				selectedFiles: {
					presets: new Set(["C:/Ae/Presets/Folder/Inner.ffx"]),
					scripts: new Set(),
					plugins: new Set(),
				},
				selectedFolders: {
					presets: new Set(["C:/Ae/Presets/Folder"]),
					scripts: new Set(),
					plugins: new Set(),
				},
				canScanFolders: false,
			},
			repo,
			listDirectory,
		);

		expect(result.addedPresetIds).toHaveLength(1);
		expect((await repo.list()).map((p) => p.type)).not.toContain("group");
		expect(result.addedGroupCatalogEntries).toHaveLength(1);
		const group = result.addedGroupCatalogEntries[0]!;
		expect(result.workspacePanelRefIds).toEqual([group.id]);
		expect(group.presetIds).toContain(result.addedPresetIds[0]!);
	});

	it("creates group from folder using existing file presets when no new files", async () => {
		const existing = filePreset(
			"existing.file",
			"preset",
			"C:/Ae/Presets/ExistingFolder/Existing.ffx",
		);
		const repo = makeRepository([existing]);

		const result = await importOnboardingPresets(
			{
				selectedFiles: {
					presets: new Set(),
					scripts: new Set(),
					plugins: new Set(),
				},
				selectedFolders: {
					presets: new Set(["C:/Ae/Presets/ExistingFolder"]),
					scripts: new Set(),
					plugins: new Set(),
				},
				canScanFolders: false,
			},
			repo,
			listDirectory,
		);

		expect(result.addedPresetIds).toHaveLength(0);
		expect((await repo.list()).map((p) => p.type)).not.toContain("group");
		expect(result.addedGroupCatalogEntries).toHaveLength(1);
		const group = result.addedGroupCatalogEntries[0]!;
		expect(result.workspacePanelRefIds).toEqual([group.id]);
		expect(group.presetIds).toContain("existing.file");
	});

	it("uses provided candidates when canScanFolders is false", async () => {
		const repo = makeRepository();
		const candidates = [
			{
				filePath: "C:/Ae/Presets/Provided.ffx",
				title: "Provided",
				type: "preset" as const,
			},
		];

		const result = await importOnboardingPresets(
			{
				selectedFiles: {
					presets: new Set(),
					scripts: new Set(),
					plugins: new Set(),
				},
				selectedFolders: {
					presets: new Set(),
					scripts: new Set(),
					plugins: new Set(),
				},
				canScanFolders: false,
				candidates,
			},
			repo,
			listDirectory,
		);

		expect(result.addedPresetIds).toHaveLength(1);
		expect(result.workspacePanelRefIds).toHaveLength(1);
		expect(listDirectory).toHaveBeenCalledTimes(1);
		expect(listDirectory).toHaveBeenCalledWith("C:/Ae/Presets");
	});

	it("projects added preset ids", async () => {
		const repo = makeRepository();

		const result = await importOnboardingPresets(
			{
				selectedFiles: {
					presets: new Set(["C:/Ae/Presets/P1.ffx", "C:/Ae/Presets/P2.ffx"]),
					scripts: new Set(),
					plugins: new Set(),
				},
				selectedFolders: {
					presets: new Set(),
					scripts: new Set(),
					plugins: new Set(),
				},
				canScanFolders: false,
			},
			repo,
			listDirectory,
		);

		expect(result.projectedPresetIds.length).toBeGreaterThan(0);
		expect(result.workspacePanelRefIds.length).toBeGreaterThan(0);
		for (const id of result.addedPresetIds) {
			expect(result.projectedPresetIds).toContain(id);
		}
		for (const id of result.workspacePanelRefIds) {
			expect(result.projectedPresetIds).toContain(id);
		}
	});

	it("honors folderGroupIdOverride and folderGroupNameOverride for folder groups", async () => {
		const repo = makeRepository();

		const result = await importOnboardingPresets(
			{
				selectedFiles: {
					presets: new Set(["C:/Ae/Presets/Folder/Inner.ffx"]),
					scripts: new Set(),
					plugins: new Set(),
				},
				selectedFolders: {
					presets: new Set(["C:/Ae/Presets/Folder"]),
					scripts: new Set(),
					plugins: new Set(),
				},
				canScanFolders: false,
				folderGroupIdOverride: "my-fixed-group-id",
				folderGroupNameOverride: "Custom Name",
			},
			repo,
			listDirectory,
		);

		expect(result.addedGroupCatalogEntries).toHaveLength(1);
		const group = result.addedGroupCatalogEntries[0]!;
		expect(group.id).toBe("my-fixed-group-id");
		expect(group.title).toBe("Custom Name");
	});
});
