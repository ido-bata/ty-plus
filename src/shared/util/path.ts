/**
 * Path normalization utilities shared by function and management layers.
 * Placed here to avoid management→function cross-boundary imports.
 */

export const normalizePathLike = (value: string): string =>
	value.trim().replace(/[\\/]+$/, "");

export const normalizePathKey = (value: string): string =>
	value.trim().replaceAll("\\", "/").toLowerCase();

export const fileStemFromPath = (value: string): string => {
	const fileName = value.split(/[\\/]/).pop() ?? value;
	const dot = fileName.lastIndexOf(".");
	return dot > 0 ? fileName.slice(0, dot) : fileName;
};

function pathIsWithin(candidatePath: string, folderPath: string): boolean {
	const file = normalizePathKey(candidatePath).replace(/\/+$/, "");
	const folder = normalizePathKey(folderPath).replace(/\/+$/, "");
	if (!file || !folder) {
		return false;
	}
	return file === folder || file.startsWith(`${folder}/`);
}
