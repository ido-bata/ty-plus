/**
 * Tests for notifications.ts
 * Mocks readNotifications / writeNotifications at the cache-store boundary so
 * the persistence layer is exercised separately (see managed-root.test.ts and
 * io.test.ts under storage/persistence/).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	loadNotificationsStore,
	saveNotificationsStore,
} from "./notifications";

// ── Mock cache-store helpers ─────────────────────────────────────────────────

const { mockReadNotifications, mockWriteNotifications } = vi.hoisted(() => ({
	mockReadNotifications: vi.fn(),
	mockWriteNotifications: vi.fn(),
}));

vi.mock("@/management/storage/read/cache-store", () => ({
	readNotifications: mockReadNotifications,
}));

vi.mock("@/management/storage/write/cache-store", () => ({
	writeNotifications: mockWriteNotifications,
}));

const win = {} as Window;

beforeEach(() => {
	mockReadNotifications.mockReset().mockResolvedValue(null);
	mockWriteNotifications.mockReset().mockResolvedValue(undefined);
});

// ── loadNotificationsStore ───────────────────────────────────────────────────

describe("loadNotificationsStore", () => {
	it("returns an empty store when the cache file is missing", async () => {
		mockReadNotifications.mockResolvedValue(null);
		const result = await loadNotificationsStore(win);
		expect(result).toEqual({ items: [], readAtById: {} });
	});

	it("parses a valid store with items and readAtById", async () => {
		mockReadNotifications.mockResolvedValue({
			items: [{ notificationId: "n1", name: "Test" }],
			readAtById: { n1: "2025-01-01T00:00:00.000Z" },
		});
		const result = await loadNotificationsStore(win);
		expect(result.items).toHaveLength(1);
		expect(result.items[0].notificationId).toBe("n1");
		expect(result.readAtById).toEqual({ n1: "2025-01-01T00:00:00.000Z" });
	});

	it("filters invalid items from the items array", async () => {
		mockReadNotifications.mockResolvedValue({
			items: [
				{ notificationId: "n1", name: "Valid" },
				{ name: "MissingId" },
				{ notificationId: "n2" },
				null,
			],
			readAtById: {},
		});
		const result = await loadNotificationsStore(win);
		expect(result.items).toHaveLength(1);
		expect(result.items[0].notificationId).toBe("n1");
	});

	it("returns an empty items array when items is not an array", async () => {
		mockReadNotifications.mockResolvedValue({
			items: { not: "array" },
			readAtById: {},
		});
		const result = await loadNotificationsStore(win);
		expect(result.items).toEqual([]);
	});

	it("returns an empty readAtById when it is not an object", async () => {
		mockReadNotifications.mockResolvedValue({
			items: [],
			readAtById: "not an object",
		});
		const result = await loadNotificationsStore(win);
		expect(result.readAtById).toEqual({});
	});

	it("filters non-string values from readAtById", async () => {
		mockReadNotifications.mockResolvedValue({
			items: [],
			readAtById: {
				n1: "2025-01-01T00:00:00.000Z",
				n2: 123,
				n3: null,
			},
		});
		const result = await loadNotificationsStore(win);
		expect(result.readAtById).toEqual({ n1: "2025-01-01T00:00:00.000Z" });
	});

	it("returns an empty store when the raw payload is not an object", async () => {
		mockReadNotifications.mockResolvedValue("not an object");
		const result = await loadNotificationsStore(win);
		expect(result).toEqual({ items: [], readAtById: {} });
	});
});

// ── saveNotificationsStore ───────────────────────────────────────────────────

describe("saveNotificationsStore", () => {
	it("delegates the full store to writeNotifications", async () => {
		const store = {
			items: [
				{ notificationId: "n1", name: "Test", summary: "", publishedAt: "" },
			],
			readAtById: { n1: "2025-01-01T00:00:00.000Z" },
		};
		await saveNotificationsStore(win, store);
		expect(mockWriteNotifications).toHaveBeenCalledTimes(1);
		expect(mockWriteNotifications).toHaveBeenCalledWith(win, store);
	});

	it("propagates writeNotifications errors so callers can gate retries", async () => {
		mockWriteNotifications.mockRejectedValueOnce(new Error("locator missing"));
		await expect(
			saveNotificationsStore(win, { items: [], readAtById: {} }),
		).rejects.toThrow(/locator missing/);
	});
});
