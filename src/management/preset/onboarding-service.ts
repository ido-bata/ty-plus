/**
 * Onboarding preset import service.
 *
 * Moves preset repository mutation out of OnboardingView into a dedicated service.
 */

import type { AfterEffectsFilesRuntimeGateway } from "@/management/ae/files/runtime-gateway-impl";
import type { Preset } from "@/management/preset/contract";
import { presetIconImage } from "@/management/preset/contract";
import type { GroupCatalogEntry } from "@/management/preset/group-catalog";
import { coercePersistedPresetIcon } from "@/management/preset/icon-data";
import {
	collectFilePresetCandidates,
	collectFilePresetCandidatesWithScannedFolders,
	type OnboardingPresetCandidate,
	resolveOnboardingProjectedPresetIds,
	resolveOnboardingWorkspacePanelRefIds,
} from "@/management/preset/onboarding-import";
import {
	resolveSiblingImageIconSrc,
	type SiblingListingEntry,
} from "@/management/preset/sibling-thumbnail";
import { createLocalPresetCatalogId } from "@/management/storage/ids";
import { logWorkspace } from "@/management/workspace/onboarding/flow-log";

export type OnboardingImportOptions = {
	/** Selected file paths by kind */
	selectedFiles: {
		presets: Set<string>;
		scripts: Set<string>;
		plugins: Set<string>;
	};
	/** Selected folder paths by kind */
	selectedFolders: {
		presets: Set<string>;
		scripts: Set<string>;
		plugins: Set<string>;
	};
	/** Whether to recursively scan folders for matching file extensions */
	canScanFolders: boolean;
	/** Optional pre-collected candidates (used when canScanFolders is false and candidates already known) */
	candidates?: OnboardingPresetCandidate[];
	/**
	 * When exactly one folder group row is created in this import, use this id for `groups.json`
	 * instead of a random UUID (e.g. dialog preview id `local-preset-…`).
	 */
	folderGroupIdOverride?: string;
	/** Display name for the folder group row (overrides folder basename from candidates). */
	folderGroupNameOverride?: string;
};

export type OnboardingImportResult = {
	/** Full catalog after import (`repository.list()`), for UI snapshot / publish. */
	presets: Preset[];
	/** File/script/plugin rows created in this import  Emerge into `presets.json` only. */
	addedPresets: Preset[];
	addedPresetIds: string[];
	/** Folder groups for `groups.json` (never preset catalog rows). */
	addedGroupCatalogEntries: GroupCatalogEntry[];
	projectedPresetIds: string[];
	/** Preset / group ids that should get workspace tiles (folder absorbs child files). */
	workspacePanelRefIds: string[];
};

const normalizePathKey = (value: string): string =>
	value.trim().replaceAll("\\", "/").toLowerCase();

const pathIsWithin = (candidatePath: string, folderPath: string): boolean => {
	const file = normalizePathKey(candidatePath).replace(/\/+$/, "");
	const folder = normalizePathKey(folderPath).replace(/\/+$/, "");
	if (!file || !folder) {
		return false;
	}
	return file === folder || file.startsWith(`${folder}/`);
};

const buildCandidates = async (
	options: OnboardingImportOptions,
	listDirectory: (
		dirPath: string,
	) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>,
): Promise<OnboardingPresetCandidate[]> => {
	if (options.candidates) {
		return options.candidates;
	}
	if (!options.canScanFolders) {
		const selectedFolderPaths = new Set<string>();
		for (const key of ["presets", "scripts", "plugins"] as const) {
			for (const path of options.selectedFolders[key]) {
				selectedFolderPaths.add(path);
			}
		}
		return collectFilePresetCandidates({
			...options.selectedFiles,
			folders: selectedFolderPaths,
		});
	}
	// canScanFolders is true: scan folders AND use explicit file selections.
	// This handles both recursive folder scanning AND direct file picks in one pass.
	try {
		return await collectFilePresetCandidatesWithScannedFolders(
			{
				selectedFiles: options.selectedFiles,
				selectedFolders: options.selectedFolders,
			},
			listDirectory,
		);
	} catch {
		// Fallback: build candidates from explicit file selections only,
		// without the recursive folder scan.
		const selectedFolderPaths = new Set<string>();
		for (const key of ["presets", "scripts", "plugins"] as const) {
			for (const path of options.selectedFolders[key]) {
				selectedFolderPaths.add(path);
			}
		}
		return collectFilePresetCandidates({
			...options.selectedFiles,
			folders: selectedFolderPaths,
		});
	}
};

