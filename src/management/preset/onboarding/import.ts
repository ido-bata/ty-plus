import { inferPresetTypeFromFilePath } from "@/management/preset/authoring/request";
import type { Preset, PresetType } from "@/management/preset/contract";

export type OnboardingSelectedFiles = {
	presets: Set<string>;
	scripts: Set<string>;
	plugins: Set<string>;
	folders?: Set<string>;
};

export type OnboardingPresetCandidate = {
	filePath: string;
	title: string;
	type: PresetType | "group";
};

export type OnboardingFileBrowserEntry = {
	name: string;
	path: string;
	isDirectory: boolean;
};

const ONBOARDING_FOLDER_EXTENSIONS: Record<
	"presets" | "scripts" | "plugins",
	readonly string[]
> = {
	presets: [".ffx"],
	scripts: [".jsx", ".jsxbin", ".js"],
	plugins: [".aex", ".plugin"],
};

const normalizePathKey = (value: string): string =>
	value.trim().replaceAll("\\", "/").toLowerCase();

const fileBaseName = (filePath: string): string =>
	filePath
		.split(/[\\/]/)
		.pop()
		?.replace(/\.[^/.]+$/, "")
		.trim() || filePath;

const createEmptyOnboardingSelectedFiles = (): OnboardingSelectedFiles => ({
	presets: new Set<string>(),
	scripts: new Set<string>(),
	plugins: new Set<string>(),
});

const mergeOnboardingSelectedFiles = (
	base: OnboardingSelectedFiles,
	additions: OnboardingSelectedFiles,
): OnboardingSelectedFiles => ({
	presets: new Set([...base.presets, ...additions.presets]),
	scripts: new Set([...base.scripts, ...additions.scripts]),
	plugins: new Set([...base.plugins, ...additions.plugins]),
});

const shouldIncludeScannedEntry = (
	entry: OnboardingFileBrowserEntry,
	extensions: readonly string[],
): boolean => {
	const lowerName = entry.name.trim().toLowerCase();
	if (!lowerName) {
		return false;
	}
	if (entry.isDirectory) {
		return lowerName.endsWith(".plugin");
	}
	return extensions.some((ext) => lowerName.endsWith(ext));
};

const walkFolderForExtensions = async (
	rootPath: string,
	extensions: readonly string[],
	listDirectory: (dirPath: string) => Promise<OnboardingFileBrowserEntry[]>,
): Promise<string[]> => {
	const collected: string[] = [];
	const queue = [rootPath];
	const visited = new Set<string>();

	while (queue.length > 0) {
		const nextPath = queue.shift();
		if (!nextPath) {
			continue;
		}
		const normalizedPath = normalizePathKey(nextPath);
		if (!normalizedPath || visited.has(normalizedPath)) {
			continue;
		}
		visited.add(normalizedPath);

		const entries = await listDirectory(nextPath);
		for (const entry of entries) {
			if (shouldIncludeScannedEntry(entry, extensions)) {
				collected.push(entry.path);
				continue;
			}
			if (!entry.isDirectory) {
				continue;
			}
			queue.push(entry.path);
		}
	}

	return collected;
};

const collectOnboardingFilesFromSelectedFolders = async (
	selectedFolders: Record<"presets" | "scripts" | "plugins", Set<string>>,
	listDirectory: (dirPath: string) => Promise<OnboardingFileBrowserEntry[]>,
): Promise<OnboardingSelectedFiles> => {
	const collected = createEmptyOnboardingSelectedFiles();
	const tasks: Array<
		Promise<{ kind: "presets" | "scripts" | "plugins"; filePaths: string[] }>
	> = [];
	for (const kind of ["presets", "scripts", "plugins"] as const) {
		const extensions = ONBOARDING_FOLDER_EXTENSIONS[kind];
		for (const rawFolderPath of selectedFolders[kind]) {
			const folderPath = rawFolderPath.trim();
			if (!folderPath) {
				continue;
			}
			tasks.push(
				walkFolderForExtensions(folderPath, extensions, listDirectory).then(
					(filePaths) => ({ kind, filePaths }),
				),
			);
		}
	}
	const results = await Promise.all(tasks);
	for (const { kind, filePaths } of results) {
		for (const filePath of filePaths) {
			const normalized = filePath.trim();
			if (!normalized) {
				continue;
			}
			collected[kind].add(normalized);
		}
	}
	return collected;
};

export const collectFilePresetCandidates = (
	selected: OnboardingSelectedFiles,
): OnboardingPresetCandidate[] => {
	const rows: OnboardingPresetCandidate[] = [];
	const seen = new Set<string>();
	const allPaths = [
		...selected.presets,
		...selected.scripts,
		...selected.plugins,
	];

	for (const raw of allPaths) {
		const filePath = raw.trim();
		if (!filePath) {
			continue;
		}
		const key = normalizePathKey(filePath);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		rows.push({
			filePath,
			type: inferPresetTypeFromFilePath(filePath),
			title: fileBaseName(filePath),
		});
	}

	for (const raw of selected.folders ?? []) {
		const folderPath = raw.trim();
		if (!folderPath) {
			continue;
		}
		const key = normalizePathKey(folderPath);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		rows.push({
			filePath: folderPath,
			type: "group",
			title: fileBaseName(folderPath),
		});
	}
	return rows;
};

