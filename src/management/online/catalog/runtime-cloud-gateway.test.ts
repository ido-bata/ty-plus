import { describe, expect, it, vi } from "vitest";

import type {
	PresetDownloadRequest,
	PresetDownloadResult,
} from "@/management/online/contract";
import {
	CatalogSearchMethod,
	type CatalogSearchResultDTO,
	ConnectivityCheckMethod,
	type ConnectivityStatusDTO,
	DownloadMethod,
	type DownloadResponseDTO,
	type OnlineRuntimeGatewayPort,
} from "@/management/online/runtime-gateway";

import {
	createFixtureCloudGateway,
	createRuntimeCloudGateway,
} from "./runtime-cloud-gateway";

const fakePort = (
	request: ReturnType<typeof vi.fn>,
): OnlineRuntimeGatewayPort =>
	({ request }) as unknown as OnlineRuntimeGatewayPort;

describe("createFixtureCloudGateway", () => {
	it("reports provider supabase and an ok health check", async () => {
		const gateway = createFixtureCloudGateway();
		expect(gateway.provider).toBe("supabase");
		await expect(gateway.healthCheck?.()).resolves.toEqual({ ok: true });
	});

	it("returns an empty catalog for search", async () => {
		const gateway = createFixtureCloudGateway();
		await expect(gateway.searchPresets?.({ q: "x" })).resolves.toEqual({
			items: [],
		});
	});

	it("serves fixture notifications and empty blocks", async () => {
		const gateway = createFixtureCloudGateway();
		const notifications = await gateway.listNotifications?.();
		expect(notifications?.length).toBeGreaterThan(0);
		expect(notifications?.[0]?.notificationId).toBe("msg-1");
		await expect(gateway.getNotificationBlocks?.("msg-1")).resolves.toEqual([]);
	});

	it("the fixture notification set is the documented offline-mock payload (no misleading 'archive mock parity' copy)", async () => {
		// Regression guard: a copy change to FALLBACK_NOTIFICATIONS that re-introduces
		// the misleading "archive mock parity" string would let the user confuse the
		// fixture gateway's offline-mock copy with a real online notification.
		const gateway = createFixtureCloudGateway();
		const notifications = await gateway.listNotifications?.();
		expect(notifications?.map((n) => n.notificationId)).toEqual([
			"msg-1",
			"msg-2",
			"msg-3",
		]);
		expect(notifications?.[0]?.summary).not.toMatch(/archive mock parity/);
		expect(notifications?.[0]?.summary).not.toMatch(/archive mock/i);
	});

	it("resolves the user-manual public link and rejects unknown keys", async () => {
		const gateway = createFixtureCloudGateway();
		const link = await gateway.getPublicLink?.("user-manual");
		expect(link?.url).toBe("https://www.notion.so/ty-plus-User-Manual-fixture");
		await expect(gateway.getPublicLink?.("unknown")).rejects.toThrow(
			/Unknown public link/,
		);
	});

	it("cannot resolve preset details and exposes no runtime download", async () => {
		const gateway = createFixtureCloudGateway();
		await expect(gateway.resolvePreset("p1")).rejects.toThrow(/Unknown preset/);
		expect(gateway.downloadPreset).toBeUndefined();
	});
});

describe("createRuntimeCloudGateway", () => {
	const downloadRequest: PresetDownloadRequest = {
		presetId: "preset.cloud.example",
		destination:
			"C:/Users/me/Documents/Adobe/Presets/ty-plus/downloads/My Preset.ffx",
		record: {
			id: "11111111-2222-4333-8444-555555555555",
			type: "preset",
			title: "My Preset",
			filePath:
				"C:/Users/me/Documents/Adobe/Presets/ty-plus/downloads/My Preset.ffx",
			category: "preset",
			sourceCatalogId: "preset.cloud.example",
		},
	};

	it("reports provider supabase", () => {
		const gateway = createRuntimeCloudGateway(fakePort(vi.fn()));
		expect(gateway.provider).toBe("supabase");
	});

	it("maps health check to the runtime connectivity state", async () => {
		const request = vi
			.fn()
			.mockResolvedValueOnce({
				state: "online",
				label: "Online",
				checked_at: "2026-01-01T00:00:00.000Z",
			} as ConnectivityStatusDTO)
			.mockResolvedValueOnce({
				state: "offline",
				label: "Offline",
				checked_at: "2026-01-01T00:00:00.000Z",
				error_message: "no network",
			} as ConnectivityStatusDTO);
		const gateway = createRuntimeCloudGateway(fakePort(request));
		await expect(gateway.healthCheck?.()).resolves.toEqual({ ok: true });
		await expect(gateway.healthCheck?.()).resolves.toEqual({ ok: false });
		expect(request).toHaveBeenNthCalledWith(
			1,
			ConnectivityCheckMethod,
			undefined,
		);
		expect(request).toHaveBeenNthCalledWith(
			2,
			ConnectivityCheckMethod,
			undefined,
		);
	});

	it("maps search params to the wire DTO and maps the response back", async () => {
		const request = vi.fn().mockResolvedValue({
			items: [
				{
					preset_id: "preset.cloud.example",
					name: "My Preset",
					category: "preset",
					tag: ["ffx"],
				},
			],
		} as CatalogSearchResultDTO);
		const gateway = createRuntimeCloudGateway(fakePort(request));
		const result = await gateway.searchPresets?.({ q: "My", limit: 10 });
		expect(request).toHaveBeenCalledWith(
			CatalogSearchMethod,
			expect.objectContaining({ q: "My", limit: 10 }),
		);
		expect(result).toEqual({
			items: [
				expect.objectContaining({
					presetId: "preset.cloud.example",
					name: "My Preset",
					category: "preset",
					tag: ["ffx"],
				}),
			],
		});
	});

	it("maps a download request to the wire DTO and the response back", async () => {
		const request = vi.fn().mockResolvedValue({
			bytes_written: 64,
			sha256: "0".repeat(64),
			final_url: "https://cdn.example.com/presets/MyPreset.ffx",
			destination: downloadRequest.destination,
		} as DownloadResponseDTO);
		const gateway = createRuntimeCloudGateway(fakePort(request));
		const result = await gateway.downloadPreset?.(downloadRequest);
		expect(request).toHaveBeenCalledWith(DownloadMethod, {
			preset_id: downloadRequest.presetId,
			destination: downloadRequest.destination,
			record: {
				id: downloadRequest.record.id,
				type: downloadRequest.record.type,
				title: downloadRequest.record.title,
				file_path: downloadRequest.record.filePath,
				category: downloadRequest.record.category,
				source_catalog_id: downloadRequest.record.sourceCatalogId,
			},
		});
		expect(result).toEqual<PresetDownloadResult>({
			bytesWritten: 64,
			sha256: "0".repeat(64),
			finalUrl: "https://cdn.example.com/presets/MyPreset.ffx",
			destination: downloadRequest.destination,
		});
	});

	it("serves fixture notifications / public links and rejects detail resolution", async () => {
		const gateway = createRuntimeCloudGateway(fakePort(vi.fn()));
		const notifications = await gateway.listNotifications?.();
		expect(notifications?.[0]?.notificationId).toBe("msg-1");
		await expect(gateway.getNotificationBlocks?.("msg-1")).resolves.toEqual([]);
		const link = await gateway.getPublicLink?.("user-manual");
		expect(link?.url).toBe("https://www.notion.so/ty-plus-User-Manual-fixture");
		await expect(gateway.resolvePreset("p1")).rejects.toThrow(
			/Runtime gateway cannot resolve preset details/,
		);
	});
});