export const importOnboardingPresets = async (
	options: OnboardingImportOptions,
	repository: {
		list(): Promise<Preset[]>;
		upsertLocalPreset(preset: Preset): Promise<void>;
		upsertLocalPresets?(presets: Preset[]): Promise<void>;
	},
	listDirectory: (
		dirPath: string,
	) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>,
	/**
	 * Optional thumbnail gateway. When provided, sibling image paths
	 * are routed through `lookupThumbnail` so the persisted preset
	 * `icon` references the WebP cache URL instead of the raw source
	 * path. Without the gateway (tests, missing provider), sibling
	 * resolution falls back to the raw path so the rest of the import
	 * keeps working.
	 */
	thumbnailGateway?: AfterEffectsFilesRuntimeGateway | null,
): Promise<OnboardingImportResult> => {
	const candidates = await buildCandidates(options, listDirectory);

	if (candidates.length === 0) {
		logWorkspace("importOnboardingPresets:no-candidates", {
			canScanFolders: options.canScanFolders,
		});
		return {
			presets: [],
			addedPresets: [],
			addedPresetIds: [],
			addedGroupCatalogEntries: [],
			projectedPresetIds: [],
			workspacePanelRefIds: [],
		};
	}

	const before = await repository.list();

	const knownFilePaths = new Set(
		before.flatMap((preset) => {
			const filePath = normalizePathKey(preset.filePath);
			return filePath ? [filePath] : [];
		}),
	);
	const knownIds = new Set(before.map((preset) => preset.id));

	const dirListingCache = new Map<string, SiblingListingEntry[]>();
	const siblingIconSrcByFileKey = new Map<string, string | null>();
	const uniqueFilePaths: string[] = [];
	const seenFileKeys = new Set<string>();
	for (const candidate of candidates) {
		if (candidate.type === "group") {
			continue;
		}
		const fk = normalizePathKey(candidate.filePath);
		if (seenFileKeys.has(fk)) {
			continue;
		}
		seenFileKeys.add(fk);
		uniqueFilePaths.push(candidate.filePath);
	}
	const siblingIconResults = await Promise.all(
		uniqueFilePaths.map(async (fp) => {
			const siblingPath = await resolveSiblingImageIconSrc(
				fp,
				listDirectory,
				dirListingCache,
			);
			if (!siblingPath) {
				return null;
			}
			if (!thumbnailGateway) {
				return siblingPath;
			}
			try {
				const lookup = await thumbnailGateway.lookupThumbnail({
					source_path: siblingPath,
					// Sentinel mtime matches the synthetic entries used by
					// `EntryThumb` / `GlyphCachedImage` so the cache key is
					// stable across renders for the same sibling.
					mtime_ms: Date.parse("2026-01-01T00:00:00.000Z"),
					size_bytes: 0,
					file_type: "image",
				});
				return lookup.cache_path ?? siblingPath;
			} catch {
				// Cache failure is non-fatal for onboarding — fall back
				// to the raw path so the import still completes.
				return siblingPath;
			}
		}),
	);
	for (let i = 0; i < uniqueFilePaths.length; i++) {
		const fp = uniqueFilePaths[i];
		const result = siblingIconResults[i];
		if (fp === undefined || result === undefined) continue;
		siblingIconSrcByFileKey.set(normalizePathKey(fp), result);
	}

	const addedFilePresets: Preset[] = [];

	for (const candidate of candidates) {
		if (candidate.type === "group") {
			continue;
		}
		const filePathKey = normalizePathKey(candidate.filePath);
		if (!filePathKey || knownFilePaths.has(filePathKey)) {
			continue;
		}
		let presetId = createLocalPresetCatalogId();
		while (knownIds.has(presetId)) {
			presetId = createLocalPresetCatalogId();
		}
		knownIds.add(presetId);
		knownFilePaths.add(filePathKey);
		const siblingSrc = siblingIconSrcByFileKey.get(filePathKey);
		addedFilePresets.push({
			id: presetId,
			type: candidate.type,
			title: candidate.title,
			filePath: candidate.filePath,
			icon:
				typeof siblingSrc === "string" && siblingSrc.trim()
					? presetIconImage(siblingSrc)
					: coercePersistedPresetIcon(candidate.type, undefined),
		});
	}

	if (addedFilePresets.length > 0) {
		if (typeof repository.upsertLocalPresets === "function") {
			await repository.upsertLocalPresets(addedFilePresets);
		} else {
			await Promise.all(
				addedFilePresets.map((record) => repository.upsertLocalPreset(record)),
			);
		}
	}

	const mid = await repository.list();
	const presetIdByFilePath = new Map<string, string>();
	for (const preset of mid) {
		presetIdByFilePath.set(normalizePathKey(preset.filePath), preset.id);
	}

	const addedGroupCatalogEntries: GroupCatalogEntry[] = [];
	const folderGroupIdsByPath = new Map<string, string>();

	for (const candidate of candidates) {
		if (candidate.type !== "group") {
			continue;
		}
		const rootFolder = candidate.filePath;
		const rootKey = normalizePathKey(rootFolder);
		if (!rootKey || folderGroupIdsByPath.has(rootKey)) {
			continue;
		}

		const memberPresetIds = Array.from(
			new Set(
				candidates.flatMap((candidate) => {
					if (
						candidate.type === "group" ||
						!pathIsWithin(candidate.filePath, rootFolder)
					) {
						return [];
					}
					const presetId = presetIdByFilePath.get(
						normalizePathKey(candidate.filePath),
					);
					return presetId ? [presetId] : [];
				}),
			),
		);

		if (memberPresetIds.length === 0) {
			for (const preset of mid) {
				if (pathIsWithin(preset.filePath, rootFolder)) {
					memberPresetIds.push(preset.id);
				}
			}
		}

		const uniqueMembers = Array.from(new Set(memberPresetIds));
		if (uniqueMembers.length === 0) {
			continue;
		}

		const overrideId = options.folderGroupIdOverride?.trim();
		const useIdOverride =
			Boolean(overrideId) &&
			folderGroupIdsByPath.size === 0 &&
			!knownIds.has(overrideId ?? "");

		let groupId: string;
		if (useIdOverride && overrideId) {
			groupId = overrideId;
		} else {
			groupId = createLocalPresetCatalogId();
			while (knownIds.has(groupId)) {
				groupId = createLocalPresetCatalogId();
			}
		}
		knownIds.add(groupId);
		folderGroupIdsByPath.set(rootKey, groupId);

		const name =
			options.folderGroupNameOverride?.trim() ||
			(typeof candidate.title === "string" && candidate.title.trim()
				? candidate.title.trim()
				: undefined);
		const icon = coercePersistedPresetIcon("preset", undefined);
		addedGroupCatalogEntries.push({
			id: groupId,
			title: name || "Group",
			presetIds: uniqueMembers,
			icon,
		});
	}

	const after = mid;

	const projectedPresetIds = resolveOnboardingProjectedPresetIds({
		candidateFilePaths: candidates.flatMap((candidate) =>
			candidate.type === "group" ? [] : [candidate.filePath],
		),
		allPresets: after,
		addedPresetIds: addedFilePresets.map((preset) => preset.id),
		addedWorkspaceCatalogRefIds: addedGroupCatalogEntries.map((g) => g.id),
	});

	const workspacePanelRefIds = resolveOnboardingWorkspacePanelRefIds({
		candidates,
		allPresets: after,
		folderGroupIdsByNormalizedPath: folderGroupIdsByPath,
	});

	logWorkspace("importOnboardingPresets:done", {
		candidateCount: candidates.length,
		addedFilePresetCount: addedFilePresets.length,
		addedGroupCount: addedGroupCatalogEntries.length,
		catalogPresetCount: after.length,
		workspacePanelRefIds,
		addedPresetIds: addedFilePresets.map((p) => p.id),
	});

	return {
		presets: after,
		addedPresets: addedFilePresets.map((row) => ({ ...row })),
		addedPresetIds: addedFilePresets.map((preset) => preset.id),
		addedGroupCatalogEntries: addedGroupCatalogEntries.map((g) => ({
			...g,
			presetIds: [...g.presetIds],
		})),
		projectedPresetIds,
		workspacePanelRefIds,
	};
};