export const collectFilePresetCandidatesWithScannedFolders = async (
	input: {
		selectedFiles: OnboardingSelectedFiles;
		selectedFolders: Record<"presets" | "scripts" | "plugins", Set<string>>;
	},
	listDirectory: (dirPath: string) => Promise<OnboardingFileBrowserEntry[]>,
): Promise<OnboardingPresetCandidate[]> => {
	const scanned = await collectOnboardingFilesFromSelectedFolders(
		input.selectedFolders,
		listDirectory,
	);
	const merged = mergeOnboardingSelectedFiles(input.selectedFiles, scanned);
	const folderPaths = new Set<string>();
	for (const kind of ["presets", "scripts", "plugins"] as const) {
		for (const folderPath of input.selectedFolders[kind]) {
			folderPaths.add(folderPath);
		}
	}
	return collectFilePresetCandidates({
		...merged,
		folders: folderPaths,
	});
};

const pathIsWithin = (candidatePath: string, folderPath: string): boolean => {
	const file = normalizePathKey(candidatePath).replace(/\/+$/, "");
	const folder = normalizePathKey(folderPath).replace(/\/+$/, "");
	if (!file || !folder) {
		return false;
	}
	return file === folder || file.startsWith(`${folder}/`);
};

/**
 * Preset / folder-group ids that should receive **workspace tiles** after onboarding.
 * Files contained in a selected folder are represented only by the folder group tile.
 */
export const resolveOnboardingWorkspacePanelRefIds = (input: {
	candidates: readonly OnboardingPresetCandidate[];
	allPresets: readonly Preset[];
	/** Normalized folder root path ↁEstable group catalog id (from `groups.json` SoT). */
	folderGroupIdsByNormalizedPath?: ReadonlyMap<string, string>;
}): string[] => {
	const presetIdByFilePath = new Map<string, string>();
	for (const preset of input.allPresets) {
		const key = normalizePathKey(preset.filePath);
		if (!presetIdByFilePath.has(key)) {
			presetIdByFilePath.set(key, preset.id);
		}
	}

	const folderRoots: string[] = [];
	for (const c of input.candidates) {
		if (c.type !== "group") {
			continue;
		}
		const root = c.filePath.trim();
		if (root) {
			folderRoots.push(root);
		}
	}

	const ordered: string[] = [];
	const seen = new Set<string>();

	const folderIdByPath = input.folderGroupIdsByNormalizedPath;

	for (const c of input.candidates) {
		if (c.type !== "group") {
			continue;
		}
		const pathKey = normalizePathKey(c.filePath);
		const id = folderIdByPath?.get(pathKey);
		if (id && !seen.has(id)) {
			ordered.push(id);
			seen.add(id);
		}
	}

	for (const c of input.candidates) {
		if (c.type === "group") {
			continue;
		}
		const insideFolder = folderRoots.some((root) =>
			pathIsWithin(c.filePath, root),
		);
		if (insideFolder) {
			continue;
		}
		const id = presetIdByFilePath.get(normalizePathKey(c.filePath));
		if (id && !seen.has(id)) {
			ordered.push(id);
			seen.add(id);
		}
	}

	return ordered;
};

export const resolveOnboardingProjectedPresetIds = (input: {
	candidateFilePaths: readonly string[];
	allPresets: readonly Pick<Preset, "id" | "filePath">[];
	addedPresetIds?: readonly string[];
	/** Group / folder-tile ids written to `groups.json` (not preset catalog rows). */
	addedWorkspaceCatalogRefIds?: readonly string[];
}): string[] => {
	const presetIdByFilePath = new Map<string, string>();
	for (const preset of input.allPresets) {
		const key = normalizePathKey(preset.filePath);
		if (!presetIdByFilePath.has(key)) {
			presetIdByFilePath.set(key, preset.id);
		}
	}
	const resolvedByCandidates = input.candidateFilePaths.flatMap((filePath) => {
		const presetId = presetIdByFilePath.get(normalizePathKey(filePath));
		return presetId ? [presetId] : [];
	});
	const addedPresetIds = (input.addedPresetIds ?? []).flatMap((presetId) => {
		const id = presetId.trim();
		return id ? [id] : [];
	});
	const addedWorkspaceIds = (input.addedWorkspaceCatalogRefIds ?? []).flatMap(
		(id) => {
			const trimmedId = id.trim();
			return trimmedId ? [trimmedId] : [];
		},
	);
	return Array.from(
		new Set([...resolvedByCandidates, ...addedPresetIds, ...addedWorkspaceIds]),
	);
};
