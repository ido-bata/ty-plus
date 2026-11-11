import { describe, expect, it, vi } from "vitest";
import type { OperationWorkerComposition } from "@/management/ipc/operation-worker-composition";
import {
	CatalogSearchMethod,
	type CatalogSearchRequestDTO,
	ConnectivityCheckMethod,
	DownloadMethod,
	type DownloadRequestDTO,
} from "@/management/online/runtime-gateway";
import { createCompositionRuntimeDispatcher } from "./composition-runtime-dispatcher";

type CheckConnectivity = OperationWorkerComposition["checkConnectivity"];
type LookupCatalog = OperationWorkerComposition["lookupCatalog"];
type DownloadPreset = OperationWorkerComposition["downloadPreset"];

const makeComposition = () => {
	const checkConnectivity = vi.fn();
	const lookupCatalog = vi.fn();
	const downloadPreset = vi.fn();
	const composition: OperationWorkerComposition = {
		scanHostPlugins: vi.fn(),
		lookupThumbnail: vi.fn(),
		generateThumbnail: vi.fn(),
		checkConnectivity: checkConnectivity as unknown as CheckConnectivity,
		lookupCatalog: lookupCatalog as unknown as LookupCatalog,
		downloadPreset: downloadPreset as unknown as DownloadPreset,
		resolveCurrentBinary: vi.fn(),
		resolveCurrentManifest: vi.fn(),
		stopAccepting: vi.fn(),
		drain: vi.fn(),
	};
	return { composition, checkConnectivity, lookupCatalog, downloadPreset };
};

describe("createCompositionRuntimeDispatcher", () => {
	it("routes ConnectivityCheckMethod to composition.checkConnectivity with undefined", async () => {
		const { composition, checkConnectivity } = makeComposition();
		checkConnectivity.mockResolvedValue({
			state: "online",
			label: "Online",
			checked_at: "2026-01-01T00:00:00.000Z",
		});

		const dispatcher = createCompositionRuntimeDispatcher(composition);
		const result = await dispatcher.request(ConnectivityCheckMethod, undefined);

		expect(checkConnectivity).toHaveBeenCalledWith(undefined);
		expect(result).toEqual({
			state: "online",
			label: "Online",
			checked_at: "2026-01-01T00:00:00.000Z",
		});
	});

	it("routes CatalogSearchMethod to composition.lookupCatalog with the payload", async () => {
		const { composition, lookupCatalog } = makeComposition();
		const request: CatalogSearchRequestDTO = {
			q: "preset",
			category: "effect",
		};
		lookupCatalog.mockResolvedValue({ items: [] });

		const dispatcher = createCompositionRuntimeDispatcher(composition);
		await dispatcher.request(CatalogSearchMethod, request);

		expect(lookupCatalog).toHaveBeenCalledWith(request);
	});

	it("routes DownloadMethod to composition.downloadPreset with the payload", async () => {
		const { composition, downloadPreset } = makeComposition();
		const request: DownloadRequestDTO = {
			preset_id: "preset-1",
			destination: "C:/presets/x.ffx",
			record: {
				id: "preset-1",
				type: "preset",
				title: "Example",
				file_path: "C:/presets/x.ffx",
				source_catalog_id: "ty-plus",
			},
		};
		downloadPreset.mockResolvedValue({
			bytes_written: 12,
			sha256: "deadbeef",
			final_url: "https://example.com/x.ffx",
			destination: "C:/presets/x.ffx",
		});

		const dispatcher = createCompositionRuntimeDispatcher(composition);
		await dispatcher.request(DownloadMethod, request);

		expect(downloadPreset).toHaveBeenCalledWith(request);
	});

	it("rejects unknown online methods without no-op", async () => {
		const { composition, checkConnectivity, lookupCatalog, downloadPreset } =
			makeComposition();
		const dispatcher = createCompositionRuntimeDispatcher(composition);
		const unknown = { name: "online.unknown.method" };

		await expect(
			dispatcher.request(
				unknown as unknown as typeof ConnectivityCheckMethod,
				undefined,
			),
		).rejects.toThrow(/unsupported online method/);

		expect(checkConnectivity).not.toHaveBeenCalled();
		expect(lookupCatalog).not.toHaveBeenCalled();
		expect(downloadPreset).not.toHaveBeenCalled();
	});

	it("rejects methods whose name is undefined (defensive default branch)", async () => {
		const { composition } = makeComposition();
		const dispatcher = createCompositionRuntimeDispatcher(composition);
		const nameless = {} as unknown as typeof ConnectivityCheckMethod;

		await expect(dispatcher.request(nameless, undefined)).rejects.toThrow(
			/unsupported online method/,
		);
	});
});
