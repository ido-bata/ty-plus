/**
 * Tests for records-file.ts
 * All bytes go through the unified persistence API; these tests mock
 * readJson / writeJson at the persistence boundary.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetRecord } from "../record/types";
import {
	ensureWidgetRecordsFile,
	readWidgetRecords,
	upsertWidgetRecords,
	writeWidgetRecords,
} from "./records-file";

const { mockReadJson, mockWriteJson } = vi.hoisted(() => ({
	mockReadJson: vi.fn(),
	mockWriteJson: vi.fn(),
}));

vi.mock("@/management/storage/persistence", () => ({
	readJson: mockReadJson,
	writeJson: mockWriteJson,
}));

const win = {} as Window;

// ── readWidgetRecords ─────────────────────────────────────────────────────────

describe("readWidgetRecords", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns widget records when file exists with valid content", async () => {
		mockReadJson.mockResolvedValue({
			version: 1,
			widgets: [
				{ id: "widget-1", type: "search", param: { query: "test" } },
				{ id: "widget-2", type: "menu", param: {} },
			],
		});

		const result = await readWidgetRecords(win);

		expect(result).toHaveLength(2);
		expect(result[0].id).toBe("widget-1");
		// legacy "search" type is normalized to "quick-actions"
		expect(result[0].type).toBe("quick-actions");
		expect(result[1].id).toBe("widget-2");
		expect(result[1].type).toBe("menu");
	});

	it("returns empty array when file is missing", async () => {
		mockReadJson.mockResolvedValue(null);

		const result = await readWidgetRecords(win);

		expect(result).toHaveLength(0);
	});

	it("returns empty array when widgets array is missing", async () => {
		mockReadJson.mockResolvedValue({ version: 1 });

		const result = await readWidgetRecords(win);

		expect(result).toHaveLength(0);
	});

	it("filters out records with invalid widget types", async () => {
		mockReadJson.mockResolvedValue({
			version: 1,
			widgets: [
				{ id: "valid-widget", type: "quick-actions", param: {} },
				{ id: "invalid-widget", type: "not-a-widget-type", param: {} },
			],
		});

		const result = await readWidgetRecords(win);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("valid-widget");
	});
});

// ── writeWidgetRecords ────────────────────────────────────────────────────────

describe("writeWidgetRecords", () => {
	beforeEach(() => vi.clearAllMocks());

	it("writes widget records through the persistence API", async () => {
		const records: WidgetRecord[] = [
			{ id: "widget-1", type: "quick-actions", param: { query: "test" } },
		];

		await writeWidgetRecords(win, records);

		expect(mockWriteJson).toHaveBeenCalledTimes(1);
		expect(mockWriteJson).toHaveBeenCalledWith(win, "widgetRecords", {
			version: 1,
			widgets: records,
		});
	});
});

// ── ensureWidgetRecordsFile ───────────────────────────────────────────────────

describe("ensureWidgetRecordsFile", () => {
	beforeEach(() => vi.clearAllMocks());

	it("creates file with empty structure when missing", async () => {
		mockReadJson.mockResolvedValue(null);

		await ensureWidgetRecordsFile(win);

		expect(mockWriteJson).toHaveBeenCalledTimes(1);
		expect(mockWriteJson).toHaveBeenCalledWith(win, "widgetRecords", {
			version: 1,
			widgets: [],
		});
	});

	it("does not overwrite when file already exists with content", async () => {
		mockReadJson.mockResolvedValue({
			version: 1,
			widgets: [{ id: "existing", type: "quick-actions", param: {} }],
		});

		await ensureWidgetRecordsFile(win);

		expect(mockWriteJson).not.toHaveBeenCalled();
	});
});

// ── upsertWidgetRecords ───────────────────────────────────────────────────────

describe("upsertWidgetRecords", () => {
	beforeEach(() => vi.clearAllMocks());

	it("adds new records when file does not exist", async () => {
		mockReadJson.mockResolvedValue(null);

		const records: WidgetRecord[] = [
			{ id: "new-widget", type: "quick-actions", param: {} },
		];
		await upsertWidgetRecords(win, records);

		expect(mockWriteJson).toHaveBeenCalledTimes(1);
		expect(mockWriteJson).toHaveBeenCalledWith(win, "widgetRecords", {
			version: 1,
			widgets: records,
		});
	});

	it("merges records by id, updating existing entries", async () => {
		mockReadJson.mockResolvedValue({
			version: 1,
			widgets: [
				{ id: "widget-1", type: "quick-actions", param: { query: "old" } },
				{ id: "widget-2", type: "menu", param: {} },
			],
		});

		const records: WidgetRecord[] = [
			{ id: "widget-1", type: "quick-actions", param: { query: "updated" } },
			{ id: "widget-3", type: "align", param: {} },
		];
		await upsertWidgetRecords(win, records);

		expect(mockWriteJson).toHaveBeenCalledTimes(1);
		const payload = mockWriteJson.mock.calls[0][2] as {
			version: number;
			widgets: WidgetRecord[];
		};
		expect(payload.version).toBe(1);
		expect(payload.widgets).toHaveLength(3);

		const widget1 = payload.widgets.find((w) => w.id === "widget-1");
		expect(widget1?.param.query).toBe("updated");

		const widget2 = payload.widgets.find((w) => w.id === "widget-2");
		expect(widget2).toBeDefined();
		expect(widget2?.type).toBe("menu");

		const widget3 = payload.widgets.find((w) => w.id === "widget-3");
		expect(widget3).toBeDefined();
		expect(widget3?.type).toBe("align");
	});

	it("preserves existing records not mentioned in upsert", async () => {
		mockReadJson.mockResolvedValue({
			version: 1,
			widgets: [
				{ id: "widget-1", type: "quick-actions", param: {} },
				{ id: "widget-2", type: "menu", param: {} },
			],
		});

		const records: WidgetRecord[] = [
			{ id: "widget-1", type: "quick-actions", param: { updated: true } },
		];
		await upsertWidgetRecords(win, records);

		expect(mockWriteJson).toHaveBeenCalledTimes(1);
		const payload = mockWriteJson.mock.calls[0][2] as {
			widgets: WidgetRecord[];
		};
		const ids = payload.widgets.map((w) => w.id);
		expect(ids).toContain("widget-1");
		expect(ids).toContain("widget-2");
	});
});
