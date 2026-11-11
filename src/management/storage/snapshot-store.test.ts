/**
 * Tests for snapshot-store.ts
 * Proves: new-read-first, legacy-fallback, new-write-only via persistence API.
 */

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { readSnapshots, writeSnapshots } from "./snapshot-store";

// ── Snapshot test fixtures ────────────────────────────────────────────────────

const SNAPSHOT_A: import("./snapshot-store").WorkspaceSnapshot = {
	id: "snap-a",
	label: "Morning",
	createdAt: "2026-01-01T00:00:00.000Z",
	panels: {},
	widgets: [],
	workspacePresetLayouts: {},
};

const SNAPSHOT_B: import("./snapshot-store").WorkspaceSnapshot = {
	id: "snap-b",
	label: "Afternoon",
	createdAt: "2026-01-02T00:00:00.000Z",
	panels: {},
	widgets: [],
	workspacePresetLayouts: {},
};

// ── Persistence API mocks ────────────────────────────────────────────────────

let mockReadJsonText: Mock<
	(win: Window, key: string, ...args: unknown[]) => Promise<string | null>
>;
let mockWriteJson: Mock<
	(
		win: Window,
		key: string,
		payload: unknown,
		...args: unknown[]
	) => Promise<void>
>;
let mockReadSettings: Mock<(win: Window) => Promise<string | null>>;

vi.mock("@/management/storage/persistence", () => ({
	get readJsonText() {
		return mockReadJsonText;
	},
	get writeJson() {
		return mockWriteJson;
	},
}));

vi.mock("@/management/storage/workspace/store", () => ({
	get readSettings() {
		return mockReadSettings;
	},
	normalizeWorkspacePanelSettingsKey: (key: string) =>
		key.startsWith("panel-") ? key : `panel-${key}`,
}));

beforeEach(() => {
	mockReadJsonText = vi.fn().mockResolvedValue(null);
	mockWriteJson = vi.fn().mockResolvedValue(undefined);
	mockReadSettings = vi.fn().mockResolvedValue(null);
});

// ── readSnapshots ────────────────────────────────────────────────────────────

describe("readSnapshots", () => {
	it("new-read-first: returns snapshots from new history file when it exists", async () => {
		mockReadJsonText.mockResolvedValue(
			JSON.stringify([SNAPSHOT_A, SNAPSHOT_B]),
		);

		const result = await readSnapshots({} as Window, "panel-1");

		expect(result).toEqual([SNAPSHOT_A, SNAPSHOT_B]);
		expect(mockReadJsonText).toHaveBeenCalledTimes(1);
		expect(mockReadJsonText).toHaveBeenCalledWith({}, "snapshots");
	});

	it("legacy-fallback: falls back to settings.json when new history file is missing", async () => {
		mockReadJsonText.mockResolvedValue(null);
		mockReadSettings.mockResolvedValue(
			JSON.stringify({
				workspace: {
					snapshots: {
						"panel-1": [SNAPSHOT_A],
					},
				},
			}),
		);

		const result = await readSnapshots({} as Window, "panel-1");

		expect(mockReadJsonText).toHaveBeenCalledTimes(1);
		expect(mockReadSettings).toHaveBeenCalledTimes(1);
		expect(result).toEqual([SNAPSHOT_A]);
	});

	it("returns empty array when both new and legacy are missing", async () => {
		mockReadJsonText.mockResolvedValue(null);
		mockReadSettings.mockResolvedValue(null);

		const result = await readSnapshots({} as Window, "panel-1");

		expect(result).toEqual([]);
	});

	it("returns empty array for empty panelId when new file is missing", async () => {
		mockReadJsonText.mockResolvedValue(null);
		mockReadSettings.mockResolvedValue(null);

		const result = await readSnapshots({} as Window, "");

		expect(result).toEqual([]);
	});

	it("ignores panelId in path resolution (shared file)", async () => {
		mockReadJsonText.mockResolvedValue(JSON.stringify([SNAPSHOT_A]));

		await readSnapshots({} as Window, "panel-2");
		await readSnapshots({} as Window, "panel-3");

		expect(mockReadJsonText).toHaveBeenNthCalledWith(1, {}, "snapshots");
		expect(mockReadJsonText).toHaveBeenNthCalledWith(2, {}, "snapshots");
	});

	it("returns empty array when the new file body is an object, not an array", async () => {
		mockReadJsonText.mockResolvedValue(JSON.stringify({ not: "an array" }));
		mockReadSettings.mockResolvedValue(null);

		const result = await readSnapshots({} as Window, "panel-1");

		expect(result).toEqual([]);
	});

	it("returns empty array when the new file body is malformed JSON", async () => {
		mockReadJsonText.mockResolvedValue("{ not json");
		mockReadSettings.mockResolvedValue(null);

		const result = await readSnapshots({} as Window, "panel-1");

		expect(result).toEqual([]);
	});
});

// ── writeSnapshots ───────────────────────────────────────────────────────────

describe("writeSnapshots", () => {
	it("writes via the persistence API under the 'snapshots' key", async () => {
		await writeSnapshots({} as Window, "panel-3", [SNAPSHOT_A]);

		expect(mockWriteJson).toHaveBeenCalledTimes(1);
		expect(mockWriteJson).toHaveBeenCalledWith({}, "snapshots", [SNAPSHOT_A]);
	});

	it("does not depend on panelId for path resolution (shared file)", async () => {
		await writeSnapshots({} as Window, "panel-1", [SNAPSHOT_B]);

		expect(mockWriteJson).toHaveBeenCalledWith({}, "snapshots", [SNAPSHOT_B]);
	});

	it("writes empty array when no snapshots provided", async () => {
		await writeSnapshots({} as Window, "panel-1", []);

		expect(mockWriteJson).toHaveBeenCalledWith({}, "snapshots", []);
	});
});
