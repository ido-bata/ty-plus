import { describe, expect, it } from "vitest";

import {
	CatalogSearchMethod,
	ConnectivityCheckMethod,
	type ConnectivityState,
	type ConnectivityStatus,
	type ConnectivityStatusDTO,
	DownloadMethod,
	type DownloadRequestDTO,
	type DownloadResponseDTO,
	decideOfflinePolicy,
	mapCatalogSearchItem,
	mapCatalogSearchResult,
	mapConnectivityStatus,
	type OfflineDecision,
	type OnlineOperation,
} from "./runtime-gateway";

describe("online runtime-gateway connectivity", () => {
	it("ConnectivityCheckMethod has correct name", () => {
		expect(ConnectivityCheckMethod.name).toBe("online.connectivity.check");
	});

	it("ConnectivityStatus type is valid", () => {
		const status: ConnectivityStatus = {
			state: "online",
			label: "Ty Plus OK",
			checkedAt: "2026-08-16T00:00:00Z",
		};
		expect(status.state).toBe("online");
	});

	it("ConnectivityState includes explicit offline", () => {
		const states: readonly ConnectivityState[] = [
			"unknown",
			"online",
			"offline",
			"checking",
		];
		expect(states).toContain("offline");
	});

	it("ConnectivityStatus allows errorMessage when offline", () => {
		const status: ConnectivityStatus = {
			state: "offline",
			label: "Cloud sync failed",
			checkedAt: "2026-08-16T00:00:00Z",
			errorMessage: "network unavailable",
		};
		expect(status.errorMessage).toBe("network unavailable");
	});

	it("maps the wire connectivity DTO to the domain shape", () => {
		const dto: ConnectivityStatusDTO = {
			state: "offline",
			label: "Cloud sync failed",
			checked_at: "2026-08-16T00:00:00Z",
			error_message: "network unavailable",
		};
		const status = mapConnectivityStatus(dto);
		expect(status).toEqual({
			state: "offline",
			label: "Cloud sync failed",
			checkedAt: "2026-08-16T00:00:00Z",
			errorMessage: "network unavailable",
		});
		expect(Object.keys(status)).not.toContain("checked_at");
	});

	it("drops the wire error message when absent", () => {
		const status = mapConnectivityStatus({
			state: "online",
			label: "Ty Plus OK",
			checked_at: "2026-08-16T00:00:00Z",
		});
		expect(status.errorMessage).toBeUndefined();
	});
});

describe("online runtime-gateway catalog mapper", () => {
	it("CatalogSearchMethod has correct name", () => {
		expect(CatalogSearchMethod.name).toBe("online.catalog.search");
	});

	it("maps a full wire row to the domain model", () => {
		const item = mapCatalogSearchItem({
			preset_id: "p-1",
			name: "Camera Shake",
			description: "Organic handheld wobble",
			category: "effect",
			tag: ["cam", "fx"],
			platform: "ae",
			version: "1.0.0",
			notion_page_url: "https://notion.so/p1",
			thumbnail_url: "https://cdn.example/p1.png",
		});

		expect(item).toEqual({
			presetId: "p-1",
			name: "Camera Shake",
			description: "Organic handheld wobble",
			category: "effect",
			tag: ["cam", "fx"],
			platform: "ae",
			version: "1.0.0",
			notionPageUrl: "https://notion.so/p1",
			thumbnailUrl: "https://cdn.example/p1.png",
		});
		// Wire DTO keys must never leak into the domain shape.
		expect(Object.keys(item)).not.toContain("preset_id");
		expect(Object.keys(item)).not.toContain("notion_page_url");
	});

	it("drops empty tags instead of emitting an empty array", () => {
		const item = mapCatalogSearchItem({
			preset_id: "p-2",
			name: "Minimal",
			tag: [],
		});
		expect(item.tag).toBeUndefined();
	});

	it("maps a sparse wire row without optional fields", () => {
		const item = mapCatalogSearchItem({
			preset_id: "p-3",
			name: "Bare",
		});
		expect(item).toEqual({ presetId: "p-3", name: "Bare" });
	});

	it("maps a full result preserving item order", () => {
		const result = mapCatalogSearchResult({
			items: [
				{ preset_id: "a", name: "Alpha" },
				{ preset_id: "b", name: "Beta" },
			],
		});
		expect(result.items.map((row) => row.presetId)).toEqual(["a", "b"]);
	});
});

describe("online runtime-gateway offline policy", () => {
	const operations: readonly OnlineOperation[] = [
		"connectivity-check",
		"catalog-search",
		"download",
		"search-cache",
	];

	it("OnlineOperation and OfflineDecision cover the Rust enum values", () => {
		const ops: readonly OnlineOperation[] = [
			"connectivity-check",
			"catalog-search",
			"download",
			"search-cache",
		];
		const decisions: readonly OfflineDecision[] = [
			"proceed",
			"cache-only",
			"fail-offline",
		];
		expect(ops).toEqual(operations);
		expect(decisions).toContain("proceed");
		expect(decisions).toContain("cache-only");
		expect(decisions).toContain("fail-offline");
	});

	it("every operation proceeds when online", () => {
		for (const operation of operations) {
			expect(decideOfflinePolicy("online", operation)).toBe("proceed");
		}
	});

	it("every operation proceeds while checking or unknown", () => {
		for (const state of ["checking", "unknown"] as const) {
			for (const operation of operations) {
				expect(decideOfflinePolicy(state, operation)).toBe("proceed");
			}
		}
	});

	it("offline keeps connectivity check and search cache local", () => {
		expect(decideOfflinePolicy("offline", "connectivity-check")).toBe(
			"proceed",
		);
		expect(decideOfflinePolicy("offline", "search-cache")).toBe("proceed");
	});

	it("offline degrades catalog search to cache-only", () => {
		expect(decideOfflinePolicy("offline", "catalog-search")).toBe("cache-only");
	});

	it("offline blocks download explicitly", () => {
		expect(decideOfflinePolicy("offline", "download")).toBe("fail-offline");
	});
});

describe("online runtime-gateway download", () => {
	it("DownloadMethod has correct name", () => {
		expect(DownloadMethod.name).toBe("online.download");
	});

	it("DownloadRequestDTO carries preset id, destination, and record", () => {
		const request: DownloadRequestDTO = {
			preset_id: "cloud-id",
			destination: "/presets/ty-plus/downloads/Easing.ffx",
			record: {
				id: "local-id",
				type: "preset",
				title: "Easing Pack",
				file_path: "/presets/ty-plus/downloads/Easing.ffx",
				category: "preset",
				source_catalog_id: "cloud-id",
			},
		};
		expect(request.record.source_catalog_id).toBe("cloud-id");
	});

	it("DownloadResponseDTO matches the runtime receipt", () => {
		const receipt: DownloadResponseDTO = {
			bytes_written: 4096,
			sha256: "a".repeat(64),
			final_url: "https://media.example.com/Easing.ffx?token=abc",
			destination: "/presets/ty-plus/downloads/Easing.ffx",
		};
		expect(receipt.sha256).toHaveLength(64);
		expect(receipt.bytes_written).toBe(4096);
	});
});
