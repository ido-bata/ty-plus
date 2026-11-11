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
		const effectId = fileStemFromPath(filePath).trim();
		if (!effectId) {
			throw new Error(`effectId is required for plugin: ${fileName}`);
		}
		await hostExecutor("applyEffectByMatchName", [effectId]);
		return `Applied effect: ${fileName}`;
	}
	await hostExecutor("addFootage", [{ filePath, toComp: true }]);
	return `Imported footage: ${fileName}`;
};
