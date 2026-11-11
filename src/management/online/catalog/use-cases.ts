import type {
	PresetSearchItem,
	PresetSearchParams,
} from "@/management/online/contract";
import type { Preset } from "@/management/preset/contract";

/** Local alias matching shared/contract HostFileSystemPaths (not exported there). */
type SystemPaths = {
	hostId: string;
	operatingSystem: string;
	userSupportRoot: string;
	hostSupportRoot?: string;
	presetRoot?: string;
	scriptRoot?: string;
	pluginRoot?: string;
	cepUserExtensionsRoot?: string;
	cepCommonExtensionsRoot?: string;
};

import { evalScript } from "@/management/ae/cep/eval";
import {
	mapCategoryToType,
	resolveDownloadFileLayout,
} from "@/management/online/catalog/download-detection";
import { sanitizeOnlineErrorMessage } from "@/management/online/catalog/sanitize-error";
import { inferPresetTypeFromFilePath } from "@/management/preset/authoring/request";
import type { PresetType } from "@/management/preset/contract";
import { createLocalPresetCatalogId } from "@/management/storage/ids";
import { assertOpaqueId } from "@/management/storage/ids.assert";
import { getDataServices } from "@/management/workspace/services";

export type CatalogSearchResult = {
	items: PresetSearchItem[];
};

export type DownloadProgress = {
	stage: "fetch" | "download" | "write" | "icon" | "register";
	bytesLoaded?: number;
	bytesTotal?: number;
};

type DownloadProgressCallback = ((event: DownloadProgress) => void) | undefined;

export const searchCatalog = async (
	params: PresetSearchParams,
): Promise<CatalogSearchResult> => {
	const { gateway } = getDataServices();
	if (!gateway.searchPresets) {
		return { items: [] };
	}
	const result = await gateway.searchPresets(params);
	return result;
};

export const importPreset = async (
	win: Window,
	presetId: string,
	onProgress?: DownloadProgressCallback,
): Promise<boolean> => {
	const { presetRepository } = getDataServices();

	// Check if already downloaded locally: a row whose `data.sourceCatalogId`
	// points at the same cloud preset id. UUIDs are opaque, so we cannot
	// derive a deterministic id from `presetId`; scan the local store.
	if (findLocalBySourceCatalogId(presetRepository, presetId)) {
		return true;
	}

	// If not downloaded yet, download the preset
	try {
		await downloadAndInstallPreset(win, presetId, onProgress);
		return true;
	} catch (error) {
		console.error(
			`Failed to import preset ${presetId}: ${sanitizeOnlineErrorMessage(
				error instanceof Error ? error.message : String(error),
			)}`,
		);
		return false;
	}
};

export const syncCatalog = async () => {
	const { cloudSync } = getDataServices();
	return cloudSync.syncPresets();
};

export type InstallResult = {
	preset: Preset;
	stage?: DownloadProgress;
};

/**
 * Download options sourced from the market search row. The preset body is
 * fetched and installed inside the Rust runtime (`online.download`), so the
 * TS side only supplies the catalog metadata needed to compute the on-disk
 * destination and the record to commit.
 */
export type DownloadOptions = {
	title?: string;
	category?: string;
	description?: string;
	thumbnailUrl?: string;
};

