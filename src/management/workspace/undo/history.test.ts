/**
 * Tests for history.ts snapshot routing to snapshot-store.
 * Proves: snapshot writes do not modify settings.json.
 */

import {
	beforeEach,
	describe,
	expect,
	it,
	type MockedFunction,
	vi,
} from "vitest";
import type {
	readSnapshots,
	WorkspaceSnapshot,
	writeSnapshots,
} from "@/management/storage/snapshot-store";
import { LayoutUndoStack } from "./cache-stack";
import { createHistoryManager } from "./history";

// ── Snapshot test fixtures ────────────────────────────────────────────────────

const SNAP_A = {
	id: "snap-a",
	label: "Morning",
	createdAt: "2026-01-01T00:00:00.000Z",
	widgets: [],
	panels: {},
	workspacePresetLayouts: {},
} satisfies WorkspaceSnapshot;

const fakeFsModule = {
	promises: {
		readFile: async () => {
			throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		},
		writeFile: async () => undefined,
		mkdir: async () => undefined,
	},
	readFileSync: () => {
		throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
	},
	writeFileSync: () => undefined,
	mkdirSync: () => undefined,
};

// ── Fake window ────────────────────────────────────────────────────────────────

const fakeWindow = () =>
	({
		__adobe_cep__: {
			getSystemPath: (pathId: string) => {
				if (pathId === "support") return "C:/support";
				return "";
			},
		},
		cep_node: { require: () => fakeFsModule },
	}) as unknown as Window;

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockReadSnapshots: MockedFunction<typeof readSnapshots>;
let mockWriteSnapshots: MockedFunction<typeof writeSnapshots>;
let settingsWriteCallCount = 0;
let settingsWriteCallArgs: unknown[] = [];

// ── Mock snapshot-store ───────────────────────────────────────────────────────

vi.mock("../../storage/snapshot-store", () => ({
	get readSnapshots() {
		return mockReadSnapshots;
	},
	get writeSnapshots() {
		return mockWriteSnapshots;
	},
}));

// ── Mock panel-json-files (readNJson called by saveSnapshot) ──────────────────

const mockReadNJson = vi.fn().mockResolvedValue(null);
vi.mock("@/management/workspace/layout/panel-json-files", () => ({
	readNJson: (...args: unknown[]) =>
		(mockReadNJson as (...a: unknown[]) => unknown)(...args),
	parseLayoutDocument: vi.fn(),
	panelJsonFileForRead: vi.fn(),
	panelJsonFileForWrite: vi.fn(),
}));

// ── Mock layout-undo-cache (Bug 6 cache integration) ──────────────────────────

const mockInitLayoutUndoCache = vi.fn();
const mockLoadLayoutUndoStack = vi.fn();
const mockSaveLayoutUndoStack = vi.fn();
vi.mock("./layout-undo-cache", () => ({
	initLayoutUndoCache: (...args: unknown[]) =>
		(mockInitLayoutUndoCache as (...a: unknown[]) => unknown)(...args),
	loadLayoutUndoStack: (...args: unknown[]) =>
		(mockLoadLayoutUndoStack as (...a: unknown[]) => unknown)(...args),
	saveLayoutUndoStack: (...args: unknown[]) =>
		(mockSaveLayoutUndoStack as (...a: unknown[]) => unknown)(...args),
}));

// Mock persistence-root so resolveWorkspacePersistenceManagedRoot returns a valid
// path; the real implementation needs CEP fs + a locator file that we don't
// provide in the test environment.
vi.mock("@/management/workspace/layout/persistence-root", () => ({
	resolveWorkspacePersistenceManagedRoot: vi
		.fn()
		.mockResolvedValue("C:/support/ty-plus"),
}));

// ── Mock json-file-store (not called by snapshot-store in this path,
///  but kept for workspace-store mock below)

vi.mock("../../storage/json-file-store", () => ({
	readJsonFileText: vi.fn().mockResolvedValue(null),
	writeJsonFileText: vi.fn().mockResolvedValue(undefined),
	parseJsonObject: JSON.parse,
	stringifyJson: (v: unknown) => `${JSON.stringify(v, null, 2)}\n`,
}));

// ── Mock workspace-store (settings.json I/O  Emust NOT be called for snapshots) ─

vi.mock("../../storage/workspace-store", () => ({
	get readSettings() {
		return vi.fn().mockResolvedValue("{}");
	},
	get writeSettings() {
		return vi.fn().mockImplementation((_win: Window, data: string) => {
			settingsWriteCallCount++;
			settingsWriteCallArgs.push(data);
		});
	},
}));

