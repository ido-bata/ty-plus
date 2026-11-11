import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
	PresetDownloadRequest,
	PresetDownloadResult,
} from "@/management/online/contract";
import type { Preset } from "@/management/preset/contract";
import type { DownloadProgress } from "./use-cases";
import {
	downloadAndInstallPreset,
	importPreset,
	isPresetDownloadedLocally,
	resolvePresetDownloadPath,
} from "./use-cases";

vi.mock("@/management/ae/cep/eval", () => ({
	evalScript: vi.fn(),
}));

vi.mock("@/management/workspace/services", () => ({
	getDataServices: vi.fn(),
}));

import { evalScript } from "@/management/ae/cep/eval";
import { createCloudSyncService } from "@/management/online/catalog/sync";
import { isUuidLike } from "@/management/storage/ids";
import { getDataServices } from "@/management/workspace/services";

const systemPaths = {
	hostId: "AE",
	operatingSystem: "win",
	userSupportRoot: "C:/Users/me/AppData/Roaming/Adobe",
	hostSupportRoot: "C:/Users/me/AppData/Roaming/Adobe/Common",
	presetRoot: "C:/Users/me/Documents/Adobe/Presets",
	scriptRoot: "C:/Users/me/AppData/Roaming/Adobe/CEP/extensions",
	pluginRoot: "C:/Program Files/Adobe/Common/Plug-ins/7.0/MediaCore",
};

describe("resolvePresetDownloadPath", () => {
	it("does not add a 'ty-plus_' prefix to the file name", () => {
		// Regression: catalog downloads were previously saved as
		// `<base>/ty-plus/downloads/ty-plus_<name>.<ext>`, which the user
		// expected to be a plain file. Strip that prefix entirely.
		const path = resolvePresetDownloadPath(
			systemPaths,
			"MyPreset.ffx",
			"preset",
		);
		const lastSegment = path.split("/").pop() ?? "";
		expect(lastSegment).toBe("MyPreset.ffx");
		expect(path).not.toMatch(/ty-plus_/);
	});

	it("routes script presets under the script root", () => {
		const path = resolvePresetDownloadPath(systemPaths, "helper.jsx", "script");
		expect(path).toBe(
			"C:/Users/me/AppData/Roaming/Adobe/CEP/extensions/ty-plus/downloads/helper.jsx",
		);
	});

	it("routes plugin presets under the plugin root", () => {
		const path = resolvePresetDownloadPath(systemPaths, "effect.aex", "plugin");
		expect(path).toBe(
			"C:/Program Files/Adobe/Common/Plug-ins/7.0/MediaCore/ty-plus/downloads/effect.aex",
		);
	});

	it("routes preset (.ffx) under the preset root", () => {
		const path = resolvePresetDownloadPath(
			systemPaths,
			"animation.ffx",
			"preset",
		);
		expect(path).toBe(
			"C:/Users/me/Documents/Adobe/Presets/ty-plus/downloads/animation.ffx",
		);
	});

	it("routes footage under the host support root", () => {
		const path = resolvePresetDownloadPath(systemPaths, "clip.ffx", "footage");
		expect(path).toBe(
			"C:/Users/me/AppData/Roaming/Adobe/Common/ty-plus/downloads/clip.ffx",
		);
	});

	it("never produces an 'undefined' segment when a root is missing", () => {
		const partial = {
			hostId: "AE",
			operatingSystem: "mac",
			userSupportRoot: "/Users/me/Library/Application Support/Adobe",
			hostSupportRoot: "/Users/me/Library/Application Support/Adobe/Common",
		};
		const path = resolvePresetDownloadPath(partial, "x.ffx", "preset");
		expect(path).not.toMatch(/undefined/);
		expect(path.endsWith("/ty-plus/downloads/x.ffx")).toBe(true);
	});
});

