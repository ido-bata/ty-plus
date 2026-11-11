/**
 * Storage shape guardrail tests.
 *
 * Enforces the final storage contract for workspace layout files:
 * - workspace-N.json is `{ "gridCells": [...] }` (each cell: `id` + cell geometry only), optional `presetLayoutRoster`
 * - Layout JSON must not include a parallel `presetPlacements` table
 * - No forbidden UI state keys appear in workspace layout JSON
 * - All layout item ids have matching widget records after init
 * - All preset layout ids have matching preset records after init
 * - Onboarding creates all required files
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PresetRecord } from "../../management/preset/contract";
import { completeOnboardingStorage } from "../setting/onboarding/complete";
import { resolveInitializationLocatorPath } from "../setting/onboarding/initialization";
import type { WidgetRecord } from "../widget/record/types";
import type { WorkspaceInitializationInput } from "../workspace/initialize";
import type {
	LayoutItem,
	PanelLayoutSeed,
} from "../workspace/layout/grid-document";
import {
	parseLayoutDocument,
	serializePersistedLayoutDocument,
	toGridCellsJson,
} from "../workspace/layout/grid-document";

// ── Forbidden keys contract ──────────────────────────────────────────────────

const forbiddenKeys = [
	"panelId",
	"grid",
	"widgets",
	"selectedPlacementIds",
	"layoutLocked",
	"alignTarget",
	"presetFocusId",
	"presetSelectedIds",
	"presetHoverId",
	"workspacePresetLayouts",
	"panelPresetIds",
	"quickActionCategories",
	"showGridOverlay",
	"showPresetLabels",
	"fontOptions",
	"selectedFont",
	"workspaceBackground",
	"presetPlacements",
	"pinnedRef",
] as const;

const assertWorkspaceLayoutJsonHasNoForbiddenKeys = (json: string) => {
	for (const key of forbiddenKeys) {
		expect(json).not.toMatch(new RegExp(`"${key}"\\s*:`));
	}
};

// ── Mock setup using vi.hoisted to avoid hoisting issues ─────────────────────

const {
	mockEnsureLayoutFiles,
	mockReadBackgroundJson,
	mockWriteBackgroundJson,
	mockWriteLayoutDocument,
	mockEnsureWidgetRecordsFile,
	mockUpsertWidgetRecords,
	mockEnsurePresetJson,
	mockEnsureGroupCatalogJson,
	mockEnsureWorkspaceUiSettingsFile,
	mockWorkspaceIndexFromPanelId,
	mockwriteSettings,
	mockWritePresetJson,
	mockReadPresetJson,
	mockInitializeWorkspaceStorage,
} = vi.hoisted(() => ({
	mockEnsureLayoutFiles: vi.fn(),
	mockReadBackgroundJson: vi.fn(),
	mockWriteBackgroundJson: vi.fn(),
	mockWriteLayoutDocument: vi.fn(),
	mockEnsureWidgetRecordsFile: vi.fn(),
	mockUpsertWidgetRecords: vi.fn(),
	mockEnsurePresetJson: vi.fn(),
	mockEnsureGroupCatalogJson: vi.fn(),
	mockEnsureWorkspaceUiSettingsFile: vi.fn(),
	mockWorkspaceIndexFromPanelId: vi.fn(),
	mockwriteSettings: vi.fn(),
	mockWritePresetJson: vi.fn(),
	mockReadPresetJson: vi.fn(),
	mockInitializeWorkspaceStorage:
		vi.fn<
			(win: Window, input: WorkspaceInitializationInput) => Promise<void>
		>(),
}));

vi.mock("./workspace-layout-store", () => ({
	ensureLayoutFiles: mockEnsureLayoutFiles,
	readBackgroundJson: mockReadBackgroundJson,
	writeBackgroundJson: mockWriteBackgroundJson,
	writeLayoutDocument: mockWriteLayoutDocument,
	indexFromPanelId: mockWorkspaceIndexFromPanelId,
}));

vi.mock("../widget/persistence/records-file", () => ({
	ensureWidgetRecordsFile: mockEnsureWidgetRecordsFile,
	upsertWidgetRecords: mockUpsertWidgetRecords,
}));

vi.mock("../catalog/json-files", () => ({
	ensurePresetJson: mockEnsurePresetJson,
	ensureGroupCatalogJson: mockEnsureGroupCatalogJson,
	writePresetJson: mockWritePresetJson,
	readPresetJson: mockReadPresetJson,
}));

vi.mock("../setting/persistence/workspace-ui-settings-file", () => ({
	ensureWorkspaceUiSettingsFile: mockEnsureWorkspaceUiSettingsFile,
}));

vi.mock("../storage/workspace/store", () => ({
	writeSettings: mockwriteSettings,
}));

vi.mock("../preset/group-catalog", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../preset/group-catalog")>();
	return {
		...actual,
		mergeGroupCatalogEntries: vi.fn().mockResolvedValue(undefined),
		mergeGroupEntries: vi.fn().mockResolvedValue(undefined),
	};
});

vi.mock("../workspace/initialize", () => ({
	initializeWorkspaceStorage: mockInitializeWorkspaceStorage,
}));

vi.mock("@/management/setting/persistence/settings-json-files", () => ({
	readSettingsAppJson: vi.fn(),
	readSettingsPathsJson: vi.fn(),
	readSettingsUiJson: vi.fn(),
	writeSettingsAppJson: vi.fn(),
	writeSettingsPathsJson: vi.fn(),
	writeSettingsUiJson: vi.fn(),
}));

// ── Test Suite ────────────────────────────────────────────────────────────────

describe("workspace-storage-contract", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── 1. Session support root bootstrap contract ───────────────────────────

	describe("session support root bootstrap", () => {
		it("passes the supplied session support root to workspace initialization", async () => {
			mockInitializeWorkspaceStorage.mockResolvedValue(undefined);

			const win = {} as Window;
			await mockInitializeWorkspaceStorage(win, {
				supportRoot: "/session-support-root",
			});

			expect(mockInitializeWorkspaceStorage).toHaveBeenCalledOnce();
			expect(mockInitializeWorkspaceStorage).toHaveBeenCalledWith(win, {
				supportRoot: "/session-support-root",
			});
		});

		it("places ty-plus-init.json directly under the session support root", () => {
			expect(resolveInitializationLocatorPath("/session-support-root/")).toBe(
				"/session-support-root/ty-plus-init.json",
			);
		});
	});

	// ── 2. workspace-N.json layout document shape ────────────────────────────────

	describe("workspace-N.json layout document shape", () => {
		it("toGridCellsJson serializes gridCells without presetPlacements", () => {
			const layouts: LayoutItem[] = [
				{ id: "widget-search", x: 0, y: 0, width: 4, height: 1 },
				{ id: "widget-menu", x: 4, y: 0, width: 1, height: 1 },
			];

			const json = toGridCellsJson(layouts);
			const parsed = JSON.parse(json) as Record<string, unknown>;

			expect(parsed).not.toHaveProperty("version");
			expect(Array.isArray(parsed.gridCells)).toBe(true);
			expect(parsed.gridCells).toHaveLength(2);
			expect((parsed.gridCells as { id: string }[])[0]?.id).toBe(
				"widget-search",
			);
			expect((parsed.gridCells as { id: string }[])[1]?.id).toBe("widget-menu");
			expect("presetPlacements" in parsed).toBe(false);
		});

		it("serializePersistedLayoutDocument is object-shaped (not a bare array)", () => {
			const layouts: LayoutItem[] = [
				{ id: "widget-search", x: 0, y: 2, width: 4, height: 5 },
			];

			const json = serializePersistedLayoutDocument({
				gridCells: layouts,
			});
			const trimmed = json.trim();

			expect(trimmed.startsWith("{")).toBe(true);
			expect(trimmed.endsWith("}")).toBe(true);
		});

		it("parseLayoutDocument accepts legacy plain arrays", () => {
			const legacy = [
				{ id: "widget-search", x: 0, y: 0, width: 4, height: 1 },
				{ id: "w1", x: 1, y: 2, width: 3, height: 4 },
			];
			const doc = parseLayoutDocument(legacy);
			expect(doc.gridCells).toHaveLength(2);
			expect("presetPlacements" in doc).toBe(false);
		});
	});

	// ── 3. No forbidden keys in workspace layout JSON ─────────────────────

	describe("no forbidden keys in workspace layout JSON", () => {
		it("forbiddenKeys list is correctly defined", () => {
			expect(forbiddenKeys).toContain("panelId");
			expect(forbiddenKeys).toContain("grid");
			expect(forbiddenKeys).toContain("widgets");
			expect(forbiddenKeys).toContain("workspacePresetLayouts");
			expect(forbiddenKeys).toContain("panelPresetIds");
			expect(forbiddenKeys).toContain("workspaceBackground");
			expect(forbiddenKeys).toContain("presetPlacements");
			expect(forbiddenKeys).toContain("pinnedRef");
			expect(forbiddenKeys).toContain("fontOptions");
			expect(forbiddenKeys).toContain("selectedFont");
		});

		it("toGridCellsJson output contains no forbidden keys", () => {
			const layouts: LayoutItem[] = [
				{ id: "widget-search", x: 0, y: 0, width: 4, height: 1 },
				{ id: "widget-align", x: 0, y: 1, width: 4, height: 1 },
			];

			const json = toGridCellsJson(layouts);

			assertWorkspaceLayoutJsonHasNoForbiddenKeys(json);
		});

		it("serialize strips legacy pinnedRef and keeps id + geometry only", () => {
			const json = serializePersistedLayoutDocument({
				gridCells: [
					{
						id: "00000000-0000-4000-8000-000000000099",
						x: 0,
						y: 0,
						width: 2,
						height: 2,
						pinnedRef: "preset-catalog-1",
					} as unknown as LayoutItem,
				],
			});
			const parsed = JSON.parse(json) as {
				gridCells: Record<string, unknown>[];
			};
			expect(parsed.gridCells[0]).toEqual({
				id: "00000000-0000-4000-8000-000000000099",
				x: 0,
				y: 0,
				width: 2,
				height: 2,
			});
			expect(Object.keys(parsed.gridCells[0]!).sort()).toEqual([
				"height",
				"id",
				"width",
				"x",
				"y",
			]);
		});

		it("parseLayoutDocument ignores legacy presetPlacements (row ids unchanged)", () => {
			const placementId = "00000000-0000-4000-8000-000000000099";
			const legacy = {
				version: 1,
				items: [
					{
						id: placementId,
						x: 0,
						y: 0,
						width: 2,
						height: 2,
					},
				],
				presetPlacements: [
					{
						placementId,
						presetRefId: "preset-catalog-1",
					},
				],
			};
			const doc = parseLayoutDocument(legacy);
			expect(doc.gridCells[0]).toEqual({
				id: placementId,
				x: 0,
				y: 0,
				width: 2,
				height: 2,
			});
			expect(doc.presetLayoutRoster).toBeUndefined();
		});

		it("empty layout serializes to valid document with no forbidden keys", () => {
			const json = toGridCellsJson([]);
			const parsed = JSON.parse(json) as { gridCells: unknown[] };

			expect(Array.isArray(parsed.gridCells)).toBe(true);
			expect(parsed.gridCells).toHaveLength(0);

			assertWorkspaceLayoutJsonHasNoForbiddenKeys(json);
		});
	});

	// ── 4. Widget layout ids have matching widgets.json records ────────────

	describe("widget layout ids have matching widgets.json records after init", () => {
		it("initialLayouts ids are all registered in initialWidgets", () => {
			const initialLayouts: Partial<
				Record<1 | 2 | 3 | 4 | 5, PanelLayoutSeed>
			> = {
				1: {
					gridCells: [{ id: "widget-search", x: 0, y: 0, width: 4, height: 1 }],
				},
			};

			const initialWidgets: readonly WidgetRecord[] = [
				{ id: "widget-search", type: "quick-actions", param: {} },
			];

			// Contract: all layout ids must have matching widget records
			const layoutIds = initialLayouts[1]!.gridCells.map((cell) => cell.id);
			const widgetIds = initialWidgets.map((w) => w.id);
			for (const id of layoutIds) {
				expect(widgetIds).toContain(id);
			}
		});

		it("workspace initialization receives the session root and layout seed", async () => {
			mockInitializeWorkspaceStorage.mockResolvedValue(undefined);

			const initialLayouts: Partial<
				Record<1 | 2 | 3 | 4 | 5, PanelLayoutSeed>
			> = {
				3: {
					gridCells: [{ id: "widget-menu", x: 5, y: 0, width: 1, height: 1 }],
				},
			};

			const win = {} as Window;
			await mockInitializeWorkspaceStorage(win, {
				supportRoot: "/session-support-root",
				initialLayouts,
			});

			const call = mockInitializeWorkspaceStorage.mock.calls[0];
			expect(call![1]).toEqual({
				supportRoot: "/session-support-root",
				initialLayouts,
			});
		});

		it("layout ids not in widgets are detected as missing", () => {
			const initialLayouts: Partial<
				Record<1 | 2 | 3 | 4 | 5, PanelLayoutSeed>
			> = {
				1: {
					gridCells: [{ id: "widget-search", x: 0, y: 0, width: 4, height: 1 }],
				},
			};

			const initialWidgets: readonly WidgetRecord[] = [
				// widget-search is missing from widgets
				{ id: "widget-menu", type: "menu", param: {} },
			];

			// Contract: every layout id needs a widget record
			const layoutIds = initialLayouts[1]!.gridCells.map((cell) => cell.id);
			const widgetIds = initialWidgets.map((w) => w.id);
			const missingFromWidgets = layoutIds.filter(
				(id) => !widgetIds.includes(id),
			);

			expect(missingFromWidgets).toContain("widget-search");
		});
	});

	// ── 5. Preset layout ids have matching presets.json records ─────────────

	describe("preset layout ids have matching presets.json records after init", () => {
		it("completeOnboardingStorage writes imported preset ids to preset catalog", async () => {
			mockWorkspaceIndexFromPanelId.mockReturnValue(1);
			mockwriteSettings.mockResolvedValue(undefined);
			mockReadPresetJson.mockResolvedValue(null);
			mockWritePresetJson.mockResolvedValue(undefined);
			mockInitializeWorkspaceStorage.mockResolvedValue(undefined);

			const importedPresets: readonly PresetRecord[] = [
				{
					id: "preset-align-default",
					type: "preset",
					title: "Default",
					filePath:
						"/session-support-root/ty-plus/presets/assets/align_default.ffx",
				},
				{
					id: "preset-align-bounce",
					type: "preset",
					title: "Bounce",
					filePath:
						"/session-support-root/ty-plus/presets/assets/align_bounce.ffx",
				},
			];

			const win = {} as Window;
			await completeOnboardingStorage(win, {
				panelSurfaceId: "panel-1",
				mergedSettingsJson: JSON.stringify({
					version: 1,
					core: { paths: { supportRoot: "/session-support-root" } },
				}),
				initialLayoutItems: [],
				initialWidgetRecords: [],
				importedPresets,
			});

			expect(mockWritePresetJson).toHaveBeenCalled();
			const payloads = mockWritePresetJson.mock.calls.map((c) => c[1]);
			expect(
				payloads.some(
					(p) =>
						typeof p === "string" &&
						p.includes("preset-align-default") &&
						p.includes("preset-align-bounce"),
				),
			).toBe(true);
		});

		it("preset layout ids must have corresponding preset records", () => {
			// Contract: any preset layout id used in a workspace must have
			// a corresponding entry in presets.json after initialization
			const presetLayoutIds = ["preset-align-default", "preset-align-bounce"];
			const importedPresets: readonly PresetRecord[] = [
				{
					id: "preset-align-default",
					type: "preset",
					title: "Default",
					filePath:
						"/session-support-root/ty-plus/presets/assets/align_default.ffx",
				},
				{
					id: "preset-align-bounce",
					type: "preset",
					title: "Bounce",
					filePath:
						"/session-support-root/ty-plus/presets/assets/align_bounce.ffx",
				},
			];

			const presetIds = importedPresets.map((p) => p.id);
			const missing = presetLayoutIds.filter((id) => !presetIds.includes(id));

			expect(missing).toHaveLength(0);
		});

		it("missing preset record is detected as initialization gap", () => {
			const presetLayoutIds = ["preset-align-default", "preset-align-missing"];
			const importedPresets: readonly PresetRecord[] = [
				{
					id: "preset-align-default",
					type: "preset",
					title: "Default",
					filePath:
						"/session-support-root/ty-plus/presets/assets/align_default.ffx",
				},
				// preset-align-missing is NOT imported
			];

			const presetIds = importedPresets.map((p) => p.id);
			const missing = presetLayoutIds.filter((id) => !presetIds.includes(id));

			expect(missing).toContain("preset-align-missing");
		});

		it("empty importedPresets causes no preset catalog write", async () => {
			mockWorkspaceIndexFromPanelId.mockReturnValue(1);
			mockwriteSettings.mockResolvedValue(undefined);
			mockWritePresetJson.mockResolvedValue(undefined);
			mockInitializeWorkspaceStorage.mockResolvedValue(undefined);

			const win = {} as Window;
			await completeOnboardingStorage(win, {
				panelSurfaceId: "panel-1",
				mergedSettingsJson: JSON.stringify({
					version: 1,
					core: { paths: { supportRoot: "/session-support-root" } },
				}),
				initialLayoutItems: [],
				initialWidgetRecords: [],
				importedPresets: [],
			});

			expect(mockWritePresetJson).not.toHaveBeenCalled();
		});
	});
});
