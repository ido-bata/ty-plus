import { describe, expect, it, vi } from "vitest";

import {
	createStorageGateway,
	StorageDeleteMethod,
	StorageEnsureDirMethod,
	StorageListMethod,
	StorageReadMethod,
	StorageWriteMethod,
} from "./runtime-gateway-port";

describe("runtime-gateway-port", () => {
	it("creates gateway from dispatcher", () => {
		const dispatcher = {
			request: vi.fn().mockResolvedValue({}),
		};

		const gateway = createStorageGateway(dispatcher as never);
		expect(gateway).toBeDefined();
	});

	it("read calls dispatcher with correct method", async () => {
		const dispatcher = {
			request: vi.fn().mockResolvedValue({ content: "{}" }),
		};

		const gateway = createStorageGateway(dispatcher as never);
		const result = await gateway.read("settings.json");

		expect(dispatcher.request).toHaveBeenCalledWith(StorageReadMethod, {
			key: "settings.json",
		});
		expect(result.content).toBe("{}");
	});

	it("write calls dispatcher with correct method", async () => {
		const dispatcher = {
			request: vi.fn().mockResolvedValue({ revision: "1" }),
		};

		const gateway = createStorageGateway(dispatcher as never);
		const result = await gateway.write("settings.json", '{"key":"value"}');

		expect(dispatcher.request).toHaveBeenCalledWith(StorageWriteMethod, {
			key: "settings.json",
			content: '{"key":"value"}',
			expectedRevision: undefined,
		});
		expect(result.revision).toBe("1");
	});

	it("write with expected revision", async () => {
		const dispatcher = {
			request: vi.fn().mockResolvedValue({ revision: "2" }),
		};

		const gateway = createStorageGateway(dispatcher as never);
		const result = await gateway.write("settings.json", "{}", {
			expectedRevision: "1",
		});

		expect(dispatcher.request).toHaveBeenCalledWith(StorageWriteMethod, {
			key: "settings.json",
			content: "{}",
			expectedRevision: "1",
		});
		expect(result.revision).toBe("2");
	});

	it("delete calls dispatcher", async () => {
		const dispatcher = {
			request: vi.fn().mockResolvedValue(undefined),
		};

		const gateway = createStorageGateway(dispatcher as never);
		await gateway.delete("old-file.json");

		expect(dispatcher.request).toHaveBeenCalledWith(StorageDeleteMethod, {
			key: "old-file.json",
		});
	});

	it("list calls dispatcher", async () => {
		const dispatcher = {
			request: vi.fn().mockResolvedValue({ entries: ["a.json", "b.json"] }),
		};

		const gateway = createStorageGateway(dispatcher as never);
		const result = await gateway.list("cache/");

		expect(dispatcher.request).toHaveBeenCalledWith(StorageListMethod, {
			key: "cache/",
		});
		expect(result).toEqual(["a.json", "b.json"]);
	});

	it("ensureDir calls dispatcher", async () => {
		const dispatcher = {
			request: vi.fn().mockResolvedValue(undefined),
		};

		const gateway = createStorageGateway(dispatcher as never);
		await gateway.ensureDir("new-dir");

		expect(dispatcher.request).toHaveBeenCalledWith(StorageEnsureDirMethod, {
			key: "new-dir",
		});
	});
});