export const downloadAndInstallPreset = async (
	win: Window,
	presetId: string,
	onProgress?: DownloadProgressCallback,
	options?: DownloadOptions,
): Promise<InstallResult> => {
	// Ask confirmation before downloading
	const confirmed = await evalScript(win, "confirm('Download this preset?')");
	if (String(confirmed).trim() !== "true") {
		throw new Error("Download cancelled by user");
	}

	const { gateway, presetRepository, resolveSystemPaths } = getDataServices();
	if (!gateway.downloadPreset) {
		throw new Error(
			"Runtime download is unavailable (no online transport connected)",
		);
	}

	const systemPaths = resolveSystemPaths();
	if (!systemPaths) {
		throw new Error("System paths not available");
	}
	const isMacOS = systemPaths.operatingSystem === "mac";

	onProgress?.({ stage: "fetch" });

	const title = options?.title?.trim() || presetId;
	const category = options?.category;
	const { ext, baseName } = resolveDownloadFileLayout({
		info: {
			type: mapCategoryToType(category),
			title,
			category,
		},
		presetId,
		isMacOS,
	});
	const fileName = `${baseName}${ext}`;
	const effectiveType = inferPresetTypeFromFilePath(fileName);
	const fullPath = resolvePresetDownloadPath(
		systemPaths,
		fileName,
		effectiveType,
	);
	if (!fullPath || fullPath.includes("undefined")) {
		throw new Error(`Invalid download path: ${fullPath}`);
	}

	// The local record id is generated here and reused as the wire record id,
	// so the Rust install commit and the in-memory repository share one row.
	const localId = createLocalPresetCatalogId();
	assertOpaqueId(localId);

	onProgress?.({ stage: "download", bytesLoaded: 0, bytesTotal: 0 });
	await gateway.downloadPreset({
		presetId,
		destination: fullPath,
		record: {
			id: localId,
			type: effectiveType,
			title,
			filePath: fullPath,
			...(options?.description
				? { description: `[Downloaded from catalog] ${options.description}` }
				: {}),
			...(category ? { category } : {}),
			sourceCatalogId: presetId,
		},
	});

	onProgress?.({ stage: "register" });
	const preset: Preset = {
		id: localId,
		type: effectiveType,
		title,
		filePath: fullPath,
		// `sourceCatalogId` is the only cloud data stashed — future dedup
		// lookups match on it.
		data: { sourceCatalogId: presetId },
		...(options?.description
			? { description: `[Downloaded from catalog] ${options.description}` }
			: {}),
		// Description image is stored as a URL reference, not a local
		// download — the gallery already hosts the asset.
		...(options?.thumbnailUrl
			? { descriptionImage: options.thumbnailUrl }
			: {}),
	};

	await presetRepository.upsertLocalPreset(preset);

	// Show completion alert
	if (effectiveType === "plugin") {
		await evalScript(
			win,
			"alert('Plugin installed. Restart After Effects to use it.')",
		);
	} else {
		await evalScript(win, "alert('Download complete.')");
	}

	return { preset };
};

const listPresetsForSnapshot = async (): Promise<Preset[]> => {
	const { presetRepository } = getDataServices();
	return presetRepository.list();
};

/**
 * Check if a preset is already downloaded locally.
 * Returns true when a local row has `data.sourceCatalogId === presetId`.
 */
export const isPresetDownloadedLocally = async (
	presetId: string,
): Promise<boolean> => {
	const { presetRepository } = getDataServices();
	return Boolean(findLocalBySourceCatalogId(presetRepository, presetId));
};

/**
 * Scan the local store for a row whose `data.sourceCatalogId` matches the
 * given cloud preset id. UUIDs are opaque so we cannot derive a deterministic
 * id from the cloud preset id; this is the supported way to look up the
 * local copy of a downloaded catalog preset.
 */
const findLocalBySourceCatalogId = (
	presetRepository: {
		listLocalPresets(): Preset[];
	},
	presetId: string,
): Preset | null => {
	const locals = presetRepository.listLocalPresets();
	return locals.find((row) => row.data?.sourceCatalogId === presetId) ?? null;
};

/**
 * Resolves the download path for a preset based on its type. The file name is
 * kept as-is (no `ty-plus_` prefix) so the download matches what the user
 * sees in the browser-style save dialog.
 * - script  → <scriptRoot>/ty-plus/downloads/
 * - plugin  → <pluginRoot>/ty-plus/downloads/
 * - preset  → <presetRoot>/ty-plus/downloads/
 * - footage → <hostSupportRoot>/ty-plus/downloads/
 */
export const resolvePresetDownloadPath = (
	systemPaths: SystemPaths,
	fileName: string,
	type: PresetType,
): string => {
	const norm = (p: string | undefined) =>
		p?.replace(/[\\/]+$/, "").replace(/^[\\/]+/, "") ?? "";

	let baseDir: string;
	if (type === "script") {
		baseDir = norm(systemPaths.scriptRoot);
	} else if (type === "plugin") {
		baseDir = norm(systemPaths.pluginRoot);
	} else if (type === "preset") {
		baseDir = norm(systemPaths.presetRoot);
	} else {
		baseDir = norm(systemPaths.hostSupportRoot);
	}

	return `${baseDir}/ty-plus/downloads/${fileName}`;
};
