/**
 * Onboarding completion use case.
 * Orchestrates storage operations when onboarding finishes:
 * - Writes merged settings JSON
 * - Initializes widget storage
 * - Initializes preset storage
 * - Initializes workspace layout storage
 */

import type { Preset } from "@/management/preset/contract";
import {
	type GroupCatalogEntry,
	mergeGroupEntries as mergeGroupCatalogEntries,
} from "@/management/preset/group-catalog";
import { initializePresetStorage } from "@/management/preset/initialize";
import { readSupportRootFromSettingsJson } from "@/management/setting/onboarding/initialization";
import { writeSettingsPathsJson } from "@/management/setting/persistence/settings-json-files";
import { stripKnownIdPrefixes } from "@/management/storage/ids";
import { indexFromPanelId } from "@/management/storage/workspace/layout-store";
import { writeSettings } from "@/management/storage/workspace/store";
import { initializeWidgetStorage } from "@/management/widget/initialize";
import type { WidgetRecord } from "@/management/widget/record/types";
import { initializeWorkspaceStorage } from "@/management/workspace/initialize";
import type { LayoutItem } from "@/management/workspace/layout/grid-document";
import { logWorkspace } from "@/management/workspace/onboarding/flow-log";
import type {
	FinishWriteSettingsResult,
	WriteSettingsForFinish,
} from "./finish-settings-write";

const layoutCatalogRefIdsForWidgetInit = (
	layoutItems: readonly LayoutItem[],
	widgetRecords: readonly WidgetRecord[],
): string[] => {
	const widgetIdSet = new Set<string>();
	for (const w of widgetRecords) {
		const id = stripKnownIdPrefixes(w.id.trim());
		if (id.length > 0) widgetIdSet.add(id);
	}
	const out: string[] = [];
	const seen = new Set<string>();
	for (const item of layoutItems) {
		const id = stripKnownIdPrefixes(String(item.id ?? "").trim());
		if (!id || widgetIdSet.has(id) || seen.has(id)) {
			continue;
		}
		seen.add(id);
		out.push(id);
	}
	return out;
};

export type CompleteOnboardingInput = {
	panelSurfaceId: string;
	/** Persisted settings payload; `core.paths.supportRoot` (onboarding-chosen folder) is read for file paths. */
	mergedSettingsJson: string;
	initialLayoutItems: readonly LayoutItem[];
	initialWidgetRecords: readonly WidgetRecord[];
	/**
	 * Preset rows to **merge** into `presets.json` for this finish step only.
	 * Pass the onboarding import delta (e.g. `addedPresets` from `importOnboardingPresets`),
	 * not `repository.list()`  Ethe latter would rewrite the whole catalog and fan out
	 * every historical `folderPreset` into `groups.json`.
	 */
	importedPresets: readonly Preset[];
	/** Group rows for `groups.json`  Esource of truth for folder tiles (not `presets.json`). */
	addedGroupCatalogEntries?: readonly GroupCatalogEntry[];
	/**
	 * Injection point for an elevation-aware `writeSettings` wrapper. When
	 * supplied, this is used instead of the standard `writeSettings` so that
	 * Issue #29's "settings-write" path can complete via UAC/osascript
	 * elevation when the user's `supportRoot` is outside a trusted
	 * user-data root. The default is the standard `writeSettings`.
	 */
	writeSettingsImpl?: WriteSettingsForFinish;
	/**
	 * Injection point for an elevation-aware `writeSettingsPathsJson`
	 * wrapper. Same purpose as `writeSettingsImpl` but for `paths.json`.
	 */
	writeSettingsPathsJsonImpl?: (
		win: Window,
		payload: Record<string, unknown>,
	) => Promise<FinishWriteSettingsResult>;
};

/**
 * Complete onboarding by persisting settings, presets, and initial workspace state.
 */
export const completeOnboardingStorage = async (
	win: Window,
	input: CompleteOnboardingInput,
): Promise<void> => {
	const {
		panelSurfaceId,
		mergedSettingsJson,
		initialLayoutItems,
		initialWidgetRecords,
		importedPresets,
		addedGroupCatalogEntries = [],
		writeSettingsImpl,
		writeSettingsPathsJsonImpl,
	} = input;

	const supportRoot = readSupportRootFromSettingsJson(mergedSettingsJson);
	if (!supportRoot) {
		throw new Error(
			"completeOnboardingStorage: mergedSettingsJson must include core.paths.supportRoot (support root)",
		);
	}

	logWorkspace("completeOnboardingStorage:start", {
		panelSurfaceId,
		supportRoot,
		layoutItemCount: initialLayoutItems.length,
		widgetRecordCount: initialWidgetRecords.length,
		importedPresetCount: importedPresets.length,
		addedGroupCatalogEntryCount: addedGroupCatalogEntries.length,
		sampleLayoutIds: initialLayoutItems.slice(0, 8).map((i) => ({
			id: i.id,
		})),
	});

	// Write settings JSON (elevation-aware when an injected wrapper is supplied)
	if (writeSettingsImpl) {
		await writeSettingsImpl(win, mergedSettingsJson);
	} else {
		await writeSettings(win, mergedSettingsJson);
	}
	logWorkspace("completeOnboardingStorage:settings-written");

	// Write paths to settings/paths.json
	const parsedSettings = JSON.parse(mergedSettingsJson) as {
		core?: { paths?: Record<string, unknown> };
	};
	const pathsPayload = parsedSettings.core?.paths;
	if (pathsPayload && typeof pathsPayload === "object") {
		console.log(
			"[completeOnboardingStorage] writing settings/paths.json:",
			pathsPayload,
		);
		if (writeSettingsPathsJsonImpl) {
			await writeSettingsPathsJsonImpl(win, pathsPayload);
		} else {
			await writeSettingsPathsJson(win, pathsPayload);
		}
		logWorkspace("completeOnboardingStorage:settings-paths-written");
	} else {
		console.warn(
			"[completeOnboardingStorage] no paths payload found in settings",
		);
	}

	// Initialize widget storage
	await initializeWidgetStorage(win, {
		initialWidgets: initialWidgetRecords,
		initialLayouts: initialLayoutItems,
		nonWidgetLayoutIds: layoutCatalogRefIdsForWidgetInit(
			initialLayoutItems,
			initialWidgetRecords,
		),
	});
	logWorkspace("completeOnboardingStorage:widgets-initialized");

	// Initialize preset storage
	await initializePresetStorage(win, {
		importedPresets,
	});
	logWorkspace("completeOnboardingStorage:presets-initialized");

	await mergeGroupCatalogEntries(win, addedGroupCatalogEntries);
	logWorkspace("completeOnboardingStorage:group-catalog-merged");

	// Initialize workspace layout storage
	const index = indexFromPanelId(panelSurfaceId);
	await initializeWorkspaceStorage(win, {
		supportRoot,
		initialLayouts: {
			[index]: {
				gridCells: initialLayoutItems,
			},
		},
	});
	logWorkspace("completeOnboardingStorage:workspace-layout-written", {
		workspaceIndex: index,
		itemCount: initialLayoutItems.length,
	});
};
