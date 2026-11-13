/**
 * CEP manifest file preset data for quick bar.
 * Coordinates with `management/dialog/modeless` (CEP Modeless) and `DialogRoot`.
 *
 * Add-preset tool entries share the same default `extensionId` (first pool slot);
 * actual opens use `allocatePresetAddToolExtensionId()` so multiple modeless
 * windows are possible. @see add-dialog-pool.ts
 */
import { tyPlusExtensionId } from "@/management/ae/cep/extension-id";

export type ToolDialogEntry = {
	surfaceId: string;
	extensionId: string;
	titleEn: string;
	/** Quick bar short label */
	labelEn: string;
	/** Shell body text (explicitly not migrated yet) */
	leadEn: string;
};

/** manifest sizes are bound to `WORKSPACE_SHELL_MODELESS_FRAME` (`build-cep-dev` / `cep-dialog-layout`) */
export const TOOL_DIALOG_REGISTRY: readonly ToolDialogEntry[] = [
	{
		surfaceId: "dialog-preset-add",
		extensionId: tyPlusExtensionId("dialog-preset-add"),
		titleEn: "Add catalog preset from path",
		labelEn: "Catalog path",
		leadEn:
			"Register a preset in the local catalog from a file path (same catalog model as other presets; not a separate file-preset type).",
	},
	{
		surfaceId: "dialog-preset-add-folder",
		extensionId: tyPlusExtensionId("dialog-preset-add"),
		titleEn: "Add preset group",
		labelEn: "Group",
		leadEn:
			"Create a catalog preset group from a folder scan or explicit preset IDs.",
	},
	{
		surfaceId: "dialog-animation-preset",
		extensionId: tyPlusExtensionId("dialog-preset-add"),
		titleEn: "Add Animation Preset",
		labelEn: "Animation",
		leadEn:
			"Create an animation preset with keyframe or expression-based behavior.",
	},
	{
		surfaceId: "dialog-layer-comp-preset",
		extensionId: tyPlusExtensionId("dialog-preset-add"),
		titleEn: "Add Layer/Comp Preset",
		labelEn: "Layer/Comp",
		leadEn: "Create a layer or composition preset.",
	},
	{
		surfaceId: "dialog-code-preset",
		extensionId: tyPlusExtensionId("dialog-preset-add"),
		titleEn: "Add Code Preset",
		labelEn: "Code",
		leadEn: "Create a code-based preset with ExtendScript or expression.",
	},
	{
		surfaceId: "dialog-preset-create",
		extensionId: tyPlusExtensionId("dialog-preset-add"),
		titleEn: "Create Preset",
		labelEn: "Create",
		leadEn:
			"Create a local preset from dialog metadata without coupling the dialog route to a preset file type.",
	},
	{
		surfaceId: "dialog-footage-preset",
		extensionId: tyPlusExtensionId("dialog-preset-add"),
		titleEn: "Add Footage Preset",
		labelEn: "Footage",
		leadEn: "Create a footage import preset.",
	},
	{
		surfaceId: "dialog-import-preset",
		extensionId: tyPlusExtensionId("dialog-preset-add"),
		titleEn: "Add Import Preset",
		labelEn: "Import",
		leadEn: "Create an import preset for file ingestion.",
	},
] as const;

const bySurface = new Map(
	TOOL_DIALOG_REGISTRY.map((e) => [e.surfaceId, e] as const),
);

export function getPresetToolDialogEntry(
	surfaceId: string,
): ToolDialogEntry | undefined {
	return bySurface.get(surfaceId);
}

export function isPresetToolDialogSurfaceId(surfaceId: string): boolean {
	return bySurface.has(surfaceId);
}
