import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PresetRecord } from "../../../management/preset/contract";
import * as catalogFilesStore from "../../catalog/json-files";
import * as groupCatalog from "../../preset/group-catalog";
import * as presetInitialize from "../../preset/initialize";
import * as workspaceLayoutStore from "../../storage/workspace/layout-store";
import * as workspaceStore from "../../storage/workspace/store";
import * as widgetInitialize from "../../widget/initialize";
import * as workspaceInitialize from "../../workspace/initialize";
import { completeOnboardingStorage } from "./complete";

vi.mock("../../storage/workspace/layout-store", () => ({
	indexFromPanelId: vi.fn(),
}));

vi.mock("../../widget/initialize", () => ({
	initializeWidgetStorage: vi.fn(),
}));

vi.mock("../../preset/initialize", () => ({
	initializePresetStorage: vi.fn(),
}));

vi.mock("../../preset/group-catalog", () => ({
	mergeGroupEntries: vi.fn().mockResolvedValue(undefined),
	mergeGroupCatalogEntries: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../workspace/initialize", () => ({
	initializeWorkspaceStorage: vi.fn(),
}));

vi.mock("../../storage/workspace/store", () => ({
	cepEvalScriptAvailable: vi.fn().mockReturnValue(true),
	writeSettings: vi.fn(),
}));

vi.mock("@/management/storage/persistence/managed-root", () => ({
	resolveWriteManagedRoot: vi.fn().mockResolvedValue("C:/mock/ty-plus"),
	resolveReadManagedRoot: vi.fn().mockResolvedValue("C:/mock/ty-plus"),
}));

vi.mock("@/management/setting/persistence/settings-json-files", () => ({
	readSettingsAppJson: vi.fn(),
	readSettingsPathsJson: vi.fn(),
	readSettingsUiJson: vi.fn(),
	writeSettingsAppJson: vi.fn(),
	writeSettingsPathsJson: vi.fn(),
	writeSettingsUiJson: vi.fn(),
}));

vi.mock("../../catalog/json-files", () => ({
	readPresetJson: vi.fn(),
	writePresetJson: vi.fn(),
	ensurePresetJson: vi.fn(),
}));

const makeMockWin = (): Window =>
	({ cep_node: undefined }) as unknown as Window;

const makePreset = (id: string, filePath: string): PresetRecord =>
	({
		id,
		type: filePath.toLowerCase().endsWith(".jsx") ? "script" : "preset",
		title: `Preset ${id}`,
		filePath,
	}) satisfies PresetRecord;

/** Settings payload containing `core.paths.supportRoot` (onboarding-chosen support root). */
const mergedSettingsWithSupportRoot = (
	root = "&lt;test-ae-support&gt;",
): string =>
	`${JSON.stringify({
		version: 1,
		core: { paths: { supportRoot: root } },
	})}\n`;

