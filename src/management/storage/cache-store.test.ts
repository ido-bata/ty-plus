/**
 * Tests for cache-store.ts (compatibility barrel).
 * All read/write paths go through the persistence API now; tests mock
 * readJson / writeJson at that boundary.
 */

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
	readNotifications,
	writeNotifications,
} from "./cache-store";

let mockReadJson: Mock<
	(win: Window, key: string, ...args: unknown[]) => Promise<unknown>
>;
let mockWriteJson: Mock<
	(win: Window, key: string, ...args: unknown[]) => Promise<void>
>;

vi.mock("@/management/storage/persistence", () => ({
	get readJson() {
		return mockReadJson;
	},
	get writeJson() {
		return mockWriteJson;
	},
}));

const win = {} as Window;

beforeEach(() => {
	mockReadJson = vi.fn().mockResolvedValue(null);
	mockWriteJson = vi.fn().mockResolvedValue(undefined);
});

// ── readNotifications ───────────────────────────────────────────────────

describe("readNotifications", () => {
	it("delegates to readJson with the notifications key", async () => {
		mockReadJson.mockResolvedValue({ notifications: true, count: 42 });
		const result = await readNotifications(win);
		expect(result).toEqual({ notifications: true, count: 42 });
		expect(mockReadJson).toHaveBeenCalledWith(win, "notifications");
	});

	it("returns null when the cache file is missing", async () => {
		mockReadJson.mockResolvedValue(null);
		const result = await readNotifications(win);
		expect(result).toBeNull();
	});
});

// ── writeNotifications ──────────────────────────────────────────────────

describe("writeNotifications", () => {
	it("delegates to writeJson with the notifications key", async () => {
		const data = { items: [{ id: "1", text: "hello" }] };
		await writeNotifications(win, data);
		expect(mockWriteJson).toHaveBeenCalledWith(win, "notifications", data);
	});
});

