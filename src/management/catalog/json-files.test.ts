/**
 * Tests for json-files.ts
 * All bytes go through the unified persistence API; these tests mock
 * readJson / writeJson at the persistence boundary.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ensureGroupJson,
	ensurePresetJson,
	ensureWidgetJson,
	readGroupJson,
	readPresetJson,
	readWidgetJson,
	writeGroupJson,
	writePresetJson,
	writeWidgetJson,
} from "./json-files";

const { mockReadJson, mockWriteJson } = vi.hoisted(() => ({
	mockReadJson: vi.fn(),
	mockWriteJson: vi.fn(),
}));

vi.mock("@/management/storage/persistence", () => ({
	readJson: mockReadJson,
	writeJson: mockWriteJson,
}));

const win = {} as Window;

// ── readPresetJson ────────────────────────────────────────────────────────────

describe("readPresetJson", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns JSON text when the catalog file exists", async () => {
		const stored = { version: 1, presets: [{ id: "preset-1", name: "Test" }] };
		mockReadJson.mockResolvedValue(stored);

		const result = await readPresetJson(win);

		expect(result).toBe(JSON.stringify(stored));
	});

	it("returns null when the catalog file is missing", async () => {
		mockReadJson.mockResolvedValue(null);

		const result = await readPresetJson(win);

		expect(result).toBeNull();
	});
});

// ── writePresetJson ───────────────────────────────────────────────────────────

describe("writePresetJson", () => {
	beforeEach(() => vi.clearAllMocks());

	it("writes parsed payload through the persistence API", async () => {
		const jsonText = JSON.stringify({
			version: 1,
			presets: [{ id: "new-preset", name: "New Preset" }],
		});

		await writePresetJson(win, jsonText);

		expect(mockWriteJson).toHaveBeenCalledTimes(1);
		expect(mockWriteJson).toHaveBeenCalledWith(win, "presetCatalog", {
			version: 1,
			presets: [{ id: "new-preset", name: "New Preset" }],
		});
	});
});

// ── ensurePresetJson ──────────────────────────────────────────────────────────

describe("ensurePresetJson", () => {
	beforeEach(() => vi.clearAllMocks());

	it("creates an empty catalog when file is absent", async () => {
		mockReadJson.mockResolvedValue(null);

		await ensurePresetJson(win);

		expect(mockWriteJson).toHaveBeenCalledTimes(1);
		expect(mockWriteJson).toHaveBeenCalledWith(win, "presetCatalog", {
			version: 1,
			presets: [],
		});
	});

	it("does not overwrite an existing catalog", async () => {
		mockReadJson.mockResolvedValue({
			version: 1,
			presets: [{ id: "existing", name: "Existing Preset" }],
		});

		await ensurePresetJson(win);

		expect(mockWriteJson).not.toHaveBeenCalled();
	});
});

// ── readGroupJson ─────────────────────────────────────────────────────────────

describe("readGroupJson", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns JSON text when the catalog file exists", async () => {
		const stored = { version: 1, groups: [{ id: "group-1", label: "Test" }] };
		mockReadJson.mockResolvedValue(stored);

		const result = await readGroupJson(win);

		expect(result).toBe(JSON.stringify(stored));
	});

	it("returns null when the catalog file is missing", async () => {
		mockReadJson.mockResolvedValue(null);

		const result = await readGroupJson(win);

		expect(result).toBeNull();
	});
});

// ── writeGroupJson ────────────────────────────────────────────────────────────

describe("writeGroupJson", () => {
	beforeEach(() => vi.clearAllMocks());

	it("writes parsed payload through the persistence API", async () => {
		const jsonText = JSON.stringify({
			version: 1,
			groups: [{ id: "new-group", label: "New Group" }],
		});

		await writeGroupJson(win, jsonText);

		expect(mockWriteJson).toHaveBeenCalledTimes(1);
		expect(mockWriteJson).toHaveBeenCalledWith(win, "groupCatalog", {
			version: 1,
			groups: [{ id: "new-group", label: "New Group" }],
		});
	});
});

// ── ensureGroupJson ───────────────────────────────────────────────────────────

describe("ensureGroupJson", () => {
	beforeEach(() => vi.clearAllMocks());

	it("creates an empty catalog when file is absent", async () => {
		mockReadJson.mockResolvedValue(null);

		await ensureGroupJson(win);

		expect(mockWriteJson).toHaveBeenCalledTimes(1);
		expect(mockWriteJson).toHaveBeenCalledWith(win, "groupCatalog", {
			version: 1,
			groups: [],
		});
	});

	it("does not overwrite an existing catalog", async () => {
		mockReadJson.mockResolvedValue({
			version: 1,
			groups: [{ id: "existing", label: "Existing Group" }],
		});

		await ensureGroupJson(win);

		expect(mockWriteJson).not.toHaveBeenCalled();
	});
});

// ── readWidgetJson ────────────────────────────────────────────────────────────

describe("readWidgetJson", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns JSON text when the catalog file exists", async () => {
		const stored = { version: 1, widgets: [{ id: "widget-1", type: "test" }] };
		mockReadJson.mockResolvedValue(stored);

		const result = await readWidgetJson(win);

		expect(result).toBe(JSON.stringify(stored));
	});

	it("returns null when the catalog file is missing", async () => {
		mockReadJson.mockResolvedValue(null);

		const result = await readWidgetJson(win);

		expect(result).toBeNull();
	});
});

// ── writeWidgetJson ───────────────────────────────────────────────────────────

describe("writeWidgetJson", () => {
	beforeEach(() => vi.clearAllMocks());

	it("writes parsed payload through the persistence API", async () => {
		const jsonText = JSON.stringify({
			version: 1,
			widgets: [{ id: "new-widget", type: "test" }],
		});

		await writeWidgetJson(win, jsonText);

		expect(mockWriteJson).toHaveBeenCalledTimes(1);
		expect(mockWriteJson).toHaveBeenCalledWith(win, "widgetRecords", {
			version: 1,
			widgets: [{ id: "new-widget", type: "test" }],
		});
	});
});

// ── ensureWidgetJson ──────────────────────────────────────────────────────────

describe("ensureWidgetJson", () => {
	beforeEach(() => vi.clearAllMocks());

	it("creates an empty catalog when file is absent", async () => {
		mockReadJson.mockResolvedValue(null);

		await ensureWidgetJson(win);

		expect(mockWriteJson).toHaveBeenCalledTimes(1);
		expect(mockWriteJson).toHaveBeenCalledWith(win, "widgetRecords", {
			version: 1,
			widgets: [],
		});
	});

	it("does not overwrite an existing catalog", async () => {
		mockReadJson.mockResolvedValue({
			version: 1,
			widgets: [{ id: "existing", type: "test" }],
		});

		await ensureWidgetJson(win);

		expect(mockWriteJson).not.toHaveBeenCalled();
	});
});
