/**
 * Tests for cache-store.ts (compatibility barrel).
 * All read/write paths go through the persistence API now; tests mock
 * readJson / writeJson at that boundary.
 */

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
	readNotifications,
	readPublicLinks,
	readRemotePresets,
	writeNotifications,
	writePublicLinks,
	writeRemotePresets,
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

// ── readRemotePresets ───────────────────────────────────────────────────

describe("readRemotePresets", () => {
	it("delegates to readJson with the remotePresets key", async () => {
		mockReadJson.mockResolvedValue({
			presets: [{ name: "preset-a" }],
			timestamp: 123456,
		});
		const result = await readRemotePresets(win);
		expect(result).toEqual({
			presets: [{ name: "preset-a" }],
			timestamp: 123456,
		});
		expect(mockReadJson).toHaveBeenCalledWith(win, "remotePresets");
	});

	it("returns null when the cache file is missing", async () => {
		mockReadJson.mockResolvedValue(null);
		const result = await readRemotePresets(win);
		expect(result).toBeNull();
	});
});

// ── writeRemotePresets ──────────────────────────────────────────────────

describe("writeRemotePresets", () => {
	it("delegates to writeJson with the remotePresets key", async () => {
		const data: Parameters<typeof writeRemotePresets>[1] = {
			presets: [{ name: "remote-a", url: "https://example.com" }],
			fetchedAt: 1700000000,
		};
		await writeRemotePresets(win, data);
		expect(mockWriteJson).toHaveBeenCalledWith(win, "remotePresets", data);
	});
});

// ── readPublicLinks ────────────────────────────────────────────────────

describe("readPublicLinks", () => {
	it("returns parsed cache when file is valid v1", async () => {
		mockReadJson.mockResolvedValue({
			version: 1,
			updatedAt: "2026-06-01T00:00:00.000Z",
			links: {
				"user-manual": {
					url: "https://example.com/manual",
					label: "User Manual",
					updatedAt: "2026-06-01T00:00:00.000Z",
				},
			},
		});
		const result = await readPublicLinks(win);
		expect(result).toEqual({
			version: 1,
			updatedAt: "2026-06-01T00:00:00.000Z",
			links: {
				"user-manual": {
					url: "https://example.com/manual",
					label: "User Manual",
					updatedAt: "2026-06-01T00:00:00.000Z",
				},
			},
		});
		expect(mockReadJson).toHaveBeenCalledWith(win, "publicLinks");
	});

	it("returns null when version is not 1", async () => {
		mockReadJson.mockResolvedValue({ version: 2, links: {} });
		const result = await readPublicLinks(win);
		expect(result).toBeNull();
	});

	it("returns null when the cache file is missing", async () => {
		mockReadJson.mockResolvedValue(null);
		const result = await readPublicLinks(win);
		expect(result).toBeNull();
	});

	it("skips entries that lack a url", async () => {
		mockReadJson.mockResolvedValue({
			version: 1,
			updatedAt: "x",
			links: {
				bad: { label: "no url" },
				good: { url: "https://x.example" },
			},
		});
		const result = await readPublicLinks(win);
		expect(result?.links).toEqual({
			good: { url: "https://x.example" },
		});
	});
});

// ── writePublicLinks ───────────────────────────────────────────────────

describe("writePublicLinks", () => {
	it("delegates to writeJson with the publicLinks key", async () => {
		const data: Parameters<typeof writePublicLinks>[1] = {
			version: 1,
			updatedAt: "2026-06-05T00:00:00.000Z",
			links: { "user-manual": { url: "https://example.com/manual" } },
		};
		await writePublicLinks(win, data);
		expect(mockWriteJson).toHaveBeenCalledWith(win, "publicLinks", data);
	});
});
