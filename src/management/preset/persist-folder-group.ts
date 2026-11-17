import {
	type IconRule,
	mergeGroupEntries,
	upsertGroupEntry,
} from "@/management/preset/group-catalog";
import {
	type PresetIconEditorDraft,
	presetIconDraftToPresetIcon,
} from "@/management/preset/icon-editor";
import { collectFolderPresetCandidates } from "@/management/preset/onboarding-import";
import { importOnboardingPresets } from "@/management/preset/onboarding-service";
import { getLocalPresetCatalog } from "@/management/preset/repository/local-catalog";
import { listPresets } from "@/management/preset/use-cases";
import {
	canUseCepNodeFileBrowser,
	createCepNodeFileBrowserService,
} from "@/management/storage/file-browser-service";

export type PersistFolderGroupPresetInput = {
	folderPaths?: string[];
	presetIdsText: string;
	recursive: boolean;
	groupId: string;
	groupName: string;
	baseIcon?: PresetIconEditorDraft;
	conditionRules?: IconRule[];
};

const parseManualPresetIds = (raw: string): string[] => {
	const lines = raw
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	return Array.from(new Set(lines));
};

const buildIconRules = (
	baseIcon: PresetIconEditorDraft | undefined,
	conditionRules: readonly IconRule[] | undefined,
): IconRule[] | undefined => {
	const rules: IconRule[] = [];

	if (baseIcon) {
		const resolvedIcon = presetIconDraftToPresetIcon(baseIcon);
		if (resolvedIcon) {
			rules.push({ icon: resolvedIcon });
		}
	}

	if (conditionRules && conditionRules.length > 0) {
		rules.push(...conditionRules);
	}

	return rules.length > 0 ? rules : undefined;
};

/**
 * Persists a workspace folder group: either explicit `presetIds` or scan + import (`.ffx` under folder).
 * Writes `presets.json` deltas via the preset repository and merges `groups.json`.
 */
export const persistFolderGroupPreset = async (
	win: Window,
	input: PersistFolderGroupPresetInput,
): Promise<{ status: string; catalogRefIds?: readonly string[] }> => {
	const folderPaths = (input.folderPaths ?? []).flatMap((path) => {
		const trimmedPath = path.trim();
		return trimmedPath ? [trimmedPath] : [];
	});
	if (folderPaths.length === 0) {
		throw new Error("Please enter at least one folder path.");
	}

	const manualIds = parseManualPresetIds(input.presetIdsText);
	if (manualIds.length > 0) {
		const catalog = await listPresets();
		const byId = new Map(catalog.map((p) => [p.id, p]));
		const missing = manualIds.filter((id) => !byId.has(id));
		if (missing.length > 0) {
			throw new Error(
				`Preset IDs not found in catalog: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? " …" : ""}`,
			);
		}
		const gid = input.groupId.trim();
		const iconRules = buildIconRules(input.baseIcon, input.conditionRules);
		await upsertGroupEntry(win, {
			id: gid,
			title: input.groupName.trim() || "Group",
			presetIds: manualIds,
			...(iconRules && { iconRules }),
		});
		return {
			status: `Group saved (${manualIds.length} items): ${gid}`,
			catalogRefIds: [gid],
		};
	}

	if (!canUseCepNodeFileBrowser(win)) {
		throw new Error(
			"Folder scanning requires CEP Node file browser. Enter preset IDs manually or enable CEP Node.",
		);
	}

	const listDirectory = async (dirPath: string) => {
		const svc = createCepNodeFileBrowserService({ win });
		const rows = await svc.listDirectory(dirPath);
		return rows.map((e) => ({
			name: e.name,
			path: e.path,
			isDirectory: e.isDirectory,
		}));
	};

	// Issue #139: group creation must not depend on cloud gateway boot. The
	// imported presets are local file-backed rows, so they go through the
	// local catalog — the same owner `listPresets`/`upsertLocalPreset` use.
	// Folder paths are kind-agnostic: the scan collects every preset-able
	// file type (ffx/jsx/jsxbin/js/aex/plugin), not just `.ffx`.
	const repo = getLocalPresetCatalog(win);
	// `recursive: false` means a flat scan of the folder roots themselves —
	// top-level preset-able files only, no descent into subdirectories.
	// It previously produced zero file candidates and only grouped
	// already-registered presets (issue #191 audit).
	const candidates = await collectFolderPresetCandidates(
		folderPaths,
		listDirectory,
		{ recursive: input.recursive ?? true },
	);
	const result = await importOnboardingPresets(
		{
			selectedFiles: {
				presets: new Set(),
				scripts: new Set(),
				plugins: new Set(),
			},
			selectedFolders: {
				presets: new Set(),
				scripts: new Set(),
				plugins: new Set(),
			},
			canScanFolders: false,
			candidates,
			folderGroupIdOverride: input.groupId.trim(),
			folderGroupNameOverride: input.groupName.trim(),
		},
		repo,
		listDirectory,
	);

	if (result.addedGroupCatalogEntries.length === 0) {
		throw new Error("No preset files found in folder.");
	}

	// Build icon rules from base icon and condition rules
	const iconRules = buildIconRules(input.baseIcon, input.conditionRules);
	if (iconRules && result.addedGroupCatalogEntries[0]) {
		result.addedGroupCatalogEntries[0] = {
			...result.addedGroupCatalogEntries[0],
			iconRules,
		};
	}

	await mergeGroupEntries(win, result.addedGroupCatalogEntries);

	const g = result.addedGroupCatalogEntries[0];
	if (!g) {
		throw new Error("Failed to generate group row.");
	}
	return {
		status: `Group saved: ${g.id} (members: ${g.presetIds.length}, new presets: ${result.addedPresetIds.length})`,
		catalogRefIds: [g.id],
	};
};