describe("completeOnboardingStorage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it("throws when merged settings omit support root", async () => {
		const win = makeMockWin();
		await expect(
			completeOnboardingStorage(win, {
				panelSurfaceId: "panel-1",
				mergedSettingsJson: "{}",
				initialLayoutItems: [],
				initialWidgetRecords: [],
				importedPresets: [],
			}),
		).rejects.toThrow(/core\.paths\.supportRoot/);
	});

	it("writes settings JSON", async () => {
		const win = makeMockWin();
		const settingsJson = mergedSettingsWithSupportRoot();

		await completeOnboardingStorage(win, {
			panelSurfaceId: "panel-1",
			mergedSettingsJson: settingsJson,
			initialLayoutItems: [],
			initialWidgetRecords: [],
			importedPresets: [],
		});

		expect(workspaceStore.writeSettings).toHaveBeenCalledOnce();
		expect(workspaceStore.writeSettings).toHaveBeenCalledWith(
			win,
			settingsJson,
		);
	});

	it("maps panel-1 to workspace index 1", async () => {
		const win = makeMockWin();
		vi.mocked(workspaceLayoutStore.indexFromPanelId).mockReturnValue(1);

		await completeOnboardingStorage(win, {
			panelSurfaceId: "panel-1",
			mergedSettingsJson: mergedSettingsWithSupportRoot(),
			initialLayoutItems: [],
			initialWidgetRecords: [],
			importedPresets: [],
		});

		expect(workspaceLayoutStore.indexFromPanelId).toHaveBeenCalledWith(
			"panel-1",
		);
	});

	it("maps panel-3 to workspace index 3", async () => {
		const win = makeMockWin();
		vi.mocked(workspaceLayoutStore.indexFromPanelId).mockReturnValue(3);

		await completeOnboardingStorage(win, {
			panelSurfaceId: "panel-3",
			mergedSettingsJson: mergedSettingsWithSupportRoot(),
			initialLayoutItems: [],
			initialWidgetRecords: [],
			importedPresets: [],
		});

		expect(workspaceLayoutStore.indexFromPanelId).toHaveBeenCalledWith(
			"panel-3",
		);
	});

	it("writes preset catalog when importedPresets is non-empty", async () => {
		const win = makeMockWin();
		vi.mocked(catalogFilesStore.readPresetJson).mockResolvedValue(null);
		const presets: PresetRecord[] = [
			makePreset("preset-1", "D:/scripts/preset1.jsx"),
			makePreset("preset-2", "D:/scripts/preset2.jsx"),
		];

		await completeOnboardingStorage(win, {
			panelSurfaceId: "panel-1",
			mergedSettingsJson: mergedSettingsWithSupportRoot(),
			initialLayoutItems: [],
			initialWidgetRecords: [],
			importedPresets: presets,
		});

		expect(presetInitialize.initializePresetStorage).toHaveBeenCalledOnce();
		expect(presetInitialize.initializePresetStorage).toHaveBeenCalledWith(win, {
			importedPresets: presets,
		});
	});

	it("does not write preset catalog when importedPresets is empty", async () => {
		const win = makeMockWin();

		await completeOnboardingStorage(win, {
			panelSurfaceId: "panel-1",
			mergedSettingsJson: mergedSettingsWithSupportRoot(),
			initialLayoutItems: [],
			initialWidgetRecords: [],
			importedPresets: [],
		});

		expect(presetInitialize.initializePresetStorage).toHaveBeenCalledOnce();
		expect(presetInitialize.initializePresetStorage).toHaveBeenCalledWith(win, {
			importedPresets: [],
		});
	});

	it("calls initializeWorkspaceStorage with correct panel index", async () => {
		const win = makeMockWin();
		vi.mocked(workspaceLayoutStore.indexFromPanelId).mockReturnValue(2);

		const layoutItems = [
			{ id: "widget-search", x: 0, y: 0, width: 4, height: 1 },
		];
		const widgetRecords = [
			{ id: "widget-1", type: "quick-actions" as const, param: {} },
		];

		await completeOnboardingStorage(win, {
			panelSurfaceId: "panel-2",
			mergedSettingsJson: mergedSettingsWithSupportRoot(),
			initialLayoutItems: layoutItems,
			initialWidgetRecords: widgetRecords,
			importedPresets: [],
		});

		expect(
			workspaceInitialize.initializeWorkspaceStorage,
		).toHaveBeenCalledOnce();
		expect(workspaceInitialize.initializeWorkspaceStorage).toHaveBeenCalledWith(
			win,
			{
				supportRoot: "&lt;test-ae-support&gt;",
				initialLayouts: {
					2: { gridCells: layoutItems },
				},
			},
		);
	});

	it("calls initializeWorkspaceStorage with index from indexFromPanelId", async () => {
		const win = makeMockWin();
		vi.mocked(workspaceLayoutStore.indexFromPanelId).mockReturnValue(4);

		await completeOnboardingStorage(win, {
			panelSurfaceId: "panel-4",
			mergedSettingsJson: mergedSettingsWithSupportRoot(),
			initialLayoutItems: [],
			initialWidgetRecords: [],
			importedPresets: [],
		});

		expect(workspaceInitialize.initializeWorkspaceStorage).toHaveBeenCalledWith(
			win,
			{
				supportRoot: "&lt;test-ae-support&gt;",
				initialLayouts: { 4: { gridCells: [] } },
			},
		);
	});

	it("does not call initializeWorkspaceStorage when panel maps to unknown index", async () => {
		const win = makeMockWin();
		vi.mocked(workspaceLayoutStore.indexFromPanelId).mockReturnValue(1);

		await completeOnboardingStorage(win, {
			panelSurfaceId: "panel-unknown",
			mergedSettingsJson: mergedSettingsWithSupportRoot(),
			initialLayoutItems: [],
			initialWidgetRecords: [],
			importedPresets: [],
		});

		expect(workspaceInitialize.initializeWorkspaceStorage).toHaveBeenCalledWith(
			win,
			{
				supportRoot: "&lt;test-ae-support&gt;",
				initialLayouts: { 1: { gridCells: [] } },
			},
		);
	});

	it("writes settings first, then initializes widget/preset/workspace storage", async () => {
		const win = makeMockWin();
		const writeOrder: string[] = [];

		vi.mocked(workspaceStore.writeSettings).mockImplementation(async () => {
			writeOrder.push("settings");
		});
		vi.mocked(widgetInitialize.initializeWidgetStorage).mockImplementation(
			async () => {
				writeOrder.push("widgetInit");
			},
		);
		vi.mocked(presetInitialize.initializePresetStorage).mockImplementation(
			async () => {
				writeOrder.push("presetInit");
			},
		);
		vi.mocked(groupCatalog.mergeGroupEntries).mockImplementation(async () => {
			writeOrder.push("groupCatalog");
		});
		vi.mocked(
			workspaceInitialize.initializeWorkspaceStorage,
		).mockImplementation(async () => {
			writeOrder.push("workspaceInit");
		});

		await completeOnboardingStorage(win, {
			panelSurfaceId: "panel-1",
			mergedSettingsJson: mergedSettingsWithSupportRoot(),
			initialLayoutItems: [],
			initialWidgetRecords: [],
			importedPresets: [makePreset("p1", "D:/p1.jsx")],
		});

		expect(writeOrder).toEqual([
			"settings",
			"widgetInit",
			"presetInit",
			"groupCatalog",
			"workspaceInit",
		]);
	});

	it("merges imported presets with existing catalog (upsert behavior)", async () => {
		const win = makeMockWin();

		// Simulate an existing preset catalog with preset-1 and preset-2
		vi.mocked(catalogFilesStore.readPresetJson).mockResolvedValue(
			JSON.stringify({
				version: 1,
				presets: [
					makePreset("preset-1", "D:/existing/preset1.jsx"),
					makePreset("preset-2", "D:/existing/preset2.jsx"),
				],
			}),
		);

		const importedPresets: PresetRecord[] = [
			makePreset("preset-2", "D:/imported/preset2-updated.jsx"),
			makePreset("preset-3", "D:/imported/preset3.jsx"),
		];

		await completeOnboardingStorage(win, {
			panelSurfaceId: "panel-1",
			mergedSettingsJson: mergedSettingsWithSupportRoot(),
			initialLayoutItems: [],
			initialWidgetRecords: [],
			importedPresets,
		});

		expect(presetInitialize.initializePresetStorage).toHaveBeenCalledWith(win, {
			importedPresets,
		});
	});

	it("handles null existing catalog (no prior presets)", async () => {
		const win = makeMockWin();
		vi.mocked(catalogFilesStore.readPresetJson).mockResolvedValue(null);

		await completeOnboardingStorage(win, {
			panelSurfaceId: "panel-1",
			mergedSettingsJson: mergedSettingsWithSupportRoot(),
			initialLayoutItems: [],
			initialWidgetRecords: [],
			importedPresets: [makePreset("preset-new", "D:/new/preset.jsx")],
		});

		expect(presetInitialize.initializePresetStorage).toHaveBeenCalledWith(win, {
			importedPresets: [makePreset("preset-new", "D:/new/preset.jsx")],
		});
	});
});