describe("downloadAndInstallPreset (runtime install)", () => {
	const win = {} as Window;
	const cloudPresetId = "preset.cloud.example";

	type UpsertCall = { preset: Preset };

	const setupDataServices = (options: { existingLocals?: Preset[] } = {}) => {
		const localStore = options.existingLocals
			? [...options.existingLocals]
			: [];
		let stored: Preset | null = null;
		const presetRepository = {
			list: vi.fn(async () => localStore),
			listLocalPresets: vi.fn(() => localStore),
			getById: vi.fn(async (id: string) => {
				return localStore.find((row) => row.id === id) ?? undefined;
			}),
			upsertLocalPreset: vi.fn(async (preset: Preset) => {
				stored = preset;
				localStore.push(preset);
			}),
			upsertLocalPresets: vi.fn(async (presets: Preset[]) => {
				localStore.push(...presets);
			}),
			removeLocalPreset: vi.fn(async (id: string) => {
				const index = localStore.findIndex((row) => row.id === id);
				if (index >= 0) localStore.splice(index, 1);
			}),
		};
		const gateway = {
			provider: "supabase" as const,
			resolvePreset: vi.fn(),
			downloadPreset: vi.fn(
				async (
					request: PresetDownloadRequest,
				): Promise<PresetDownloadResult> => ({
					bytesWritten: 64,
					sha256: "0".repeat(64),
					finalUrl: "https://cdn.example.com/presets/MyPreset.ffx",
					destination: request.destination,
				}),
			),
		};
		vi.mocked(getDataServices).mockReturnValue({
			gateway,
			cloudSync: createCloudSyncService({ gateway }),
			presetRepository,
			resolveSystemPaths: () => systemPaths,
			bootMode: "live" as const,
		});
		return {
			presetRepository,
			gateway,
			getStored: () => stored as UpsertCall["preset"] | null,
		};
	};

	beforeEach(() => {
		vi.mocked(getDataServices).mockReset();
		vi.mocked(evalScript).mockReset();
		vi.mocked(evalScript).mockResolvedValue("true");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("assigns a bare UUID id and forwards it to the runtime install", async () => {
		const harness = setupDataServices();
		const result = await downloadAndInstallPreset(
			win,
			cloudPresetId,
			undefined,
			{
				title: "My Preset",
			},
		);
		expect(isUuidLike(result.preset.id)).toBe(true);
		expect(result.preset.id.startsWith("downloaded_")).toBe(false);
		expect(result.preset.id).not.toContain(cloudPresetId);
		expect(harness.gateway.downloadPreset).toHaveBeenCalledWith({
			presetId: cloudPresetId,
			destination:
				"C:/Users/me/Documents/Adobe/Presets/ty-plus/downloads/My Preset.ffx",
			record: expect.objectContaining({
				id: result.preset.id,
				type: "preset",
				title: "My Preset",
				sourceCatalogId: cloudPresetId,
			}),
		});
	});

	it("persists the source cloud presetId in data.sourceCatalogId", async () => {
		const harness = setupDataServices();
		await downloadAndInstallPreset(win, cloudPresetId, undefined, {
			title: "My Preset",
		});
		const stored = harness.getStored();
		expect(stored).not.toBeNull();
		expect(stored?.data?.sourceCatalogId).toBe(cloudPresetId);
	});

	it("two distinct downloads produce two distinct UUIDs", async () => {
		const harness = setupDataServices();
		const first = await downloadAndInstallPreset(
			win,
			"preset.cloud.first",
			undefined,
			{
				title: "First",
			},
		);
		const second = await downloadAndInstallPreset(
			win,
			"preset.cloud.second",
			undefined,
			{
				title: "Second",
			},
		);
		expect(first.preset.id).not.toBe(second.preset.id);
		expect(isUuidLike(first.preset.id)).toBe(true);
		expect(isUuidLike(second.preset.id)).toBe(true);
	});

	it("routes the destination by catalog category and forwards the record", async () => {
		const harness = setupDataServices();
		await downloadAndInstallPreset(win, cloudPresetId, undefined, {
			title: "My Preset",
			category: "script",
		});
		expect(harness.gateway.downloadPreset).toHaveBeenCalledWith({
			presetId: cloudPresetId,
			destination:
				"C:/Users/me/AppData/Roaming/Adobe/CEP/extensions/ty-plus/downloads/My Preset.jsx",
			record: expect.objectContaining({
				type: "script",
				category: "script",
				filePath:
					"C:/Users/me/AppData/Roaming/Adobe/CEP/extensions/ty-plus/downloads/My Preset.jsx",
				sourceCatalogId: cloudPresetId,
			}),
		});
	});

	it("stores descriptionImage as the gallery URL and prefixed description without fetching the body", async () => {
		const harness = setupDataServices();
		const fetcher = vi.fn();
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetcher as unknown as typeof globalThis.fetch;
		try {
			await downloadAndInstallPreset(win, cloudPresetId, undefined, {
				title: "My Preset",
				description: "cloud description",
				thumbnailUrl: "https://cdn.example.com/thumbs/MyPreset.png",
			});
			const stored = harness.getStored();
			expect(stored?.descriptionImage).toBe(
				"https://cdn.example.com/thumbs/MyPreset.png",
			);
			expect(stored?.description).toBe(
				"[Downloaded from catalog] cloud description",
			);
			// NET-010: the preset body is downloaded inside the Rust runtime.
			expect(fetcher).not.toHaveBeenCalled();
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("emits stage progress events without any network body transfer", async () => {
		const harness = setupDataServices();
		const events: DownloadProgress[] = [];
		await downloadAndInstallPreset(
			win,
			cloudPresetId,
			(event) => events.push(event),
			{
				title: "My Preset",
				category: "preset",
			},
		);
		expect(events.map((e) => e.stage)).toContain("fetch");
		expect(events.map((e) => e.stage)).toContain("download");
		expect(events.map((e) => e.stage)).toContain("register");
		expect(
			events.every((e) => e.bytesLoaded === undefined || e.bytesTotal === 0),
		).toBe(true);
	});

	it("throws when the runtime download is unavailable", async () => {
		const harness = setupDataServices();
		delete (harness.gateway as { downloadPreset?: unknown }).downloadPreset;
		await expect(downloadAndInstallPreset(win, cloudPresetId)).rejects.toThrow(
			/Runtime download is unavailable/,
		);
	});
});

describe("importPreset / isPresetDownloadedLocally (UUID dedup)", () => {
	const win = {} as Window;
	const cloudPresetId = "preset.cloud.dedup";

	beforeEach(() => {
		vi.mocked(getDataServices).mockReset();
		vi.mocked(evalScript).mockReset();
		vi.mocked(evalScript).mockResolvedValue("true");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const seedLocalWith = (preset: Preset) => {
		const locals: Preset[] = [preset];
		const presetRepository = {
			list: vi.fn(async () => locals),
			listLocalPresets: vi.fn(() => locals),
			getById: vi.fn(async (id: string) => locals.find((row) => row.id === id)),
			upsertLocalPreset: vi.fn(async (p: Preset) => {
				locals.push(p);
			}),
			upsertLocalPresets: vi.fn(async (presets: Preset[]) => {
				locals.push(...presets);
			}),
			removeLocalPreset: vi.fn(async (id: string) => {
				const index = locals.findIndex((row) => row.id === id);
				if (index >= 0) locals.splice(index, 1);
			}),
		};
		const gateway = {
			provider: "supabase" as const,
			resolvePreset: vi.fn(),
			downloadPreset: vi.fn(),
		};
		vi.mocked(getDataServices).mockReturnValue({
			gateway,
			cloudSync: createCloudSyncService({ gateway }),
			presetRepository,
			resolveSystemPaths: () => systemPaths,
			bootMode: "live" as const,
		});
	};

	it("isPresetDownloadedLocally finds a row by data.sourceCatalogId (UUID id)", async () => {
		const localId = "11111111-2222-4333-8444-555555555555";
		seedLocalWith({
			id: localId,
			type: "preset",
			title: "Already downloaded",
			filePath: "C:/Users/me/Documents/Adobe/Presets/ty-plus/downloads/x.ffx",
			data: { sourceCatalogId: cloudPresetId },
		});
		const result = await isPresetDownloadedLocally(cloudPresetId);
		expect(result).toBe(true);
	});

	it("isPresetDownloadedLocally returns false when no local row matches", async () => {
		seedLocalWith({
			id: "11111111-2222-4333-8444-555555555555",
			type: "preset",
			title: "Unrelated",
			filePath: "C:/Users/me/Documents/Adobe/Presets/ty-plus/downloads/x.ffx",
			data: { sourceCatalogId: "preset.cloud.unrelated" },
		});
		const result = await isPresetDownloadedLocally(cloudPresetId);
		expect(result).toBe(false);
	});

	it("importPreset short-circuits (returns true) when a downloaded row already exists", async () => {
		const localId = "11111111-2222-4333-8444-555555555555";
		seedLocalWith({
			id: localId,
			type: "preset",
			title: "Already downloaded",
			filePath: "C:/Users/me/Documents/Adobe/Presets/ty-plus/downloads/x.ffx",
			data: { sourceCatalogId: cloudPresetId },
		});
		// importPreset must not trigger any download side-effects on a hit.
		const originalFetch = globalThis.fetch;
		const fetcher = vi.fn();
		globalThis.fetch = fetcher as unknown as typeof globalThis.fetch;
		try {
			const result = await importPreset(win, cloudPresetId);
			expect(result).toBe(true);
			expect(fetcher).not.toHaveBeenCalled();
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
