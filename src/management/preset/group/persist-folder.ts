import { i18n } from "@/management/i18n/index";
import {
	type IconRule,
	mergeGroupEntries,
	upsertGroupEntry,
} from "@/management/preset/group/catalog";
import {
	type PresetIconEditorDraft,
	presetIconDraftToPresetIcon,
} from "@/management/preset/icon/editor-state";
import { importOnboardingPresets } from "@/management/preset/onboarding/service";
import { listPresets } from "@/management/preset/operations";
import { getLocalPresetCatalog } from "@/management/preset/repository/local-catalog";
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
		throw new Error(i18n.t("presets:folderGroup.noFolderPaths"));
	}

	const manualIds = parseManualPresetIds(input.presetIdsText);
	if (manualIds.length > 0) {
		const catalog = await listPresets();
		const byId = new Map(catalog.map((p) => [p.id, p]));
		const missing = manualIds.filter((id) => !byId.has(id));
		if (missing.length > 0) {
			throw new Error(
				i18n.t("presets:folderGroup.presetIdsNotFound", {
					ids: `${missing.slice(0, 6).join(", ")}${missing.length > 6 ? " …" : ""}`,
				}),
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
			status: i18n.t("presets:folderGroup.savedStatusManual", {
				total: manualIds.length,
				id: gid,
			}),
			catalogRefIds: [gid],
		};
	}

	if (!canUseCepNodeFileBrowser(win)) {
		throw new Error(i18n.t("presets:folderGroup.scanRequiresCepNode"));
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
	const repo = getLocalPresetCatalog(win);
	const result = await importOnboardingPresets(
		{
			selectedFiles: {
				presets: new Set(),
				scripts: new Set(),
				plugins: new Set(),
			},
			selectedFolders: {
				presets: new Set(folderPaths),
				scripts: new Set(),
				plugins: new Set(),
			},
			canScanFolders: true,
			recursive: input.recursive,
			folderGroupIdOverride: input.groupId.trim(),
			folderGroupNameOverride: input.groupName.trim(),
		},
		repo,
		listDirectory,
	);

	if (result.addedGroupCatalogEntries.length === 0) {
		throw new Error(i18n.t("presets:folderGroup.noPresetFiles"));
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
		throw new Error(i18n.t("presets:folderGroup.groupRowFailed"));
	}
	return {
		status: i18n.t("presets:folderGroup.savedStatus", {
			id: g.id,
			members: g.presetIds.length,
			added: result.addedPresetIds.length,
		}),
		catalogRefIds: [g.id],
	};
};
