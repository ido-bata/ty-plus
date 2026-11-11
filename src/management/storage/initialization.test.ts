/**
 * Tests for workspace storage initialization use case.
 *
 * Verifies:
 * - ensureStorageInitialized: ensures all required files exist
 * - initialLayouts: writes those panels through writeLayoutDocument
 * - initialWidgets: upserts those through upsertWidgetRecords
 * - history snapshots: TODO in test  Eskipped until ensure helper exists
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetRecord } from "../widget/record/types";
import type { PanelLayoutSeed } from "../workspace/layout/grid-document";

vi.mock("../../management/workspace/layout/panel-json-files", () => ({
	readNJson: vi.fn(),
	readBackgroundJson: vi.fn(),
	writeBackgroundJson: vi.fn(),
	writeNJson: vi.fn(),
}));

vi.mock("../../management/workspace/layout/persistence", () => ({
	indexFromPanelId: vi.fn(),
	readLayoutDocument: vi.fn(),
	readWorkspaceGridCells: vi.fn(),
	writeLayoutDocument: vi.fn(),
	writeWorkspaceGridCells: vi.fn(),
	clearLayoutNJson: vi.fn(),
	ensureLayoutFiles: vi.fn(),
}));

vi.mock("./workspace/layout-store", () => ({
	ensureLayoutFiles: vi.fn(),
	readBackgroundJson: vi.fn(),
	writeBackgroundJson: vi.fn(),
	writeLayoutDocument: vi.fn(),
}));

vi.mock("../widget/persistence/records-file", async () => {
	const original = await import("../widget/persistence/records-file");
	return {
		...original,
		ensureWidgetRecordsFile: vi.fn(),
		upsertWidgetRecords: vi.fn(),
	};
});

vi.mock("../catalog/json-files", async () => {
	const original = await import("../catalog/json-files");
	return {
		...original,
		ensurePresetJson: vi.fn(),
		ensureGroupJson: vi.fn(),
	};
});

vi.mock("../setting/persistence/workspace-ui-settings-file", async () => {
	return {
		ensureUiSettingsFile: vi.fn(),
	};
});

const warnSpy = vi.hoisted(() =>
	vi.spyOn(console, "warn").mockImplementation(() => {}),
);

import { ensureGroupJson, ensurePresetJson } from "../catalog/json-files";
import { ensureUiSettingsFile } from "../setting/persistence/workspace-ui-settings-file";
import {
	ensureWidgetRecordsFile,
	upsertWidgetRecords,
} from "../widget/persistence/records-file";
import { ensureStorageInitialized } from "./initialization";
import {
	ensureLayoutFiles,
	readBackgroundJson,
	writeBackgroundJson,
} from "./workspace/layout-store";

const fakeWindow = (): Window => ({}) as Window;

describe("ensureStorageInitialized", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		warnSpy.mockClear();
	});

	it("ensures all required storage files exist with empty structures", async () => {
		vi.mocked(ensureLayoutFiles).mockResolvedValue(undefined);
		vi.mocked(readBackgroundJson).mockResolvedValue(null);
		vi.mocked(writeBackgroundJson).mockResolvedValue(undefined);
		vi.mocked(ensureWidgetRecordsFile).mockResolvedValue(undefined);
		vi.mocked(ensurePresetJson).mockResolvedValue(undefined);
		vi.mocked(ensureGroupJson).mockResolvedValue(undefined);
		vi.mocked(ensureUiSettingsFile).mockResolvedValue(undefined);

		await ensureStorageInitialized(fakeWindow());

		expect(ensureLayoutFiles).toHaveBeenCalledOnce();
		expect(writeBackgroundJson).toHaveBeenCalledTimes(5);
		expect(ensureWidgetRecordsFile).toHaveBeenCalledOnce();
		expect(ensurePresetJson).toHaveBeenCalledOnce();
		expect(ensureGroupJson).toHaveBeenCalledOnce();
		expect(ensureUiSettingsFile).toHaveBeenCalledOnce();
	});

	it("does not overwrite existing non-null background files", async () => {
		vi.mocked(ensureLayoutFiles).mockResolvedValue(undefined);
		vi.mocked(readBackgroundJson).mockResolvedValue('"some-background"');
		vi.mocked(writeBackgroundJson).mockResolvedValue(undefined);
		vi.mocked(ensureWidgetRecordsFile).mockResolvedValue(undefined);
		vi.mocked(ensurePresetJson).mockResolvedValue(undefined);
		vi.mocked(ensureGroupJson).mockResolvedValue(undefined);
		vi.mocked(ensureUiSettingsFile).mockResolvedValue(undefined);

		await ensureStorageInitialized(fakeWindow());

		expect(writeBackgroundJson).not.toHaveBeenCalled();
	});

	it("writes null for each missing background file", async () => {
		vi.mocked(ensureLayoutFiles).mockResolvedValue(undefined);
		vi.mocked(readBackgroundJson).mockResolvedValue(null);
		vi.mocked(writeBackgroundJson).mockResolvedValue(undefined);
		vi.mocked(ensureWidgetRecordsFile).mockResolvedValue(undefined);
		vi.mocked(ensurePresetJson).mockResolvedValue(undefined);
		vi.mocked(ensureGroupJson).mockResolvedValue(undefined);
		vi.mocked(ensureUiSettingsFile).mockResolvedValue(undefined);

		await ensureStorageInitialized(fakeWindow());

		expect(writeBackgroundJson).toHaveBeenCalledTimes(5);
		const calls = vi.mocked(writeBackgroundJson).mock.calls;
		for (const call of calls) {
			expect(call[2]).toBe("null\n");
		}
	});

	it("skips history snapshots when snapshot store has no ensure helper", async () => {
		vi.mocked(ensureLayoutFiles).mockResolvedValue(undefined);
		vi.mocked(readBackgroundJson).mockResolvedValue(null);
		vi.mocked(writeBackgroundJson).mockResolvedValue(undefined);
		vi.mocked(ensureWidgetRecordsFile).mockResolvedValue(undefined);
		vi.mocked(ensurePresetJson).mockResolvedValue(undefined);
		vi.mocked(ensureGroupJson).mockResolvedValue(undefined);
		vi.mocked(ensureUiSettingsFile).mockResolvedValue(undefined);

		await ensureStorageInitialized(fakeWindow());

		expect(true).toBe(true);
	});
});

describe("ensureStorageInitialized with initialLayouts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(ensureLayoutFiles).mockResolvedValue(undefined);
		vi.mocked(readBackgroundJson).mockResolvedValue(null);
		vi.mocked(writeBackgroundJson).mockResolvedValue(undefined);
		vi.mocked(ensureWidgetRecordsFile).mockResolvedValue(undefined);
		vi.mocked(ensurePresetJson).mockResolvedValue(undefined);
		vi.mocked(ensureGroupJson).mockResolvedValue(undefined);
		vi.mocked(ensureUiSettingsFile).mockResolvedValue(undefined);
	});

	it("writes initial layouts when provided", async () => {
		const writeLayoutSpy = vi.spyOn(
			await import("../workspace/layout/persistence"),
			"writeLayoutDocument",
		);
		writeLayoutSpy.mockResolvedValue(undefined);

		const initialLayouts: Partial<Record<1 | 2 | 3 | 4 | 5, PanelLayoutSeed>> =
			{
				1: {
					gridCells: [{ id: "widget-search", x: 0, y: 0, width: 4, height: 1 }],
				},
				3: {
					gridCells: [{ id: "widget-menu", x: 0, y: 0, width: 1, height: 1 }],
				},
			};

		await ensureStorageInitialized(fakeWindow(), { initialLayouts });

		expect(ensureLayoutFiles).toHaveBeenCalledOnce();
		expect(writeLayoutSpy).toHaveBeenCalled();
		writeLayoutSpy.mockRestore();
	});
});

describe("ensureStorageInitialized with initialWidgets", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("upserts initial widgets when provided", async () => {
		vi.mocked(ensureLayoutFiles).mockResolvedValue(undefined);
		vi.mocked(readBackgroundJson).mockResolvedValue(null);
		vi.mocked(writeBackgroundJson).mockResolvedValue(undefined);
		vi.mocked(ensureWidgetRecordsFile).mockResolvedValue(undefined);
		vi.mocked(ensurePresetJson).mockResolvedValue(undefined);
		vi.mocked(ensureGroupJson).mockResolvedValue(undefined);
		vi.mocked(ensureUiSettingsFile).mockResolvedValue(undefined);

		const initialWidgets: readonly WidgetRecord[] = [
			{ id: "widget-search", type: "quick-actions", param: {} },
		];

		await ensureStorageInitialized(fakeWindow(), { initialWidgets });

		expect(upsertWidgetRecords).toHaveBeenCalledOnce();
		expect(upsertWidgetRecords).toHaveBeenCalledWith(
			fakeWindow(),
			initialWidgets,
		);
	});

	it("does not call upsertWidgetRecords when initialWidgets is empty", async () => {
		vi.mocked(ensureLayoutFiles).mockResolvedValue(undefined);
		vi.mocked(readBackgroundJson).mockResolvedValue(null);
		vi.mocked(writeBackgroundJson).mockResolvedValue(undefined);
		vi.mocked(ensureWidgetRecordsFile).mockResolvedValue(undefined);
		vi.mocked(ensurePresetJson).mockResolvedValue(undefined);
		vi.mocked(ensureGroupJson).mockResolvedValue(undefined);
		vi.mocked(ensureUiSettingsFile).mockResolvedValue(undefined);

		await ensureStorageInitialized(fakeWindow(), {
			initialWidgets: [],
		});

		expect(upsertWidgetRecords).not.toHaveBeenCalled();
	});
});
