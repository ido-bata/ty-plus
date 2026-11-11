/**
 * Re-export workspace store functions from the canonical location.
 * This file exists for backward compatibility with imports from ./storage/workspace-store
 */

export {
	clearWorkspacePanelStateFromSettingsJson,
	mergeGroupPresetLayoutIntoSettingsJson,
	movePresetPlacement,
	normalizeWorkspacePanelSettingsKey,
	readPanelPresetIdsFromSettingsJson,
	readPresetsJson,
	readPresetsJsonText,
	readSettings,
	readThemeCss,
	saveControlPanelState,
	writePresetsJson,
	writeSettings,
	writeThemeCss,
} from "@/management/workspace/persistence/store";
export { resolveSettingsRoot } from "@/management/workspace/support-root";
