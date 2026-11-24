/**
 * Imports a file into After Effects via the host executor.
 * Handles .jsx/.jsxbin scripts, .ffx presets, plugin effects, and footage.
 *
 * Plugin effects resolve their matchName through the candidates cache
 * (PICA resource) — the filename stem is not a reliable matchName.
 */

import { i18n } from "@/management/i18n/index";
import { resolveEffectMatchName } from "@/management/storage/candidates-cache/plugin-match-name";
import { getCandidatesSnapshot } from "@/management/storage/candidates-cache/runtime";

const fileNameFromPath = (value: string): string =>
	value.split(/[\\/]/).pop() ?? value;

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
		});
	}
	if (lowerPath.endsWith(".ffx")) {
		await hostExecutor("applyPreset", [
			filePath,
			{
				undoGroupName: i18n.t(
					"widgets:directoryBrowser.actions.undoGroup.applyPreset",
				),
				messages: {
					openComposition: i18n.t(
						"widgets:directoryBrowser.actions.errors.openComposition",
					),
					addLayerOrSelect: i18n.t(
						"widgets:directoryBrowser.actions.errors.addLayerOrSelect",
					),
				},
			},
		]);
		return i18n.t("widgets:directoryBrowser.actions.appliedPreset", {
			name: fileName,
		});
	}
	if (lowerPath.endsWith(".aex") || lowerPath.endsWith(".plugin")) {
		const snapshot = getCandidatesSnapshot();
		const matchName = resolveEffectMatchName(
			filePath,
			snapshot?.pluginEffects ?? [],
		);
		await hostExecutor("applyEffectByMatchName", [
			matchName,
			{
				undoGroupName: i18n.t(
					"widgets:directoryBrowser.actions.undoGroup.applyEffect",
				),
				messages: {
					selectLayer: i18n.t(
						"widgets:directoryBrowser.actions.errors.selectLayerForEffect",
					),
				},
			},
		]);
		return i18n.t("widgets:directoryBrowser.actions.appliedEffect", {
			name: fileName,
		});
	}
	await hostExecutor("addFootage", [
		{
			filePath,
			toComp: true,
			undoGroupName: i18n.t(
				"widgets:directoryBrowser.actions.undoGroup.addFootage",
			),
		},
	]);
	return i18n.t("widgets:directoryBrowser.actions.importedFootage", {
		name: fileName,
	});
};
