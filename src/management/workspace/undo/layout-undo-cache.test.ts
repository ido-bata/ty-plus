/**
 * Tests for the session-scoped layout undo cache.
 *
 * The cache is a thin disk adapter around the pure `LayoutUndoStack`
 * (see `cache-stack.test.ts`). These tests verify the disk-routing
 * behavior: cache file lives under `<managed-root>/cache/layout-undo/`,
 * session-scoped init writes an empty payload, and load/save round-trips
 * through the pure stack.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRead = vi.fn();
const mockWrite = vi.fn();
const mockResolveRoot = vi.fn();

vi.mock("@/management/storage/read/json-file", () => ({
	readJsonFileText: (...args: unknown[]) =>
		(mockRead as (...a: unknown[]) => unknown)(...args),
}));

vi.mock("@/management/storage/write/json-file", () => ({
	writeJsonFileText: (...args: unknown[]) =>
		(mockWrite as (...a: unknown[]) => unknown)(...args),
}));

vi.mock("@/management/workspace/layout/persistence-root", () => ({
	resolveWorkspacePersistenceManagedRoot: (...args: unknown[]) =>
		(mockResolveRoot as (...a: unknown[]) => unknown)(...args),
}));

import { LayoutUndoStack } from "./cache-stack";
import {
	initLayoutUndoCache,
	loadLayoutUndoStack,
	saveLayoutUndoStack,
} from "./layout-undo-cache";

const win = {} as Window;

const ROOT = "C:/support/ty-plus";

describe("initLayoutUndoCache", () => {
	beforeEach(() => {
		mockRead.mockReset();
		mockWrite.mockReset();
		mockResolveRoot.mockReset();
		mockResolveRoot.mockResolvedValue(ROOT);
	});

	it("writes an empty stack payload to the panel cache file", async () => {
		mockWrite.mockResolvedValueOnce(undefined);

		await initLayoutUndoCache(win, "panel-1");

		expect(mockWrite).toHaveBeenCalledTimes(1);
		const [w, path, body] = mockWrite.mock.calls[0] as [
			unknown,
			string,
			string,
		];
		expect(w).toBe(win);
		expect(path).toBe(`${ROOT}/cache/layout-undo/panel-1/stack.json`);
		expect(JSON.parse(body)).toEqual({ schema: 1, stack: [], idx: -1 });
	});

	it("is a no-op when no managed root can be resolved", async () => {
		mockResolveRoot.mockResolvedValueOnce(null);

		await initLayoutUndoCache(win, "panel-1");

		expect(mockWrite).not.toHaveBeenCalled();
	});

	it("places the cache at cache/layout-undo/{panelId}/stack.json", async () => {
		mockWrite.mockResolvedValueOnce(undefined);

		await initLayoutUndoCache(win, "panel-3");

		const path = (mockWrite.mock.calls[0] as [unknown, string, unknown])[1];
		expect(path).toContain("cache/layout-undo/panel-3/stack.json");
	});
});

describe("loadLayoutUndoStack", () => {
	beforeEach(() => {
		mockRead.mockReset();
		mockWrite.mockReset();
		mockResolveRoot.mockReset();
		mockResolveRoot.mockResolvedValue(ROOT);
	});

	it("returns an empty stack when the cache file is missing", async () => {
		mockRead.mockResolvedValueOnce(null);

		const stack = await loadLayoutUndoStack(win, "panel-1");
		expect(stack.size()).toBe(0);
	});

	it("returns an empty stack when no managed root is available", async () => {
		mockResolveRoot.mockResolvedValueOnce(null);

		const stack = await loadLayoutUndoStack(win, "panel-1");
		expect(stack.size()).toBe(0);
		expect(mockRead).not.toHaveBeenCalled();
	});

	it("round-trips through save → load", async () => {
		const original = new LayoutUndoStack();
		original.push({
			panelId: "panel-1",
			widgets: [{ id: "w1", x: 0, y: 0, width: 1, height: 1 } as never],
		});
		original.push({
			panelId: "panel-1",
			widgets: [{ id: "w2", x: 1, y: 0, width: 1, height: 1 } as never],
		});

		mockWrite.mockResolvedValueOnce(undefined);
		await saveLayoutUndoStack(win, "panel-1", original);

		const savedBody = (mockWrite.mock.calls[0] as [unknown, string, string])[2];
		mockRead.mockResolvedValueOnce(savedBody);

		const restored = await loadLayoutUndoStack(win, "panel-1");
		expect(restored.size()).toBe(2);
	});

	it("returns an empty stack when the cache body has an unsupported schema", async () => {
		mockRead.mockResolvedValueOnce(
			JSON.stringify({ schema: 99, stack: [], idx: -1 }),
		);

		const stack = await loadLayoutUndoStack(win, "panel-1");
		expect(stack.size()).toBe(0);
	});

	it("returns an empty stack when the cache body is unparseable", async () => {
		mockRead.mockResolvedValueOnce("{not json");

		const stack = await loadLayoutUndoStack(win, "panel-1");
		expect(stack.size()).toBe(0);
	});
});

describe("saveLayoutUndoStack", () => {
	beforeEach(() => {
		mockRead.mockReset();
		mockWrite.mockReset();
		mockResolveRoot.mockReset();
		mockResolveRoot.mockResolvedValue(ROOT);
	});

	it("writes the serialized stack under cache/layout-undo/{panelId}/stack.json", async () => {
		mockWrite.mockResolvedValueOnce(undefined);
		const stack = new LayoutUndoStack();
		stack.push({
			panelId: "panel-2",
			widgets: [{ id: "w1", x: 0, y: 0, width: 1, height: 1 } as never],
		});

		await saveLayoutUndoStack(win, "panel-2", stack);

		const [w, path, body] = mockWrite.mock.calls[0] as [
			unknown,
			string,
			string,
		];
		expect(w).toBe(win);
		expect(path).toBe(`${ROOT}/cache/layout-undo/panel-2/stack.json`);
		const parsed = JSON.parse(body) as { schema: number; stack: unknown[] };
		expect(parsed.schema).toBe(1);
		expect(parsed.stack).toHaveLength(1);
	});

	it("swallows write errors so the in-memory stack remains usable", async () => {
		mockWrite.mockRejectedValueOnce(new Error("disk full"));
		const stack = new LayoutUndoStack();
		stack.push({
			panelId: "panel-1",
			widgets: [{ id: "w1", x: 0, y: 0, width: 1, height: 1 } as never],
		});

		await expect(
			saveLayoutUndoStack(win, "panel-1", stack),
		).resolves.toBeUndefined();
	});

	it("is a no-op when no managed root is available", async () => {
		mockResolveRoot.mockResolvedValueOnce(null);
		const stack = new LayoutUndoStack();

		await saveLayoutUndoStack(win, "panel-1", stack);
		expect(mockWrite).not.toHaveBeenCalled();
	});
});