beforeEach(() => {
	mockReadSnapshots = vi.fn<typeof readSnapshots>().mockResolvedValue([]);
	mockWriteSnapshots = vi
		.fn<typeof writeSnapshots>()
		.mockResolvedValue(undefined);
	mockReadNJson.mockReset();
	mockReadNJson.mockResolvedValue(null);
	mockInitLayoutUndoCache.mockReset();
	mockInitLayoutUndoCache.mockResolvedValue(undefined);
	mockLoadLayoutUndoStack.mockReset();
	mockLoadLayoutUndoStack.mockResolvedValue(null);
	mockSaveLayoutUndoStack.mockReset();
	mockSaveLayoutUndoStack.mockResolvedValue(undefined);
	settingsWriteCallCount = 0;
	settingsWriteCallArgs = [];
});

// ── saveSnapshot ───────────────────────────────────────────────────────────────

describe("saveSnapshot", () => {
	it("writes only to history file, not settings.json", async () => {
		const written: WorkspaceSnapshot[][] = [];
		mockWriteSnapshots = vi
			.fn<typeof writeSnapshots>()
			.mockImplementation(async (_w, _p, snaps) => {
				written.push(snaps);
			});

		const history = createHistoryManager("panel-1", fakeWindow());
		await history.saveSnapshot([], "test");

		expect(written).toHaveLength(1);
		// Written to snapshot-store (history file), not workspace-store (settings.json)
		expect(settingsWriteCallCount).toBe(0);
	});

	it("resolves to void", async () => {
		mockWriteSnapshots = vi
			.fn<typeof writeSnapshots>()
			.mockResolvedValue(undefined);

		const history = createHistoryManager("panel-1", fakeWindow());
		const result = history.saveSnapshot([]);
		await expect(result).resolves.toBeUndefined();
	});

	it("captures each panel's grid cells from workspace-N.json (not empty arrays)", async () => {
		const writeCalls: WorkspaceSnapshot[][] = [];
		mockWriteSnapshots = vi
			.fn<typeof writeSnapshots>()
			.mockImplementation(async (_w, _p, snaps) => {
				writeCalls.push(snaps);
			});
		// panel-1 and panel-2 have content on disk; panel-3..5 are missing.
		mockReadNJson.mockImplementation(async (_w: Window, idx: number) => {
			if (idx === 1) {
				return JSON.stringify({
					gridCells: [{ id: "w1", x: 0, y: 0, width: 2, height: 1 }],
				});
			}
			if (idx === 2) {
				return JSON.stringify({
					gridCells: [
						{ id: "w2a", x: 0, y: 0, width: 1, height: 1 },
						{ id: "w2b", x: 1, y: 0, width: 1, height: 1 },
					],
				});
			}
			return null;
		});

		const history = createHistoryManager("panel-1", fakeWindow());
		await history.saveSnapshot([], "with-content");

		const last = writeCalls[writeCalls.length - 1] as Array<{
			panels: Record<string, Array<{ id: string }>>;
		}>;
		const panels = last[0].panels;
		expect(panels["panel-1"].map((c) => c.id)).toEqual(["w1"]);
		expect(panels["panel-2"].map((c) => c.id)).toEqual(["w2a", "w2b"]);
		// Panels with no on-disk file fall back to [] (no in-memory data either
		// because we passed an empty widgets array).
		expect(panels["panel-3"]).toEqual([]);
	});
});

// ── listSnapshots ─────────────────────────────────────────────────────────────

describe("listSnapshots", () => {
	it("reads from snapshot-store", async () => {
		mockReadSnapshots = vi
			.fn<typeof readSnapshots>()
			.mockResolvedValue([SNAP_A]);

		const history = createHistoryManager("panel-1", fakeWindow());
		const snaps = await history.listSnapshots();

		expect(snaps).toHaveLength(1);
		expect(snaps[0].id).toBe("snap-a");
		expect(mockReadSnapshots).toHaveBeenCalledTimes(1);
		expect(mockReadSnapshots.mock.calls[0][1]).toBe("panel-1");
	});

	it("maps WorkspaceSnapshot to Snapshot type with createdAt", async () => {
		mockReadSnapshots = vi
			.fn<typeof readSnapshots>()
			.mockResolvedValue([SNAP_A]);

		const history = createHistoryManager("panel-1", fakeWindow());
		const snaps = await history.listSnapshots();

		// createdAt is present on history.Snapshot
		expect(snaps[0]).toHaveProperty("createdAt", "2026-01-01T00:00:00.000Z");
		// panels field is present
		expect(snaps[0]).toHaveProperty("panels");
	});
});

