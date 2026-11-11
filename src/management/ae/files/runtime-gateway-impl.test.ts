import { describe, expect, it, vi } from "vitest";

import {
	GenerateThumbnailMethod,
	LookupThumbnailMethod,
} from "./runtime-gateway";
import { createAfterEffectsFilesRuntimeGateway } from "./runtime-gateway-impl";

describe("runtime-gateway-impl", () => {
	it("creates gateway from dispatcher", () => {
		const dispatcher = {
			request: vi.fn().mockResolvedValue({ rows: [], warnings: [] }),
		};

		const gateway = createAfterEffectsFilesRuntimeGateway(dispatcher as never);
		expect(gateway).toBeDefined();
	});

	it("scanPluginEffects calls dispatcher", async () => {
		const mockResult = {
			rows: [
				{
					file_path: "/Plugins/Blur.aex",
					match_name: "ADBE Gaussian Blur 2",
					display_name: "Gaussian Blur",
				},
			],
			warnings: [],
		};

		const dispatcher = {
			request: vi.fn().mockResolvedValue(mockResult),
		};

		const gateway = createAfterEffectsFilesRuntimeGateway(dispatcher as never);
		const result = await gateway.scanPluginEffects({
			roots: ["/Plugins"],
		});

		expect(result.rows).toHaveLength(1);
		expect(result.rows[0].match_name).toBe("ADBE Gaussian Blur 2");
	});

	it("getHostContext calls dispatcher", async () => {
		const mockContext = {
			app_root: "/Applications/Adobe After Effects 2024",
			support_root: "/Users/test/Library/Application Support",
			ae_version: "24.0.0",
			session_id: "session-1",
		};

		const dispatcher = {
			request: vi.fn().mockResolvedValue(mockContext),
		};

		const gateway = createAfterEffectsFilesRuntimeGateway(dispatcher as never);
		const result = await gateway.getHostContext();

		expect(result.app_root).toBe("/Applications/Adobe After Effects 2024");
		expect(result.session_id).toBe("session-1");
	});

	it("lookupThumbnail calls dispatcher", async () => {
		const dispatcher = {
			request: vi.fn().mockResolvedValue({
				cache_path: "/host/managed/thumbnails/x/foo.webp",
				animated_source_path: null,
			}),
		};

		const gateway = createAfterEffectsFilesRuntimeGateway(dispatcher as never);
		const result = await gateway.lookupThumbnail({
			source_path: "/host/foo.png",
			mtime_ms: 1,
			size_bytes: 1,
			file_type: "image",
		});

		expect(dispatcher.request).toHaveBeenCalledWith(LookupThumbnailMethod, {
			source_path: "/host/foo.png",
			mtime_ms: 1,
			size_bytes: 1,
			file_type: "image",
		});
		expect(result.cache_path).toBe("/host/managed/thumbnails/x/foo.webp");
		expect(result.animated_source_path).toBeNull();
	});

	it("generateThumbnail calls dispatcher", async () => {
		const dispatcher = {
			request: vi.fn().mockResolvedValue({
				cache_path: "/host/managed/thumbnails/x/foo.webp",
				animated_source_path: null,
			}),
		};

		const gateway = createAfterEffectsFilesRuntimeGateway(dispatcher as never);
		const result = await gateway.generateThumbnail({
			source_path: "/host/foo.png",
			mtime_ms: 1,
			size_bytes: 1,
			file_type: "image",
		});

		expect(dispatcher.request).toHaveBeenCalledWith(GenerateThumbnailMethod, {
			source_path: "/host/foo.png",
			mtime_ms: 1,
			size_bytes: 1,
			file_type: "image",
		});
		expect(result.cache_path).toBe("/host/managed/thumbnails/x/foo.webp");
		expect(result.animated_source_path).toBeNull();
	});
});
