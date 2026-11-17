import { getCandidatesSnapshot } from "@/management/storage/candidates-cache/runtime";
import { resolveEffectMatchName } from "@/management/storage/candidates-cache/plugin-match-name";

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
		throw new Error(
			"File import is currently available only in After Effects.",
		);
	}
	const lowerPath = filePath.toLowerCase();
	const fileName = fileNameFromPath(filePath);
	if (lowerPath.endsWith(".jsx") || lowerPath.endsWith(".jsxbin")) {
		await hostExecutor("runScriptFile", [filePath]);
		return `Ran script: ${fileName}`;
	}
	if (lowerPath.endsWith(".ffx")) {
		await hostExecutor("applyPreset", [filePath]);
		return `Applied preset: ${fileName}`;
	}
	if (lowerPath.endsWith(".aex") || lowerPath.endsWith(".plugin")) {
		// The filename stem is NOT a reliable matchName — After Effects
		// stores it in the plugin's PICA resource. Resolve through the
		// candidates cache like the preset pipeline does (issue #191).
		const snapshot = getCandidatesSnapshot();
		const matchName = resolveEffectMatchName(
			filePath,
			snapshot?.pluginEffects ?? [],
		);
		await hostExecutor("applyEffectByMatchName", [matchName]);
		return `Applied effect: ${fileName}`;
	}
	await hostExecutor("addFootage", [{ filePath, toComp: true }]);
	return `Imported footage: ${fileName}`;
};