// ── deleteSnapshot ────────────────────────────────────────────────────────────

describe("deleteSnapshot", () => {
	it("writes only to history file, not settings.json", async () => {
		let writtenData: WorkspaceSnapshot[] = [];
		mockWriteSnapshots = vi
			.fn<typeof writeSnapshots>()
			.mockImplementation(async (_w, _p, snaps) => {
				writtenData = snaps;
			});
		mockReadSnapshots = vi
			.fn<typeof readSnapshots>()
			.mockResolvedValue([SNAP_A]);

		const history = createHistoryManager("panel-1", fakeWindow());
		await history.deleteSnapshot("snap-a");

		expect(mockWriteSnapshots).toHaveBeenCalledTimes(1);
		// Written data should NOT contain snap-a
		expect(writtenData.some((snapshot) => snapshot.id === "snap-a")).toBe(
			false,
		);

		// settings.json was NOT touched
		expect(settingsWriteCallCount).toBe(0);
	});
});

// ── restoreSnapshot ───────────────────────────────────────────────────────────

describe("restoreSnapshot", () => {
	it("returns panels from found snapshot", async () => {
		const panelWidgets = [
			{
				id: "w1",
				widgetId: "w1",
				widgetType: "info" as const,
				x: 0,
				y: 0,
				width: 2,
				height: 1,
			},
		];
		const snapWithPanels = {
			...SNAP_A,
			panels: { "panel-1": panelWidgets },
		} satisfies WorkspaceSnapshot;
		mockReadSnapshots = vi
			.fn<typeof readSnapshots>()
			.mockResolvedValue([snapWithPanels]);

		const history = createHistoryManager("panel-1", fakeWindow());
		const panels = await history.restoreSnapshot("snap-a");

		expect(panels).not.toBeNull();
		expect(Object.keys(panels!)).toContain("panel-1");
		expect(panels!["panel-1"]).toHaveLength(1);
		expect(panels!["panel-1"][0].id).toBe("w1");
	});

	it("returns null for unknown id", async () => {
		mockReadSnapshots = vi
			.fn<typeof readSnapshots>()
			.mockResolvedValue([SNAP_A]);

		const history = createHistoryManager("panel-1", fakeWindow());
		const widgets = await history.restoreSnapshot("nonexistent");

		expect(widgets).toBeNull();
	});
});

// ── MAX_SNAPSHOTS enforcement ───────────────────────────────────────

describe("MAX_SNAPSHOTS", () => {
	it("truncates to 10 snapshots on save", async () => {
		const many = Array.from({ length: 15 }, (_, i) => ({
			id: `snap-${i}`,
			label: `Snap ${i}`,
			createdAt: new Date(i * 1000).toISOString(),
			widgets: [],
			panels: {},
			workspacePresetLayouts: {},
		}));
		mockReadSnapshots = vi.fn<typeof readSnapshots>().mockResolvedValue(many);

		const written: WorkspaceSnapshot[][] = [];
		mockWriteSnapshots = vi
			.fn<typeof writeSnapshots>()
			.mockImplementation(async (_w, _p, snaps) => {
				written.push(snaps);
			});

		const history = createHistoryManager("panel-1", fakeWindow());
		await history.saveSnapshot([], "new");

		const lastWrite = written[written.length - 1];
		expect(lastWrite).toHaveLength(10);
		// Last item is the newly saved snapshot (timestamp id)
		expect(lastWrite[9]).toHaveProperty("label", "new");
		// First 9 items are the last 9 of the original 15
		expect(lastWrite[0].id).toBe("snap-6");
	});
});

// ── Bug 6: cache integration ─────────────────────────────────────────

