import { i18n } from "@/management/i18n/index";
import { fileStemFromPath } from "@/shared/util/path";

import { fileNameFromPath } from "./state";

/**
 * Imports a file into After Effects via the host executor.
 * Handles .jsx/.jsxbin scripts, .ffx presets, plugin effects, and footage.
 */
export const importFile = async (
	filePath: string,
	hostCode: string,
	hostExecutor:
		| ((method: string, args: unknown[]) => Promise<{ value?: unknown }>)
		| null,
): Promise<string> => {
	if (hostCode !== "AEFT" || !hostExecutor) {
		throw new Error(i18n.t("common:errors.fileImportAeOnly"));
	}
	const lowerPath = filePath.toLowerCase();
	const fileName = fileNameFromPath(filePath);
	if (lowerPath.endsWith(".jsx") || lowerPath.endsWith(".jsxbin")) {
		await hostExecutor("runScriptFile", [filePath]);
		return i18n.t("widgets:directoryBrowser.actions.ranScript", {
			name: fileName,
			defaultValue: "Ran script: {{name}}",
		});
	}
	if (lowerPath.endsWith(".ffx")) {
		await hostExecutor("applyPreset", [
			filePath,
			{
				undoGroupName: i18n.t(
					"widgets:directoryBrowser.actions.undoGroup.applyPreset",
					{ defaultValue: "Ty Plus: Apply Preset" },
				),
			},
		]);
		return i18n.t("widgets:directoryBrowser.actions.appliedPreset", {
			name: fileName,
			defaultValue: "Applied preset: {{name}}",
		});
	}
	if (lowerPath.endsWith(".aex") || lowerPath.endsWith(".plugin")) {
		const effectId = fileStemFromPath(filePath).trim();
		if (!effectId) {
			throw new Error(`effectId is required for plugin: ${fileName}`); // i18n-exempt: internal diagnostic — not rendered as UI copy
		}
		await hostExecutor("applyEffectByMatchName", [
			effectId,
			{
				undoGroupName: i18n.t(
					"widgets:directoryBrowser.actions.undoGroup.applyEffect",
					{ defaultValue: "Ty Plus: Apply effect" },
				),
			},
		]);
		return i18n.t("widgets:directoryBrowser.actions.appliedEffect", {
			name: fileName,
			defaultValue: "Applied effect: {{name}}",
		});
	}
	await hostExecutor("addFootage", [
		{
			filePath,
			toComp: true,
			undoGroupName: i18n.t(
				"widgets:directoryBrowser.actions.undoGroup.addFootage",
				{ defaultValue: "Ty Plus: Add Footage" },
			),
		},
	]);
	return i18n.t("widgets:directoryBrowser.actions.importedFootage", {
		name: fileName,
		defaultValue: "Imported footage: {{name}}",
	});
};
