/**
 * Behavioral tests for `persistFolderGroupPreset` (issue #139).
 *
 * The folder-scan path used to reach presets through
 * `getDataServices().presetRepository`, which throws
 * `GatewayBootRequiredError` while the cloud gateway is not booted —
 * group creation died offline. It now goes through the file-backed
 * local catalog (`getLocalPresetCatalog`), and these tests pin that the
 * path completes without any cloud boundary.
 *
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const listPresets = vi.fn();
const getLocalPresetCatalog = vi.fn();
const importOnboardingPresets = vi.fn();
const mergeGroupEntries = vi.fn();
const upsertGroupEntry = vi.fn();
const canUseCepNodeFileBrowser = vi.fn();
const createCepNodeFileBrowserService = vi.fn();
const mockListDirectory = vi.fn();

vi.mock("@/management/preset/use-cases", () => ({ listPresets }));
vi.mock("@/management/preset/repository/local-catalog", () => ({
	getLocalPresetCatalog,
}));
vi.mock("@/management/preset/onboarding-service", () => ({
	importOnboardingPresets,
}));
vi.mock("@/management/preset/group-catalog", () => ({
	mergeGroupEntries,
	upsertGroupEntry,
}));
vi.mock("@/management/storage/file-browser-service", () => ({
	canUseCepNodeFileBrowser,
	createCepNodeFileBrowserService,
}));
vi.mock("@/management/preset/icon-editor", () => ({
	presetIconDraftToPresetIcon: vi.fn(() => null),
}));

const { persistFolderGroupPreset } = await import("./persist-folder-group");

const win = {} as Window;

const baseInput = {
	folderPaths: ["/presets/root"],
	presetIdsText: "",
	recursive: true,
	groupId: "grp-1",
	groupName: "Root Group",
};

describe("persistFolderGroupPreset — folder-scan path (issue #139)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		canUseCepNodeFileBrowser.mockReturnValue(true);
		mockListDirectory.mockResolvedValue([]);
		createCepNodeFileBrowserService.mockReturnValue({
			listDirectory: mockListDirectory,
		});
		getLocalPresetCatalog.mockReturnValue({ kind: "local-catalog" });
		importOnboardingPresets.mockResolvedValue({
			presets: [],
			addedPresets: [],
			addedPresetIds: ["p-1"],
			addedGroupCatalogEntries: [
				{ id: "grp-1", title: "Root Group", presetIds: ["p-1"] },
			],
			projectedPresetIds: [],
			workspacePanelRefIds: [],
		});
	});

	it("imports scanned presets through the local catalog, not the cloud boundary", async () => {
		const result = await persistFolderGroupPreset(win, baseInput);

		expect(getLocalPresetCatalog).toHaveBeenCalledWith(win);
		expect(importOnboardingPresets).toHaveBeenCalledTimes(1);
		const [, repository] = importOnboardingPresets.mock.calls[0];
		expect(repository).toEqual({ kind: "local-catalog" });
		expect(mergeGroupEntries).toHaveBeenCalledWith(win, [
			{ id: "grp-1", title: "Root Group", presetIds: ["p-1"] },
		]);
		expect(result.catalogRefIds).toEqual(["grp-1"]);
	});

	it("passes pre-collected candidates and the group id/name overrides to the importer", async () => {
		await persistFolderGroupPreset(win, baseInput);

		const [options] = importOnboardingPresets.mock.calls[0];
		expect(options.folderGroupIdOverride).toBe("grp-1");
		expect(options.folderGroupNameOverride).toBe("Root Group");
		expect(options.canScanFolders).toBe(false);
		expect(options.candidates).toEqual([
			expect.objectContaining({ type: "group", filePath: "/presets/root" }),
		]);
	});

	it("collects script presets (.jsx/.jsxbin) under scanned folders as candidates", async () => {
		mockListDirectory.mockResolvedValue([
			{ name: "a.ffx", path: "/presets/root/a.ffx", isDirectory: false },
			{ name: "b.jsx", path: "/presets/root/b.jsx", isDirectory: false },
			{
				name: "c.jsxbin",
				path: "/presets/root/c.jsxbin",
				isDirectory: false,
			},
			{
				name: "ignore.txt",
				path: "/presets/root/ignore.txt",
				isDirectory: false,
			},
		]);

		await persistFolderGroupPreset(win, baseInput);

		const [options] = importOnboardingPresets.mock.calls[0];
		const fileCandidates = options.candidates.filter(
			(c: { type: string }) => c.type !== "group",
		);
		expect(fileCandidates).toEqual([
			expect.objectContaining({
				filePath: "/presets/root/a.ffx",
				type: "preset",
			}),
			expect.objectContaining({
				filePath: "/presets/root/b.jsx",
				type: "script",
			}),
			expect.objectContaining({
				filePath: "/presets/root/c.jsxbin",
				type: "script",
			}),
		]);
	});

	it("does not scan folders when recursive is false", async () => {
		await persistFolderGroupPreset(win, { ...baseInput, recursive: false });

		expect(mockListDirectory).not.toHaveBeenCalled();
		const [options] = importOnboardingPresets.mock.calls[0];
		expect(options.candidates).toEqual([
			expect.objectContaining({ type: "group", filePath: "/presets/root" }),
		]);
	});

	it("fails with a clear error when the CEP file browser is unavailable", async () => {
		canUseCepNodeFileBrowser.mockReturnValue(false);

		await expect(persistFolderGroupPreset(win, baseInput)).rejects.toThrow(
			/folder scanning requires cep node file browser/i,
		);
		expect(importOnboardingPresets).not.toHaveBeenCalled();
	});

	it("fails when the scan finds no preset files", async () => {
		importOnboardingPresets.mockResolvedValue({
			presets: [],
			addedPresets: [],
			addedPresetIds: [],
			addedGroupCatalogEntries: [],
			projectedPresetIds: [],
			workspacePanelRefIds: [],
		});

		await expect(persistFolderGroupPreset(win, baseInput)).rejects.toThrow(
			/no preset files/i,
		);
		expect(mergeGroupEntries).not.toHaveBeenCalled();
	});
});

describe("persistFolderGroupPreset — manual preset id path", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		listPresets.mockResolvedValue([
			{ id: "p-1", type: "preset" },
			{ id: "p-2", type: "script" },
		]);
	});

	it("upserts the group entry directly without scanning folders", async () => {
		const result = await persistFolderGroupPreset(win, {
			...baseInput,
			folderPaths: [],
			presetIdsText: "p-1\np-2",
		});

		expect(listPresets).toHaveBeenCalledTimes(1);
		expect(upsertGroupEntry).toHaveBeenCalledWith(
			win,
			expect.objectContaining({ id: "grp-1", presetIds: ["p-1", "p-2"] }),
		);
		expect(importOnboardingPresets).not.toHaveBeenCalled();
		expect(result.catalogRefIds).toEqual(["grp-1"]);
	});

	it("accepts script and other non-.ffx preset types as explicit members", async () => {
		const result = await persistFolderGroupPreset(win, {
			...baseInput,
			folderPaths: [],
			presetIdsText: "p-2",
		});

		expect(upsertGroupEntry).toHaveBeenCalledWith(
			win,
			expect.objectContaining({ presetIds: ["p-2"] }),
		);
		expect(result.status).toContain("1 items");
	});

	it("unions folder-scan members with explicit preset ids", async () => {
		canUseCepNodeFileBrowser.mockReturnValue(true);
		mockListDirectory.mockResolvedValue([]);
		createCepNodeFileBrowserService.mockReturnValue({
			listDirectory: mockListDirectory,
		});
		getLocalPresetCatalog.mockReturnValue({ kind: "local-catalog" });
		importOnboardingPresets.mockResolvedValue({
			presets: [],
			addedPresets: [],
			addedPresetIds: ["p-1"],
			addedGroupCatalogEntries: [
				{ id: "grp-1", title: "Root Group", presetIds: ["p-1"] },
			],
			projectedPresetIds: [],
			workspacePanelRefIds: [],
		});

		await persistFolderGroupPreset(win, {
			...baseInput,
			presetIdsText: "p-2",
		});

		expect(importOnboardingPresets).toHaveBeenCalledTimes(1);
		expect(mergeGroupEntries).toHaveBeenCalledWith(win, [
			expect.objectContaining({
				id: "grp-1",
				presetIds: ["p-1", "p-2"],
			}),
		]);
	});

	it("still saves an explicit-member group when the folder scan finds nothing", async () => {
		canUseCepNodeFileBrowser.mockReturnValue(true);
		mockListDirectory.mockResolvedValue([]);
		createCepNodeFileBrowserService.mockReturnValue({
			listDirectory: mockListDirectory,
		});
		getLocalPresetCatalog.mockReturnValue({ kind: "local-catalog" });
		importOnboardingPresets.mockResolvedValue({
			presets: [],
			addedPresets: [],
			addedPresetIds: [],
			addedGroupCatalogEntries: [],
			projectedPresetIds: [],
			workspacePanelRefIds: [],
		});

		const result = await persistFolderGroupPreset(win, {
			...baseInput,
			presetIdsText: "p-2",
		});

		expect(upsertGroupEntry).toHaveBeenCalledWith(
			win,
			expect.objectContaining({ id: "grp-1", presetIds: ["p-2"] }),
		);
		expect(result.catalogRefIds).toEqual(["grp-1"]);
	});

	it("rejects unknown preset ids", async () => {
		await expect(
			persistFolderGroupPreset(win, {
				...baseInput,
				folderPaths: [],
				presetIdsText: "p-1\nmissing-id",
			}),
		).rejects.toThrow(/not found in catalog/i);
		expect(upsertGroupEntry).not.toHaveBeenCalled();
	});

	it("requires at least one folder path or preset id", async () => {
		await expect(
			persistFolderGroupPreset(win, {
				...baseInput,
				folderPaths: [],
				presetIdsText: "",
			}),
		).rejects.toThrow(/folder path or preset id/i);
	});
});