describe("Bug 6: cache integration", () => {
	const snap = (id: string) =>
		({
			id,
			x: 0,
			y: 0,
			width: 1,
			height: 1,
			widgetType: "text",
		}) as never;

	// The real `loadLayoutUndoStack` always returns a `LayoutUndoStack`
	// (an empty one when the cache is missing). Match the contract here
	// so the mock mirrors the wrapper.
	const emptyStack = () => new LayoutUndoStack();

	it("init() calls loadLayoutUndoStack for the panel", async () => {
		mockLoadLayoutUndoStack.mockResolvedValueOnce(emptyStack());

		const win = fakeWindow();
		const history = createHistoryManager("panel-1", win);
		await history.init();

		expect(mockLoadLayoutUndoStack).toHaveBeenCalledTimes(1);
		const [calledWin, panelId] = mockLoadLayoutUndoStack.mock.calls[0] as [
			Window,
			string,
		];
		expect(calledWin).toBe(win);
		expect(panelId).toBe("panel-1");
	});

	it("init() on empty cache leaves the stack empty", async () => {
		mockLoadLayoutUndoStack.mockResolvedValueOnce(emptyStack());

		const history = createHistoryManager("panel-1", fakeWindow());
		await history.init();

		expect(history.canUndo()).toBe(false);
		expect(history.canRedo()).toBe(false);
	});

	it("init() restores a previously-saved stack from cache", async () => {
		// Two entries: a (current) and b (one undo step back). Cache stores
		// { stack: [a, b], idx: 0 } so the current snapshot is a and undo
		// steps to b.
		const cached = new LayoutUndoStack();
		cached.push({ panelId: "panel-1", widgets: [snap("a")] });
		cached.push({ panelId: "panel-1", widgets: [snap("b")] });
		// After two pushes, idx=1, current is b. Undo brings us to a.
		mockLoadLayoutUndoStack.mockResolvedValueOnce(cached);

		const history = createHistoryManager("panel-1", fakeWindow());
		await history.init();

		expect(history.canUndo()).toBe(true);
		const before = history.undo();
		expect(before?.[0]?.id).toBe("a");
		expect(history.canRedo()).toBe(true);
		const after = history.redo();
		expect(after?.[0]?.id).toBe("b");
	});

	it("push() after init() fires saveLayoutUndoStack with the panelId", async () => {
		mockLoadLayoutUndoStack.mockResolvedValueOnce(emptyStack());
		mockSaveLayoutUndoStack.mockResolvedValue(undefined);

		const win = fakeWindow();
		const history = createHistoryManager("panel-1", win);
		await history.init();

		history.push([snap("w1")]);
		// Allow the fire-and-forget save microtask to flush.
		await new Promise((r) => setTimeout(r, 0));

		expect(mockSaveLayoutUndoStack).toHaveBeenCalled();
		const [calledWin, panelId] = mockSaveLayoutUndoStack.mock.calls[0] as [
			Window,
			string,
			unknown,
		];
		expect(calledWin).toBe(win);
		expect(panelId).toBe("panel-1");
	});

	it("push() before init() buffers; init() then applies the buffer and saves", async () => {
		mockLoadLayoutUndoStack.mockResolvedValueOnce(emptyStack());
		mockSaveLayoutUndoStack.mockResolvedValue(undefined);

		const history = createHistoryManager("panel-1", fakeWindow());

		// Pre-init push should NOT fire save (init hasn't happened).
		history.push([snap("w1")]);
		await new Promise((r) => setTimeout(r, 0));
		expect(mockSaveLayoutUndoStack).not.toHaveBeenCalled();

		// Now init() — this should apply the buffered push and fire save.
		await history.init();
		await new Promise((r) => setTimeout(r, 0));

		expect(mockSaveLayoutUndoStack).toHaveBeenCalled();
		// After the buffered push was applied, the in-memory stack has one entry.
		// canUndo requires idx > 0, so a single push at idx=0 is not yet undoable.
		expect(history.canUndo()).toBe(false);
	});

	it("undo() after init() fires saveLayoutUndoStack", async () => {
		const cached = new LayoutUndoStack();
		cached.push({ panelId: "panel-1", widgets: [snap("a")] });
		cached.push({ panelId: "panel-1", widgets: [snap("b")] });
		mockLoadLayoutUndoStack.mockResolvedValueOnce(cached);
		mockSaveLayoutUndoStack.mockResolvedValue(undefined);

		const history = createHistoryManager("panel-1", fakeWindow());
		await history.init();

		history.undo();
		await new Promise((r) => setTimeout(r, 0));

		expect(mockSaveLayoutUndoStack).toHaveBeenCalled();
	});

	it("push() survives if saveLayoutUndoStack throws (fire-and-forget)", async () => {
		mockLoadLayoutUndoStack.mockResolvedValueOnce(emptyStack());
		mockSaveLayoutUndoStack.mockRejectedValueOnce(new Error("disk full"));

		const history = createHistoryManager("panel-1", fakeWindow());
		await history.init();

		// Should not throw — the in-memory stack is the source of truth.
		history.push([snap("w1")]);
		// Flush microtasks so any unhandled rejection is observable.
		await new Promise((r) => setTimeout(r, 0));

		// In-memory state still reflects the push.
		expect(history.canRedo()).toBe(false);
	});
});
