/**
 * Workspace Shell Dialog Extension IDs  ENOT for openDialog() callers
 *
 * Defines extension IDs for workspace shell modeless dialogs (presets, messages,
 * settings, etc.). These are NOT used by openDialog() in dialog-manager.ts.
 *
 * AUTHORITY MODEL:
 * - openDialog() callers ↁEuse DIALOG_EXTENSION_IDS from dialog-extensions.ts
 * - openPresetToolSurface() callers ↁEuse TOOL_DIALOG_REGISTRY from preset-registry.ts
 * - Workspace shell modeless dialogs ↁEuse TY_PLUS_DIALOG_EXTENSION from this file
 *
 * This separation exists because workspace shell dialogs are opened via different
 * mechanisms (resolveWorkspaceShellDialogExtensionId, resolveDialogExtensionIdForOpen)
 * and do not go through the modal dialog manager.
 *
 * @see dialog-extensions.ts::DIALOG_EXTENSION_IDS  Eauthority for openDialog() path
 * @see preset-registry.ts::TOOL_DIALOG_REGISTRY  Eauthority for preset tool surfaces
 */

import { allocatePresetAddToolExtensionId } from "@/management/preset/add-dialog-pool";
import {
	getPresetToolDialogEntry,
	isPresetToolDialogSurfaceId,
} from "@/management/preset/registry";

/** CEP Extension Id (matches the `Extension Id` in `CSXS/manifest.xml`) */
export const TY_PLUS_DIALOG_EXTENSION = {
	probe: "app.ty-plus.dialog-probe",
	presets: "app.ty-plus.dialog-presets",
	presetLibrary: "app.ty-plus.dialog-preset-library",
	messages: "app.ty-plus.dialog-messages",
	settings: "app.ty-plus.dialog-settings",
	debugConsole: "app.ty-plus.debug-console",
	widgetSelector: "app.ty-plus.dialog-widget-selector",
	backgroundPanel: "app.ty-plus.dialog-background-panel",
} as const;

export type ToolDialogKind =
	| "presets"
	| "presetLibrary"
	| "messages"
	| "settings";

/** Presets / Messages / Settings / Preset library surfaceId -> Extension Id */
export function resolveWorkspaceShellDialogExtensionId(
	surfaceId: string,
): string {
	switch (surfaceId) {
		case "dialog-presets":
			return TY_PLUS_DIALOG_EXTENSION.presets;
		case "dialog-preset-library":
			return TY_PLUS_DIALOG_EXTENSION.presetLibrary;
		case "dialog-messages":
			return TY_PLUS_DIALOG_EXTENSION.messages;
		case "dialog-settings":
			return TY_PLUS_DIALOG_EXTENSION.settings;
		case "dialog-background-panel":
			return TY_PLUS_DIALOG_EXTENSION.backgroundPanel;
		default:
			return "";
	}
}

/** Modeless surface id → canonical extension id (telemetry / `CepContext`). */
export function resolveWorkspaceModelessExtensionId(surfaceId: string): string {
	if (isPresetToolDialogSurfaceId(surfaceId)) {
		return getPresetToolDialogEntry(surfaceId)?.extensionId ?? "";
	}
	return resolveWorkspaceShellDialogExtensionId(surfaceId);
}

export function tyPlusWorkspaceToolDialogId(kind: ToolDialogKind): string {
	switch (kind) {
		case "presets":
			return TY_PLUS_DIALOG_EXTENSION.presets;
		case "presetLibrary":
			return TY_PLUS_DIALOG_EXTENSION.presetLibrary;
		case "messages":
			return TY_PLUS_DIALOG_EXTENSION.messages;
		case "settings":
			return TY_PLUS_DIALOG_EXTENSION.settings;
		default: {
			const _x: never = kind;
			return _x;
		}
	}
}

/** Maps surfaceId passed by widgets etc. in `dialog.xxx` format to manifest id */
const WIDGET_DIALOG_SURFACE_ALIASES: Record<string, string> = {
	"dialog.presets": "dialog-presets",
	"dialog.presetLibrary": "dialog-preset-library",
	"dialog.preset-library": "dialog-preset-library",
	"dialog.messages": "dialog-messages",
	"dialog.settings": "dialog-settings",
};

function normalizeWidgetDialogSurfaceId(raw: string): string {
	const t = raw.trim();
	const mapped = WIDGET_DIALOG_SURFACE_ALIASES[t];
	if (mapped) {
		return mapped;
	}
	if (t.includes(".") && !t.includes("/")) {
		return t.replace(/\./g, "-");
	}
	return t;
}

/** Extension Id opened from `openDialog(surfaceId)` (null on failure) */
export function resolveDialogExtensionIdForOpen(
	rawSurfaceId: string,
): string | null {
	const surfaceId = normalizeWidgetDialogSurfaceId(rawSurfaceId);
	if (isPresetToolDialogSurfaceId(surfaceId)) {
		if (!getPresetToolDialogEntry(surfaceId)) {
			return null;
		}
		return allocatePresetAddToolExtensionId();
	}
	const shell = resolveWorkspaceShellDialogExtensionId(surfaceId);
	if (shell) {
		return shell;
	}
	if (surfaceId === "debug-console") {
		return TY_PLUS_DIALOG_EXTENSION.debugConsole;
	}
	if (surfaceId === "dialog-probe") {
		return TY_PLUS_DIALOG_EXTENSION.probe;
	}
	if (surfaceId === "dialog-widget-selector") {
		return TY_PLUS_DIALOG_EXTENSION.widgetSelector;
	}
	return null;
}
