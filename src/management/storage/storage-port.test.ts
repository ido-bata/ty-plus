import { describe, expect, it, vi } from "vitest";

import { createScopedStoragePort, type StoragePort } from "./storage-port";

describe("storage-port", () => {
	it("createScopedStoragePort prefixes keys", () => {
		const mockParent: StoragePort = {
			readJson: vi.fn().mockResolvedValue({ success: true, data: {} }),
			writeJson: vi
				.fn()
				.mockResolvedValue({ success: true, data: { revision: "1" } }),
			deleteJson: vi.fn().mockResolvedValue({ success: true }),
			readBytes: vi
				.fn()
				.mockResolvedValue({ success: true, data: new Uint8Array() }),
			writeBytes: vi.fn().mockResolvedValue({ success: true }),
			listDir: vi.fn().mockResolvedValue({ success: true, data: [] }),
			ensureDir: vi.fn().mockResolvedValue({ success: true }),
			deleteDir: vi.fn().mockResolvedValue({ success: true }),
		};

		const scoped = createScopedStoragePort(mockParent, "workspace/1");

		scoped.readJson("settings");

		expect(mockParent.readJson).toHaveBeenCalledWith("workspace/1/settings");
	});

	it("createScopedStoragePort nests scopes", () => {
		const mockParent: StoragePort = {
			readJson: vi.fn().mockResolvedValue({ success: true, data: {} }),
			writeJson: vi
				.fn()
				.mockResolvedValue({ success: true, data: { revision: "1" } }),
			deleteJson: vi.fn().mockResolvedValue({ success: true }),
			readBytes: vi
				.fn()
				.mockResolvedValue({ success: true, data: new Uint8Array() }),
			writeBytes: vi.fn().mockResolvedValue({ success: true }),
			listDir: vi.fn().mockResolvedValue({ success: true, data: [] }),
			ensureDir: vi.fn().mockResolvedValue({ success: true }),
			deleteDir: vi.fn().mockResolvedValue({ success: true }),
		};

		const scoped1 = createScopedStoragePort(mockParent, "workspace");
		const scoped2 = createScopedStoragePort(scoped1, "1");

		scoped2.readJson("settings");

		expect(mockParent.readJson).toHaveBeenCalledWith("workspace/1/settings");
	});
});
